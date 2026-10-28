import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { currentKiosk, employeeByToken, firstName, logScan, tokenFromScan } from "@/lib/kiosk";
import { lastEvent } from "@/lib/data";
import { currentState, nextActions, type EventKind } from "@/lib/shifts";

// Kiosk scan API.
//   { code }         → who is this and what can they do next (nothing is recorded)
//   { code, kind }   → record that action
export async function POST(req: NextRequest) {
  const k = await currentKiosk();
  if (!k) return NextResponse.json({ error: "not_paired" }, { status: 401 });
  const { kiosk, company } = k;

  const body = await req.json().catch(() => ({}));
  const token = typeof body.code === "string" ? tokenFromScan(body.code) : null;
  const kind = typeof body.kind === "string" ? (body.kind as EventKind) : null;

  void db().from("kiosks").update({ last_seen_at: new Date().toISOString() }).eq("id", kiosk.id).then(() => {});

  const emp = token ? await employeeByToken(company.id, token) : null;
  if (!emp) {
    // Only log a rejected identify, not every frame of a bad code.
    if (!kind) await logScan({ company_id: company.id, kiosk_id: kiosk.id, result: "unknown", detail: token ? null : "not a QR Clock code" });
    return NextResponse.json({ error: "unknown" }, { status: 404 });
  }
  if (!emp.active) {
    if (!kind) await logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "inactive" });
    return NextResponse.json({ error: "inactive", name: firstName(emp.full_name) }, { status: 403 });
  }

  const last = await lastEvent(emp.id);
  const { state, stale } = currentState(last, company);
  const actions = nextActions(state, company);
  const name = firstName(emp.full_name);

  if (!kind) {
    const recent = last && Date.now() - new Date(last.occurred_at).getTime() < company.duplicate_window_seconds * 1000;
    if (recent) {
      await logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "duplicate" });
      return NextResponse.json({ duplicate: true, name, last });
    }
    return NextResponse.json({ name, state, stale, actions, since: last?.occurred_at ?? null });
  }

  if (!actions.includes(kind)) {
    return NextResponse.json({ error: "changed", name }, { status: 409 });
  }
  const { data: raw, error } = await db().rpc("record_punch", { p_employee_id: emp.id, p_kind: kind, p_source: "kiosk", p_kiosk_id: kiosk.id });
  if (error) {
    console.error("record_punch", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const data = raw as { ok: boolean; reason?: string; last_kind?: string; last_at?: string; occurred_at?: string; flag?: string | null };
  if (!data.ok) {
    await logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: data.reason === "duplicate" ? "duplicate" : "rejected", detail: data.reason });
    return NextResponse.json({ error: data.reason, name, last: data.last_at ? { kind: data.last_kind, occurred_at: data.last_at } : null }, { status: 409 });
  }
  await logScan({ company_id: company.id, kiosk_id: kiosk.id, employee_id: emp.id, result: "ok", detail: kind });
  return NextResponse.json({ ok: true, name, kind, occurred_at: data.occurred_at, flag: data.flag });
}
