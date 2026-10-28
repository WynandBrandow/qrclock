"use server";
import { revalidatePath } from "next/cache";
import { assertViewer, type Viewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { loadWeek } from "@/lib/data";
import { isDate, zonedToUtc } from "@/lib/time";

export type ActionResult = { ok: boolean; error?: string };

const KINDS = ["clock_in", "clock_out", "break_start", "break_end"];
const manager = () => assertViewer(["manager", "admin"]);

function done() {
  revalidatePath("/", "layout");
  return { ok: true };
}

function fail(e: unknown): ActionResult {
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message === "Not allowed" ? "You don't have access to do that." : "That didn't save. Try again." };
}

async function eventInCompany(v: Viewer, id: string) {
  const { data } = await db().from("clock_events").select("id, company_id, employee_id").eq("id", id).maybeSingle();
  if (!data || data.company_id !== v.company.id) throw new Error("Not allowed");
  return data;
}

async function employeeInCompany(v: Viewer, id: string) {
  const { data } = await db().from("employees").select("id, company_id").eq("id", id).maybeSingle();
  if (!data || data.company_id !== v.company.id) throw new Error("Not allowed");
}

function readWhen(v: Viewer, form: FormData) {
  const date = String(form.get("date") ?? ""), time = String(form.get("time") ?? "");
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = zonedToUtc(date, time, v.company.timezone);
  return at.getTime() > Date.now() + 5 * 60_000 ? "future" : at;
}

export async function editEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id")), kind = String(form.get("kind")), reason = String(form.get("reason") ?? "").trim();
    if (!KINDS.includes(kind)) return { ok: false, error: "Pick what kind of event this is." };
    if (!reason) return { ok: false, error: "Give a reason for the change." };
    const at = readWhen(v, form);
    if (!at) return { ok: false, error: "Enter a valid date and time." };
    if (at === "future") return { ok: false, error: "The time can't be in the future." };
    await eventInCompany(v, id);
    const { error } = await db().rpc("correct_event", { p_event_id: id, p_kind: kind, p_occurred_at: at.toISOString(), p_reason: reason, p_by: v.employee.id });
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}

export async function addEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const employeeId = String(form.get("employee_id")), kind = String(form.get("kind")), reason = String(form.get("reason") ?? "").trim();
    if (!KINDS.includes(kind)) return { ok: false, error: "Pick what kind of event to add." };
    if (!reason) return { ok: false, error: "Give a reason for adding it." };
    const at = readWhen(v, form);
    if (!at) return { ok: false, error: "Enter a valid date and time." };
    if (at === "future") return { ok: false, error: "The time can't be in the future." };
    await employeeInCompany(v, employeeId);
    const { error } = await db().rpc("add_event", { p_employee_id: employeeId, p_kind: kind, p_occurred_at: at.toISOString(), p_reason: reason, p_by: v.employee.id });
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}

export async function voidEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id")), reason = String(form.get("reason") ?? "").trim();
    if (!reason) return { ok: false, error: "Give a reason for removing it." };
    await eventInCompany(v, id);
    const { error } = await db().rpc("void_event", { p_event_id: id, p_reason: reason, p_by: v.employee.id });
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}

export async function resolveFlag(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id")), note = String(form.get("reason") ?? "").trim();
    if (!note) return { ok: false, error: "Add a short note on why it's fine." };
    await eventInCompany(v, id);
    const { error } = await db().rpc("resolve_flag", { p_event_id: id, p_note: note, p_by: v.employee.id });
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}

/** Approve one or more employees' weeks; stores a snapshot of the totals. */
export async function approveWeek(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const week = String(form.get("week"));
    const ids = form.getAll("employee_id").map(String);
    if (!isDate(week) || !ids.length) return { ok: false, error: "Nothing to approve." };
    const weeks = (await loadWeek(v.company, week)).filter(w => ids.includes(w.employee.id));
    const blocked = weeks.filter(w => w.totals.issueCount > 0 || w.totals.inProgressMinutes > 0);
    if (blocked.length) {
      return { ok: false, error: `Fix the open problems first: ${blocked.map(w => w.employee.full_name).join(", ")}.` };
    }
    const rows = weeks.map(w => ({
      company_id: v.company.id, employee_id: w.employee.id, week_start: week,
      worked_minutes: w.totals.workedMinutes, break_minutes: w.totals.breakMinutes, shift_count: w.totals.shiftCount,
      approved_by: v.employee.id, approved_at: new Date().toISOString(),
    }));
    const { error } = await db().from("weekly_timesheets").upsert(rows, { onConflict: "employee_id,week_start" });
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}

export async function unapproveWeek(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const { error } = await db().from("weekly_timesheets").delete()
      .eq("company_id", v.company.id).eq("employee_id", String(form.get("employee_id"))).eq("week_start", String(form.get("week")));
    if (error) throw error;
    return done();
  } catch (e) { return fail(e); }
}
