// Tests the database rules against the real Supabase project, in a throwaway "TEST …" company that
// is purged afterwards (through purge_test_data, the only way time records can be deleted).
// Run: npm run test:db
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { env } from "./env.mjs";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let ok = 0;
const step = async (name: string, fn: () => Promise<void>) => { await fn(); ok++; console.log("✔", name); };

const { data: co, error: coErr } = await db.from("companies").insert({ name: "TEST qrclock db test" }).select().single();
if (coErr) throw coErr;
try {
  const person = async (full_name: string, role = "employee") =>
    (await db.from("employees").insert({ company_id: co.id, full_name, role }).select().single()).data!;
  const boss = await person("TEST Boss", "manager");
  const emp = await person("TEST Worker");
  const emp2 = await person("TEST Breaker");
  assert.match(emp.qr_token, /^[A-Za-z0-9_-]{24}$/);

  const punch = async (who: { id: string }, kind: string, paid = false) =>
    (await db.rpc("record_punch", { p_employee_id: who.id, p_kind: kind, p_source: "kiosk", p_paid_break: paid })).data as Record<string, unknown>;
  // Move someone's events 10 minutes back, so the next punch is outside the repeat-scan window.
  const age = async (who: { id: string }) => assert.ifError((await db.rpc("backdate_test_events", { p_employee_id: who.id, p_seconds: 600 })).error);

  let inId = "";
  await step("clock in records an event with no flag", async () => {
    const r = await punch(emp, "clock_in");
    assert.equal(r.ok, true); assert.equal(r.flag, null);
    inId = r.event_id as string;
  });
  await step("an immediate second scan is rejected as a duplicate", async () => {
    const r = await punch(emp, "clock_out");
    assert.equal(r.ok, false); assert.equal(r.reason, "duplicate");
  });
  await age(emp);
  await step("clock out after the window is recorded", async () => {
    assert.equal((await punch(emp, "clock_out")).ok, true);
  });
  await age(emp);
  let flaggedId = "";
  await step("clocking out with no open shift is recorded and flagged", async () => {
    const r = await punch(emp, "clock_out");
    assert.equal(r.ok, true); assert.equal(r.flag, "clock_out_without_shift");
    flaggedId = r.event_id as string;
  });
  await step("a manager back-filling an event doesn't block the next real scan", async () => {
    await age(emp);
    assert.ifError((await db.rpc("add_event", { p_employee_id: emp.id, p_kind: "clock_in", p_occurred_at: new Date(Date.now() - 86400_000).toISOString(), p_reason: "back-fill", p_by: boss.id })).error);
    assert.notEqual((await punch(emp, "clock_in")).reason, "duplicate");
  });

  await step("breaks: a paid rest break is stored as paid; clock out from a break is not flagged", async () => {
    await punch(emp2, "clock_in"); await age(emp2);
    const r = await punch(emp2, "break_start", true); await age(emp2);
    const { data } = await db.from("clock_events").select("paid_break").eq("id", r.event_id).single();
    assert.equal(data!.paid_break, true);
    assert.equal((await punch(emp2, "clock_out")).flag, null);
    await age(emp2);
    assert.equal((await punch(emp2, "break_end")).flag, "break_end_without_break");
  });

  await step("a correction keeps the original and logs who, when, why and the event time", async () => {
    const at = new Date(Date.now() - 3600_000).toISOString();
    const { data: newId, error } = await db.rpc("correct_event", { p_event_id: inId, p_kind: "clock_in", p_occurred_at: at, p_reason: "test edit", p_by: boss.id });
    assert.ifError(error);
    const { data: orig } = await db.from("clock_events").select("status").eq("id", inId).single();
    const { data: repl } = await db.from("clock_events").select("status, replaces_id, source, created_by").eq("id", newId).single();
    assert.equal(orig!.status, "superseded");
    assert.deepEqual(repl, { status: "active", replaces_id: inId, source: "manager", created_by: boss.id });
    const { data: log } = await db.from("event_corrections").select("action, reason, corrected_by, before, event_time").eq("new_event_id", newId).single();
    assert.equal(log!.action, "edit"); assert.equal(log!.reason, "test edit"); assert.equal(log!.corrected_by, boss.id);
    assert.equal((log!.before as { kind: string }).kind, "clock_in");
    assert.equal(new Date(log!.event_time).toISOString(), at);
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

  await step("time records are permanent: no editing times, no deleting events, employees or corrections", async () => {
    assert.ok((await db.from("clock_events").update({ occurred_at: new Date().toISOString() }).eq("id", flaggedId)).error, "time edit must fail");
    assert.ok((await db.from("clock_events").update({ status: "active" }).eq("id", flaggedId)).error, "un-voiding must fail");
    assert.ok((await db.from("clock_events").delete().eq("id", flaggedId)).error, "delete must fail");
    assert.ok((await db.from("event_corrections").delete().eq("employee_id", emp.id)).error, "correction delete must fail");
    assert.ok((await db.from("employees").delete().eq("id", emp.id)).error, "deleting an employee with records must fail");
  });

  await step("approvals can be revoked (with a reason) but not edited or deleted", async () => {
    const { data: a, error } = await db.from("timesheet_approvals").insert({
      company_id: co.id, employee_id: emp.id, period_start: "2026-10-26", period_end: "2026-11-01",
      worked_minutes: 60, break_minutes: 0, shift_count: 1, content_hash: "x", approved_by: boss.id,
    }).select().single();
    assert.ifError(error);
    assert.ok((await db.from("timesheet_approvals").update({ worked_minutes: 999 }).eq("id", a!.id)).error, "editing must fail");
    assert.ok((await db.from("timesheet_approvals").update({ revoked_at: new Date().toISOString(), revoked_by: boss.id }).eq("id", a!.id)).error, "revoking needs a reason");
    assert.ifError((await db.from("timesheet_approvals").update({ revoked_at: new Date().toISOString(), revoked_by: boss.id, revoke_reason: "test" }).eq("id", a!.id)).error);
    assert.ok((await db.from("timesheet_approvals").delete().eq("id", a!.id)).error, "delete must fail");
  });

  await step("PIN lockout: 5 tries, then locked; parallel guesses can't get past it", async () => {
    await db.from("employees").update({ pin_hash: "scrypt:x:y" }).eq("id", emp.id);
    const tries = await Promise.all(Array.from({ length: 12 }, () => db.rpc("pin_attempt", { p_token: emp.qr_token })));
    const checked = tries.filter(t => t.data?.[0]?.pin_hash).length;
    assert.equal(checked, 5, `${checked} attempts were checked`);
    const { data } = await db.rpc("pin_attempt", { p_token: emp.qr_token });
    assert.equal(data![0].pin_hash, null); assert.ok(data![0].locked_until);
    await db.rpc("pin_succeeded", { p_employee_id: emp.id });
    const { data: after } = await db.from("employees").select("pin_failed_count, pin_locked_until").eq("id", emp.id).single();
    assert.deepEqual(after, { pin_failed_count: 0, pin_locked_until: null });
  });

  await step("an inactive employee can't punch", async () => {
    await db.from("employees").update({ active: false }).eq("id", emp.id);
    const r = await punch(emp, "clock_in");
    assert.equal(r.ok, false); assert.equal(r.reason, "inactive");
  });
  await step("breaks are refused when break tracking is off", async () => {
    await db.from("employees").update({ active: true }).eq("id", emp.id);
    await db.from("companies").update({ track_breaks: false }).eq("id", co.id);
    assert.equal((await punch(emp, "break_start")).reason, "breaks_disabled");
  });
  await step("test helpers refuse real data", async () => {
    const { data: real } = await db.from("employees").select("id").not("full_name", "like", "TEST %").limit(1).single();
    assert.ok((await db.rpc("purge_test_data", { p_employee_id: real!.id })).error);
    assert.ok((await db.rpc("backdate_test_events", { p_employee_id: real!.id, p_seconds: 1 })).error);
  });
  await step("auth settings: email sign-in on, public sign-up off", async () => {
    // Turning [auth.email] enable_signup off disables email sign-in entirely (29 Oct 2026); only
    // [auth] enable_signup must be off.
    const s = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } }).then(r => r.json());
    assert.equal(s.external?.email, true, "email sign-in must be enabled");
    assert.equal(s.disable_signup, true, "public sign-up must be disabled");
  });
  await step("the public (anon) key can read nothing and call nothing", async () => {
    for (const t of ["companies", "employees", "clock_events", "event_corrections", "kiosks", "scan_log", "timesheet_approvals", "locations", "public_holidays"] as const) {
      const { data } = await anon.from(t).select("*").limit(1);
      assert.equal(data?.length ?? 0, 0, t);
    }
    for (const [fn, args] of [["record_punch", { p_employee_id: emp.id, p_kind: "clock_in", p_source: "kiosk" }], ["pin_attempt", { p_token: emp.qr_token }], ["purge_test_data", { p_company_id: co.id }]] as const) {
      assert.ok((await anon.rpc(fn, args as never)).error, `anon must not call ${fn}`);
    }
  });
} finally {
  const { error } = await db.rpc("purge_test_data", { p_company_id: co.id });
  if (error) console.error("cleanup failed:", error.message);
  else console.log("cleaned up test company");
}
console.log(`${ok} checks passed`);
