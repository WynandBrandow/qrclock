import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { currentKiosk, employeeByToken, firstName, logScan, renewKioskCookie, tokenFromScan } from "@/lib/kiosk";
import { lastEvent, lastPunch } from "@/lib/data";
import { actionEvent, currentState, nextActions, type Action } from "@/lib/shifts";

const ACTIONS: Action[] = ["clock_in", "clock_out", "break_start", "break_end", "rest_start"];

// Kiosk scan API.
//   { code }           → who is this and what can they do next (nothing is recorded)
//   { code, action }   → record that action
export async function POST(req: NextRequest) {
  const k = await currentKiosk();
  if (!k) return NextResponse.json({ error: "not_paired" }, { status: 401 });
  const { kiosk, company, secret } = k;

  const body = await req.json().catch(() => ({}));
  const token = typeof body.code === "string" ? tokenFromScan(body.code) : null;
  const action = ACTIONS.includes(body.action) ? (body.action as Action) : null;

  after(() => db().from("kiosks").update({ last_seen_at: new Date().toISOString() }).eq("id", kiosk.id));
  const reply = (data: object, status = 200) => renewKioskCookie(NextResponse.json(data, { status }), secret);

  const emp = token ? await employeeByToken(company.id, token) : null;
  if (!emp) {
    // Only log a rejected identify, not every frame of a bad code.
    if (!action) after(() => logScan({ company_id: company.id, kiosk_id: kiosk.id, result: "unknown", detail: token ? null : "not a QR Clock code" }));
    return reply({ error: "unknown" }, 404);
  }
  if (!emp.active) {
    if (!action) after(() => logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "inactive" }));
    return reply({ error: "inactive", name: firstName(emp.full_name) }, 403);
  }
  const name = firstName(emp.full_name);

  if (!action) {
    const [last, punch] = await Promise.all([lastEvent(emp.id), lastPunch(emp.id)]);
    // Same rule as record_punch: the latest kiosk/phone punch, by when it was recorded.
    if (punch && Date.now() - new Date(punch.created_at).getTime() < company.duplicate_window_seconds * 1000) {
      after(() => logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "duplicate" }));
      return reply({ duplicate: true, name, last: { kind: punch.kind, occurred_at: punch.occurred_at, paid_break: punch.paid_break } });
    }
    const { state, stale } = currentState(last, company);
    return reply({ name, state, stale, actions: nextActions(state, company), since: last?.occurred_at ?? null });
  }

  // Confirm: the state may have changed since identify (another kiosk, a manager correction).
  const { state } = currentState(await lastEvent(emp.id), company);
  if (!nextActions(state, company).includes(action)) return reply({ error: "changed", name }, 409);

  const { kind, paidBreak } = actionEvent(action);
  const { data: raw, error } = await db().rpc("record_punch", {
    p_employee_id: emp.id, p_kind: kind, p_source: "kiosk", p_kiosk_id: kiosk.id, p_paid_break: paidBreak,
  });
  if (error) {
    console.error("record_punch", error.message);
    return reply({ error: "failed" }, 500);
  }
  const data = raw as { ok: boolean; reason?: string; occurred_at?: string; flag?: string | null };
  if (!data.ok) {
    after(() => logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: data.reason === "duplicate" ? "duplicate" : "rejected", detail: data.reason }));
    return reply({ error: data.reason, name }, 409);
  }
  after(() => logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "ok", detail: action }));
  return reply({ ok: true, name, action, occurred_at: data.occurred_at, flag: data.flag });
}
