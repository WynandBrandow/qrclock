// End-to-end check against the live site, signed in as an admin with a minted session (no email sent).
// Pairs a test kiosk, adds a test employee with a PIN, scans in and out at the kiosk (API and the
// USB-scanner keyboard path), corrects an event, approves the week, exports CSV, signs in with
// card + PIN on a phone, then deletes everything it created.
// Run: npm run verify:live -- [--base https://qrclock.vercel.app] [--email wb@ccov.co.za]
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = arg("base", "https://clock.ccov.co.za").replace(/\/$/, "");
const email = arg("email", "wb@ccov.co.za");
const out = arg("out", join(tmpdir(), "qrclock-live"));
mkdirSync(out, { recursive: true });

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL, service = env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(sbUrl, service, { auth: { persistSession: false } });
const KIOSK = "TEST kiosk e2e", WORKER = "TEST Worker e2e", PIN = "4826";

// ── Minted admin session as @supabase/ssr cookies ──
const link = await fetch(`${sbUrl}/auth/v1/admin/generate_link`, {
  method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email }),
}).then(r => r.json());
const session = await fetch(`${sbUrl}/auth/v1/verify`, {
  method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token ?? link.properties?.hashed_token }),
}).then(r => r.json());
assert.ok(session.access_token, "could not mint a session");
const value = "base64-" + Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, expires_in: session.expires_in, token_type: "bearer", user: session.user })).toString("base64url");
const cname = `sb-${new URL(sbUrl).hostname.split(".")[0]}-auth-token`, host = new URL(base).hostname;
const parts = value.match(/.{1,3180}/g);
const adminCookies = parts.length === 1 ? [{ name: cname, value, domain: host, path: "/" }] : parts.map((c, i) => ({ name: `${cname}.${i}`, value: c, domain: host, path: "/" }));

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--headless=new"] });
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", e => errors.push(`${label}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/camera|NotFoundError|Requested device|getUserMedia/i.test(m.text())
    // The kiosk steps send rejected scans on purpose (409 repeat, 404 unknown) and check the status themselves.
    && !(label === "kiosk" && /Failed to load resource: .* (404|409)/.test(m.text()))) errors.push(`${label}: ${m.text()}`); });
};
let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log("✔", name); };
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });

/** A Y4M video (Chrome's fake-camera format) of a QR code on a white card, 640×480 grey frames. */
function qrVideo(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size, W = 640, H = 480, scale = Math.floor(360 / (n + 8)), size = (n + 8) * scale;
  const ox = (W - size) / 2 | 0, oy = (H - size) / 2 | 0;
  const y = Buffer.alloc(W * H, 120); // grey background, like a room
  for (let r = 0; r < n + 8; r++) for (let c = 0; c < n + 8; c++) {
    const dark = r >= 4 && c >= 4 && r < n + 4 && c < n + 4 && qr.modules.get(r - 4, c - 4);
    for (let dy = 0; dy < scale; dy++) y.fill(dark ? 16 : 235, (oy + r * scale + dy) * W + ox + c * scale, (oy + r * scale + dy) * W + ox + (c + 1) * scale);
  }
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv]);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]);
}

