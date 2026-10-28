import "server-only";
import { createHash } from "node:crypto";
import { db } from "./supabase/server";
import type { Company } from "./auth";
import { buildShifts, shiftsInWeek, totals, type ClockEvent, type Holiday, type Shift, type WeekTotals } from "./shifts";
import { addDays, isDate, localDate, weekBounds, weekStartOf } from "./time";

const EVENT_COLS = "id, employee_id, kind, occurred_at, source, flag, flag_resolved_at, replaces_id, location_id, kiosk_id, paid_break";
// Rows per request. Must not exceed the project's PostgREST max_rows (Supabase default 1000),
// or a short page would be read as the last one.
const PAGE = 1000;

/** Throws on a database error, so an outage shows the error page instead of empty data. */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return (res.data ?? []) as NonNullable<T>;
}

export function currentWeekStart(c: Company, now = new Date()) {
  return weekStartOf(localDate(now, c.timezone), c.week_start);
}

/** The week in ?week=, snapped to the company's week start, or the current week. */
export function pickWeek(c: Company, param: string | string[] | undefined) {
  return typeof param === "string" && isDate(param) ? weekStartOf(param, c.week_start) : currentWeekStart(c);
}

/** Shifts can cross a week boundary; fetch a margin either side, at least as long as the longest shift. */
export const marginDays = (c: Company) => Math.ceil(c.long_shift_hours / 24) + 1;

export async function activeEvents(companyId: string, from: Date, to: Date, employeeId?: string): Promise<ClockEvent[]> {
  const all: ClockEvent[] = [];
  for (let page = 0; ; page++) {
    let q = db().from("clock_events").select(EVENT_COLS)
      .eq("company_id", companyId).eq("status", "active")
      .gte("occurred_at", from.toISOString()).lt("occurred_at", to.toISOString())
      .order("occurred_at").order("id") // id makes the order unique, so pages never skip or repeat rows
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const data = must(await q) as ClockEvent[];
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

export async function holidaysBetween(companyId: string, fromDate: string, toDate: string): Promise<Holiday[]> {
  return must(await db().from("public_holidays").select("date, from_time, to_time, name")
    .eq("company_id", companyId).gte("date", fromDate).lte("date", toDate).order("date"));
}

export type Approval = {
  id: string; employee_id: string; period_start: string; worked_minutes: number; break_minutes: number;
  shift_count: number; content_hash: string; approved_at: string; approved_by: string;
};

export type EmployeeWeek = {
  employee: { id: string; full_name: string; role: string; active: boolean; payroll_code: string | null; employment_type: string | null };
  shifts: Shift[];
  totals: WeekTotals;
  approval: Approval | null;
  /** Fingerprint of every event in the week's shifts; an approval is valid only while it matches. */
  contentHash: string;
  /** Approved, and nothing has changed since. */
  approved: boolean;
  flagsOpen: number;
};

export function contentHash(shifts: Shift[]) {
  const lines = shifts.flatMap(s => s.events).map(e => `${e.id}|${e.kind}|${e.occurred_at}|${e.paid_break ?? ""}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32);
}

export async function loadWeek(c: Company, weekStart: string, employeeId?: string, now = new Date()): Promise<EmployeeWeek[]> {
  const { from, to } = weekBounds(weekStart, c.timezone);
  const m = marginDays(c);
  let eq = db().from("employees").select("id, full_name, role, active, payroll_code, employment_type").eq("company_id", c.id).order("full_name");
  if (employeeId) eq = eq.eq("id", employeeId);
  let aq = db().from("timesheet_approvals").select("id, employee_id, period_start, worked_minutes, break_minutes, shift_count, content_hash, approved_at, approved_by")
    .eq("company_id", c.id).eq("period_start", weekStart).is("revoked_at", null);
  if (employeeId) aq = aq.eq("employee_id", employeeId);

  const [events, emps, approvals, holidays] = await Promise.all([
    activeEvents(c.id, new Date(from.getTime() - m * 86400_000), new Date(to.getTime() + m * 86400_000), employeeId),
    eq.then(must),
    aq.then(must),
    holidaysBetween(c.id, addDays(weekStart, -m), addDays(weekStart, 7 + m)),
  ]);

  const byEmp = new Map<string, ClockEvent[]>();
  for (const e of events) (byEmp.get(e.employee_id) ?? byEmp.set(e.employee_id, []).get(e.employee_id)!).push(e);

  return emps
    .map(emp => {
      const shifts = shiftsInWeek(buildShifts(byEmp.get(emp.id) ?? [], c, now, holidays), weekStart, c);
      const flagsOpen = shifts.flatMap(s => s.events).filter(e => e.flag && !e.flag_resolved_at).length;
      const approval = (approvals as Approval[]).find(a => a.employee_id === emp.id) ?? null;
      const hash = contentHash(shifts);
      return { employee: emp, shifts, totals: totals(shifts), flagsOpen, approval, contentHash: hash, approved: approval?.content_hash === hash };
    })
    // Inactive people only appear in weeks where they have hours.
    .filter(w => w.employee.active || w.shifts.length > 0);
}

/** Can this week be approved as it stands? Returns the reason it can't, or null. */
export function approvalBlocker(w: EmployeeWeek): string | null {
  if (w.totals.issueCount) return `${w.totals.issueCount} shift${w.totals.issueCount > 1 ? "s" : ""} to fix`;
  if (w.flagsOpen) return `${w.flagsOpen} flagged scan${w.flagsOpen > 1 ? "s" : ""} to check`;
  if (w.totals.inProgressMinutes) return "still on shift";
  if (!w.totals.shiftCount) return "no hours";
  return null;
}

/** Is the week containing this instant approved for this employee? (Approved weeks are locked.) */
export async function weekLocked(c: Company, employeeId: string, at: Date | string) {
  const week = weekStartOf(localDate(new Date(at), c.timezone), c.week_start);
  const rows = must(await db().from("timesheet_approvals").select("id")
    .eq("employee_id", employeeId).eq("period_start", week).is("revoked_at", null).limit(1));
  return rows.length > 0 ? week : null;
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export async function lastEvent(employeeId: string) {
  const { data, error } = await db().from("clock_events").select("kind, occurred_at")
    .eq("employee_id", employeeId).eq("status", "active")
    .order("occurred_at", { ascending: false }).order("created_at", { ascending: false })
    .limit(1).maybeSingle<{ kind: ClockEvent["kind"]; occurred_at: string }>();
  if (error) throw error;
  return data;
}

/** When the person last punched at a kiosk or phone (manager corrections don't count). The same
 *  rule record_punch uses for repeat scans. */
export async function lastPunch(employeeId: string) {
  const { data, error } = await db().from("clock_events").select("kind, occurred_at, created_at, paid_break")
    .eq("employee_id", employeeId).eq("status", "active").in("source", ["kiosk", "phone"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function namesById(companyId: string) {
  const data = must(await db().from("employees").select("id, full_name").eq("company_id", companyId));
  return new Map(data.map(e => [e.id, e.full_name]));
}

export async function placesById(companyId: string) {
  const [locs, kiosks] = await Promise.all([
    db().from("locations").select("id, name").eq("company_id", companyId).then(must),
    db().from("kiosks").select("id, name").eq("company_id", companyId).then(must),
  ]);
  return {
    locations: new Map(locs.map(l => [l.id, l.name])),
    kiosks: new Map(kiosks.map(k => [k.id, k.name])),
  };
}
