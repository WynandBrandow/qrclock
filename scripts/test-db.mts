// Tests the database rules against the real Supabase project, in a throwaway company that is
// deleted afterwards. Run: npm run test:db
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let ok = 0;
const step = async (name: string, fn: () => Promise<void>) => { await fn(); ok++; console.log("✔", name); };

const { data: co, error: coErr } = await db.from("companies").insert({ name: "TEST qrclock db test" }).select().single();
if (coErr) throw coErr;
try {
  const { data: boss } = await db.from("employees").insert({ company_id: co.id, full_name: "Test Boss", role: "manager" }).select().single();
  const { data: emp } = await db.from("employees").insert({ company_id: co.id, full_name: "Test Worker" }).select().single();
  assert.ok(boss && emp);
  assert.match(emp.qr_token, /^[A-Za-z0-9_-]{24}$/);

  const punch = async (kind: string) => (await db.rpc("record_punch", { p_employee_id: emp.id, p_kind: kind, p_source: "kiosk" })).data as Record<string, unknown>;
  // Push the latest event back in time so the next punch is outside the repeat-scan window.
  const age = async () => {
    const { data: last } = await db.from("clock_events").select("id").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(1).single();
    await db.from("clock_events").update({ created_at: new Date(Date.now() - 600_000).toISOString(), occurred_at: new Date(Date.now() - 600_000).toISOString() }).eq("id", last!.id);
  };

  let inId = "";
  await step("clock in records an event with no flag", async () => {
    const r = await punch("clock_in");
    assert.equal(r.ok, true); assert.equal(r.flag, null);
    inId = r.event_id as string;
  });
  await step("an immediate second scan is rejected as a duplicate", async () => {
    const r = await punch("clock_out");
    assert.equal(r.ok, false); assert.equal(r.reason, "duplicate");
  });
  await age();
  await step("clock out after the window is recorded", async () => {
    assert.equal((await punch("clock_out")).ok, true);
  });
  await age();
  let flaggedId = "";
  await step("clocking out with no open shift is recorded and flagged", async () => {
    const r = await punch("clock_out");
    assert.equal(r.ok, true); assert.equal(r.flag, "clock_out_without_shift");
    flaggedId = r.event_id as string;
  });
  await age();
  await step("break end without a break is flagged; clock out from a break is not", async () => {
    assert.equal((await punch("break_end")).flag, "break_end_without_break");
    await age();
    // Start from a clean open shift: park the flagged event (restored below) and void the rest.
    await db.from("clock_events").update({ status: "superseded" }).eq("id", flaggedId);
    await db.from("clock_events").update({ status: "voided" }).eq("employee_id", emp.id).eq("status", "active").neq("id", inId);
    await db.from("clock_events").update({ created_at: new Date(Date.now() - 900_000).toISOString() }).eq("id", inId);
    assert.equal((await punch("break_start")).flag, null);
    await age();
    assert.equal((await punch("clock_out")).flag, null);
    await db.from("clock_events").update({ status: "active" }).eq("id", flaggedId);
  });

  await step("a correction keeps the original and logs who, when and why", async () => {
    const at = new Date(Date.now() - 3600_000).toISOString();
    const { data: newId, error } = await db.rpc("correct_event", { p_event_id: inId, p_kind: "clock_in", p_occurred_at: at, p_reason: "test edit", p_by: boss.id });
    assert.ifError(error);
    const { data: orig } = await db.from("clock_events").select("status").eq("id", inId).single();
    const { data: repl } = await db.from("clock_events").select("status, replaces_id, source, created_by").eq("id", newId).single();
    assert.equal(orig!.status, "superseded");
    assert.deepEqual(repl, { status: "active", replaces_id: inId, source: "manager", created_by: boss.id });
    const { data: log } = await db.from("event_corrections").select("action, reason, corrected_by, before").eq("new_event_id", newId).single();
    assert.equal(log!.action, "edit"); assert.equal(log!.reason, "test edit"); assert.equal(log!.corrected_by, boss.id);
    assert.equal((log!.before as { kind: string }).kind, "clock_in");
  });
  await step("an already-superseded event can't be corrected again", async () => {
    const { error } = await db.rpc("correct_event", { p_event_id: inId, p_kind: "clock_in", p_occurred_at: new Date().toISOString(), p_reason: "x", p_by: boss.id });
    assert.ok(error);
  });
  await step("a correction needs a reason", async () => {
    const { error } = await db.rpc("add_event", { p_employee_id: emp.id, p_kind: "clock_in", p_occurred_at: new Date().toISOString(), p_reason: "  ", p_by: boss.id });
    assert.ok(error);
  });
  await step("resolve a flag, then void the event", async () => {
    assert.ifError((await db.rpc("resolve_flag", { p_event_id: flaggedId, p_note: "checked", p_by: boss.id })).error);
    const { data: f } = await db.from("clock_events").select("flag_resolved_by, flag_note").eq("id", flaggedId).single();
    assert.deepEqual(f, { flag_resolved_by: boss.id, flag_note: "checked" });
    assert.ifError((await db.rpc("void_event", { p_event_id: flaggedId, p_reason: "test void", p_by: boss.id })).error);
    const { data: v } = await db.from("clock_events").select("status").eq("id", flaggedId).single();
    assert.equal(v!.status, "voided");
  });
  await step("an inactive employee can't punch", async () => {
    await db.from("employees").update({ active: false }).eq("id", emp.id);
    const r = await punch("clock_in");
    assert.equal(r.ok, false); assert.equal(r.reason, "inactive");
  });
  await step("breaks are refused when break tracking is off", async () => {
    await db.from("employees").update({ active: true }).eq("id", emp.id);
    await db.from("companies").update({ track_breaks: false }).eq("id", co.id);
    assert.equal((await punch("break_start")).reason, "breaks_disabled");
  });
  await step("the public (anon) key can read nothing and call nothing", async () => {
    for (const t of ["companies", "employees", "clock_events", "event_corrections", "kiosks", "scan_log", "weekly_timesheets", "locations"] as const) {
      const { data } = await anon.from(t).select("*").limit(1);
      assert.equal(data?.length ?? 0, 0, t);
    }
    const { error } = await anon.rpc("record_punch", { p_employee_id: emp.id, p_kind: "clock_in", p_source: "kiosk" });
    assert.ok(error, "anon must not be able to punch");
  });
} finally {
  const { error } = await db.from("companies").delete().eq("id", co.id);
  if (error) console.error("cleanup failed:", error.message);
  else console.log("cleaned up test company");
}
console.log(`${ok} checks passed`);