let employeeId = null, kioskId = null;
try {
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await admin.context().addCookies(adminCookies);
  watch(admin, "admin");

  let pairLink = "";
  await step("admin adds a kiosk and creates a one-time pairing link", async () => {
    await admin.goto(`${base}/setup/kiosks`);
    const add = admin.locator("section", { has: admin.getByRole("heading", { name: "Add a kiosk" }) });
    await add.locator('input[name="name"]').fill(KIOSK);
    await add.getByRole("button", { name: "Add kiosk" }).click();
    await admin.getByRole("heading", { name: KIOSK }).waitFor();
    const card = admin.locator("section", { has: admin.getByRole("heading", { name: KIOSK }) });
    await card.getByRole("button", { name: "Pair a device" }).click();
    pairLink = await card.locator('input[aria-label="Pairing link"]').inputValue({ timeout: 15000 });
    assert.match(pairLink, /\/kiosk\/pair\?code=[A-Za-z0-9_-]{30,}/);
    kioskId = (await db.from("kiosks").select("id").eq("name", KIOSK).single()).data.id;
  });

  await step("admin adds an employee and sets a PIN", async () => {
    await admin.goto(`${base}/setup/employees`);
    await admin.locator("#full_name").fill(WORKER);
    await admin.getByRole("button", { name: "Add employee" }).click();
    await admin.getByRole("link", { name: /Open their page/ }).click();
    await admin.waitForURL(/\/setup\/employees\/[0-9a-f-]{36}$/);
    employeeId = admin.url().split("/").pop();
    await admin.locator("#pin").fill(PIN);
    await admin.getByRole("button", { name: "Set PIN" }).click();
    await admin.getByText("PIN set.").waitFor();
    await shot(admin, "employee-1280");
  });
  const { data: emp } = await db.from("employees").select("qr_token").eq("id", employeeId).single();
  const card = `${base}/q/${emp.qr_token}`;

  const kiosk = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
  watch(kiosk, "kiosk");
  const scan = body => kiosk.evaluate(async b => {
    const r = await fetch("/api/kiosk/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, ...(await r.json()) };
  }, body);

  await step("the pairing link turns the tablet into the kiosk, and works only once", async () => {
    await kiosk.goto(pairLink); // a link preview would stop here: GET only shows a confirm button
    await kiosk.getByRole("button", { name: /make this the kiosk/ }).click();
    await kiosk.waitForURL(`${base}/kiosk`);
    await kiosk.getByText(KIOSK).waitFor();
    const again = await (await browser.newContext()).newPage();
    await again.goto(pairLink);
    await again.getByRole("button", { name: /make this the kiosk/ }).click();
    await again.getByText("isn't valid any more").waitFor();
    await again.context().close();
  });

  await step("real camera path: the kiosk reads the QR code from a camera feed", async () => {
    // Chrome's fake camera plays a video file; this one shows the employee's QR card, so the
    // kiosk's own camera scanner (not the USB path) has to find and decode it.
    const video = join(out, "qr-card.y4m");
    writeFileSync(video, qrVideo(card));
    const camBrowser = await chromium.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
      args: ["--headless=new", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
    });
    try {
      const ctx = await camBrowser.newContext({ viewport: { width: 768, height: 1024 }, permissions: ["camera"] });
      await ctx.addCookies(await kiosk.context().cookies()); // the paired kiosk's device cookie
      const cam = await ctx.newPage();
      watch(cam, "camera");
      await cam.goto(`${base}/kiosk`);
      await cam.getByRole("heading", { name: "Hi TEST" }).waitFor({ timeout: 20000 });
      await shot(cam, "kiosk-camera-768");
      await cam.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await camBrowser.close();
    }
  });

  await step("scan: identify offers clock in; clock in records; an immediate rescan is a duplicate", async () => {
    let r = await scan({ code: card });
    assert.deepEqual(r.actions, ["clock_in"]);
    assert.equal(r.name, "TEST");
    r = await scan({ code: card, action: "clock_in" });
    assert.equal(r.ok, true);
    r = await scan({ code: card });
    assert.equal(r.duplicate, true);
    r = await scan({ code: card, action: "clock_out" });
    assert.equal(r.status, 409);
  });

  await step("scan: unknown codes are rejected and logged; no kiosk cookie is refused", async () => {
    assert.equal((await scan({ code: "https://example.com/q/notARealTokenAtAll123" })).status, 404);
    assert.equal((await scan({ code: "hello" })).status, 404);
    const { count } = await db.from("scan_log").select("id", { count: "exact", head: true }).eq("kiosk_id", kioskId).eq("result", "unknown");
    assert.ok(count >= 2);
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${base}/kiosk`);
    const st = await anon.evaluate(async c => (await fetch("/api/kiosk/scan", { method: "POST", body: JSON.stringify({ code: c }) })).status, card);
    assert.equal(st, 401);
    await anon.context().close();
  });

  // Move the clock-in two minutes back so the next scan is past the repeat-scan window. (Only
  // TEST employees can be backdated; records are otherwise permanent.)
  const { error: backErr } = await db.rpc("backdate_test_events", { p_employee_id: employeeId, p_seconds: 120 });
  assert.ifError(backErr);

  await step("kiosk screen: a USB scanner types the code; a second scan can't confirm it; the employee taps Clock out", async () => {
    await kiosk.reload();
    await kiosk.getByText(KIOSK).waitFor();
    await kiosk.keyboard.type(card, { delay: 5 });
    await kiosk.keyboard.press("Enter");
    await kiosk.getByRole("heading", { name: "Hi TEST" }).waitFor();
    await kiosk.getByRole("button", { name: "Start break" }).waitFor();
    await shot(kiosk, "kiosk-choose-768");
    // The audit's top bug: a second card scanned now (typed + Enter by a USB scanner) must not
    // press "Clock out" for the person on screen.
    await kiosk.keyboard.type(`${base}/q/someoneElsesCardToken12`, { delay: 5 });
    await kiosk.keyboard.press("Enter");
    await kiosk.waitForTimeout(1500);
    await kiosk.getByRole("heading", { name: "Hi TEST" }).waitFor();
    const { count: still } = await db.from("clock_events").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("kind", "clock_out");
    assert.equal(still, 0, "a scanner Enter must not confirm the previous person's action");
    await kiosk.getByRole("button", { name: "Clock out" }).click();
    await kiosk.getByRole("heading", { name: "Clocked out" }).waitFor();
    await shot(kiosk, "kiosk-done-768");
    const { data } = await db.from("clock_events").select("kind, kiosk_id").eq("employee_id", employeeId).eq("status", "active").order("occurred_at");
    assert.deepEqual(data.map(e => e.kind), ["clock_in", "clock_out"]);
    assert.equal(data[1].kiosk_id, kioskId);
  });

  await step("manager corrects the clock-in time; the original is kept and the reason logged", async () => {
    await admin.goto(`${base}/timesheets/${employeeId}`);
    await admin.getByRole("button", { name: "Edit" }).first().click();
    // Keep the same time (so the run works at any hour); a correction is still recorded.
    await admin.locator('input[name="reason"]').fill("e2e test correction");
    await admin.getByRole("button", { name: "Save correction" }).click();
    await admin.getByText("“e2e test correction”").waitFor();
    await admin.getByText("Corrected", { exact: true }).waitFor();
    const { count } = await db.from("clock_events").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("status", "superseded");
    assert.equal(count, 1);
  });

  await step("manager approves the week; the totals snapshot is stored", async () => {
    await admin.getByRole("button", { name: "Approve week" }).click();
    await admin.getByText(/Approved by/).waitFor();
    const { data } = await db.from("timesheet_approvals").select("worked_minutes, shift_count, content_hash").eq("employee_id", employeeId).is("revoked_at", null).single();
    assert.equal(data.shift_count, 1);
    assert.ok(data.worked_minutes >= 1, `worked ${data.worked_minutes}`);
    assert.match(data.content_hash, /^[0-9a-f]{32}$/);
    // The week is now locked: no Edit buttons.
    assert.equal(await admin.getByRole("button", { name: "Edit" }).count(), 0);
    await shot(admin, "timesheet-1280");
  });

  await step("timesheets grid and CSV export include the employee", async () => {
    await admin.goto(`${base}/timesheets`);
    await admin.getByRole("link", { name: WORKER }).waitFor();
    await shot(admin, "timesheets-1280");
    const res = await admin.context().request.get(`${base}/api/export`);
    assert.equal(res.status(), 200);
    assert.match(await res.text(), /TEST Worker e2e.*Approved/s);
  });

  await step("phone: scanning the card asks for the PIN; wrong PIN refused; right PIN shows own hours only", async () => {
    const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
    watch(phone, "phone");
    await phone.goto(card);
    await phone.getByRole("heading", { name: "Hi TEST" }).waitFor();
    await phone.locator("#pin").fill("1357");
    await phone.getByRole("button", { name: "See my hours" }).click();
    await phone.getByText(/Wrong PIN/).waitFor();
    await phone.locator("#pin").fill(PIN);
    await phone.getByRole("button", { name: "See my hours" }).click();
    await phone.waitForURL(`${base}/me`);
    await phone.getByText("Signed in with card").waitFor();
    await shot(phone, "me-pin-375");
    const items = await phone.locator('nav[aria-label="Main menu"] a:visible').allInnerTexts();
    assert.deepEqual(items.map(s => s.trim()), ["My hours"]);
    await phone.goto(`${base}/today`);
    // Pages stream behind a loading screen, so the redirect can land just after the first bytes.
    await phone.waitForURL(u => new URL(u).pathname === "/me", { timeout: 10000 });
    assert.equal(await phone.getByRole("heading", { name: "Today" }).count(), 0, "a card session must never see the manager page");
    assert.equal((await phone.context().request.get(`${base}/api/export`)).status(), 403);
    await phone.context().close();
  });

  await step("sign-in email link: opens on any device, Continue signs in, and the link works only once", async () => {
    // The same link the email template builds, from a server-made token (no email is sent).
    const l = await fetch(`${sbUrl}/auth/v1/admin/generate_link`, {
      method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email }),
    }).then(r => r.json());
    const link = `${base}/auth/confirm?token_hash=${l.hashed_token ?? l.properties?.hashed_token}&type=email`;
    const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
    watch(phone, "signin");
    await phone.goto(link); // a scanner's GET stops here
    await phone.getByRole("button", { name: "Continue" }).click();
    await phone.waitForURL(u => ["/today", "/me"].includes(new URL(u).pathname));
    await phone.context().close();
    const again = await (await browser.newContext()).newPage();
    await again.goto(link);
    await again.getByRole("button", { name: "Continue" }).click();
    await again.waitForURL(u => new URL(u).pathname === "/login");
    await again.getByText("didn't work").waitFor();
    await again.context().close();
  });

  assert.deepEqual(errors, [], "browser errors:\n" + errors.join("\n"));
  console.log(`${n} steps passed. Screenshots: ${out}`);
} finally {
  if (employeeId) {
    const { error } = await db.rpc("purge_test_data", { p_employee_id: employeeId });
    if (error) console.error("cleanup failed:", error.message);
  }
  if (kioskId) {
    await db.from("scan_log").delete().eq("kiosk_id", kioskId);
    await db.from("kiosks").delete().eq("id", kioskId);
  }
  const left = await db.from("employees").select("id", { count: "exact", head: true }).like("full_name", "TEST%");
  console.log(`cleaned up (test employees left: ${left.count})`);
  await browser.close();
}
