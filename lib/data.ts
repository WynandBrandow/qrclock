import "server-only";
import { db } from "./supabase/server";
import type { Company } from "./auth";
import { buildShifts, shiftsInWeek, totals, type ClockEvent, type Shift, type WeekTotals } from "./shifts";
import { addDays, isDate, localDate, weekBounds, weekStartOf } from "./time";

const EVENT_COLS = "id, employee_id, kind, occurred_at, source, flag, flag_resolved_at, replaces_id, location_id, kiosk_id";
// Shifts can cross a week boundary; fetch a margin either side so they pair up correctly.
const MARGIN_DAYS = 2;

export function currentWeekStart(c: Company, now = new Date()) {
  return weekStartOf(localDate(now, c.timezone), c.week_start);
}

/** The week in ?week=, snapped to the company's week start, or the current week. */
export function pickWeek(c: Company, param: string | string[] | undefined) {
  return typeof param === "string" && isDate(param) ? weekStartOf(param, c.week_start) : currentWeekStart(c);
}

export async function activeEvents(companyId: string, from: Date, to: Date, employeeId?: string): Promise<ClockEvent[]> {
  const all: ClockEvent[] = [];
  for (let page = 0; ; page++) {
    let q = db().from("clock_events").select(EVENT_COLS)
      .eq("company_id", companyId).eq("status", "active")
      .gte("occurred_at", from.toISOString()).lt("occurred_at", to.toISOString())
      .order("occurred_at").range(page * 1000, page * 1000 + 999);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data as ClockEvent[]));
    if (data.length < 1000) return all;
  }
}

export type EmployeeWeek = {
  employee: { id: string; full_name: string; role: string; active: boolean };
  shifts: Shift[];
  totals: WeekTotals;
  approval: Approval | null;
  flagsOpen: number;
};

export type Approval = {
  employee_id: string; week_start: string; worked_minutes: number; break_minutes: number;
  shift_count: number; approved_at: string; approved_by: string;
};

export async function loadWeek(c: Company, weekStart: string, employeeId?: string, now = new Date()): Promise<EmployeeWeek[]> {
  const { from, to } = weekBounds(weekStart, c.timezone);
  const events = await activeEvents(c.id,
    new Date(from.getTime() - MARGIN_DAYS * 86400_000), new Date(to.getTime() + MARGIN_DAYS * 86400_000), employeeId);

  let eq = db().from("employees").select("id, full_name, role, active").eq("company_id", c.id).order("full_name");
  if (employeeId) eq = eq.eq("id", employeeId);
  const [{ data: emps }, { data: approvals }] = await Promise.all([
    eq,
    db().from("weekly_timesheets").select("*").eq("company_id", c.id).eq("week_start", weekStart),
  ]);

  const byEmp = new Map<string, ClockEvent[]>();
  for (const e of events) (byEmp.get(e.employee_id) ?? byEmp.set(e.employee_id, []).get(e.employee_id)!).push(e);

  return (emps ?? [])
    .map(emp => {
      const shifts = shiftsInWeek(buildShifts(byEmp.get(emp.id) ?? [], c, now), weekStart, c);
      const flagsOpen = shifts.flatMap(s => s.events).filter(e => e.flag && !e.flag_resolved_at).length;
      return {
        employee: emp, shifts, totals: totals(shifts), flagsOpen,
        approval: (approvals ?? []).find(a => a.employee_id === emp.id) ?? null,
      };
    })
    // Inactive people only appear in weeks where they have hours.
    .filter(w => w.employee.active || w.shifts.length > 0);
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export async function lastEvent(employeeId: string) {
  const { data } = await db().from("clock_events").select("kind, occurred_at")
    .eq("employee_id", employeeId).eq("status", "active")
    .order("occurred_at", { ascending: false }).order("created_at", { ascending: false })
    .limit(1).maybeSingle<{ kind: ClockEvent["kind"]; occurred_at: string }>();
  return data;
}

export async function namesById(companyId: string) {
  const { data } = await db().from("employees").select("id, full_name").eq("company_id", companyId);
  return new Map((data ?? []).map(e => [e.id as string, e.full_name as string]));
}

export async function placesById(companyId: string) {
  const [{ data: locs }, { data: kiosks }] = await Promise.all([
    db().from("locations").select("id, name").eq("company_id", companyId),
    db().from("kiosks").select("id, name").eq("company_id", companyId),
  ]);
  return {
    locations: new Map((locs ?? []).map(l => [l.id as string, l.name as string])),
    kiosks: new Map((kiosks ?? []).map(k => [k.id as string, k.name as string])),
  };
}
