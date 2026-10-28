"use server";
import { revalidatePath } from "next/cache";
import { assertViewer, type Viewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { approvalBlocker, loadWeek, weekLocked } from "@/lib/data";
import { addDays, fmtDay, isDate, zonedToUtc } from "@/lib/time";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const KINDS = ["clock_in", "clock_out", "break_start", "break_end"];
const manager = () => assertViewer(["manager", "admin"]);

class Refused extends Error {}

function done(message?: string) {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

function fail(e: unknown): ActionResult {
  if (e instanceof Refused) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message === "Not allowed" ? "You don't have access to do that." : "That didn't save. Try again." };
}

/** Managers can't change their own hours or an administrator's; administrators can change anyone's. */
async function mayChange(v: Viewer, employeeId: string) {
  const { data } = await db().from("employees").select("id, company_id, role").eq("id", employeeId).maybeSingle();
  if (!data || data.company_id !== v.company.id) throw new Error("Not allowed");
  if (v.role !== "admin" && (data.id === v.employee.id || data.role === "admin")) {
    throw new Refused(data.id === v.employee.id ? "You can't change or approve your own hours. Ask another manager or an administrator." : "Only an administrator can change an administrator's hours.");
  }
}

/** Approved weeks are locked: reopen the week first. */
async function assertUnlocked(v: Viewer, employeeId: string, ...times: (Date | string)[]) {
  for (const t of times) {
    const week = await weekLocked(v.company, employeeId, t);
    if (week) throw new Refused(`The week of ${fmtDay(week)} is approved. Reopen it first (with a reason) to make changes.`);
  }
}

async function eventFor(v: Viewer, id: string) {
  const { data } = await db().from("clock_events").select("id, company_id, employee_id, occurred_at").eq("id", id).maybeSingle();
  if (!data || data.company_id !== v.company.id) throw new Error("Not allowed");
  await mayChange(v, data.employee_id);
  return data;
}

function readWhen(v: Viewer, form: FormData) {
  const date = String(form.get("date") ?? ""), time = String(form.get("time") ?? "");
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Refused("Enter a valid date and time.");
  const at = zonedToUtc(date, time, v.company.timezone);
  if (at.getTime() > Date.now() + 60_000) throw new Refused("The time can't be in the future.");
  return at;
}

function readReason(form: FormData, what: string) {
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) throw new Refused(`Give a reason for ${what}.`);
  return reason;
}

export async function editEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id")), kind = String(form.get("kind"));
    if (!KINDS.includes(kind)) throw new Refused("Pick what kind of event this is.");
    const reason = readReason(form, "the change");
    const at = readWhen(v, form);
    const ev = await eventFor(v, id);
    await assertUnlocked(v, ev.employee_id, ev.occurred_at, at);
    const { error } = await db().rpc("correct_event", { p_event_id: id, p_kind: kind, p_occurred_at: at.toISOString(), p_reason: reason, p_by: v.employee.id });
    if (error) throw error;
    return done("Correction saved.");
  } catch (e) { return fail(e); }
}

export async function addEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const employeeId = String(form.get("employee_id")), kindIn = String(form.get("kind"));
    const paid = kindIn === "rest_start";
    const kind = paid ? "break_start" : kindIn;
    if (!KINDS.includes(kind)) throw new Refused("Pick what kind of event to add.");
    const reason = readReason(form, "adding it");
    const at = readWhen(v, form);
    await mayChange(v, employeeId);
    await assertUnlocked(v, employeeId, at);
    const { error } = await db().rpc("add_event", { p_employee_id: employeeId, p_kind: kind, p_occurred_at: at.toISOString(), p_reason: reason, p_by: v.employee.id, p_paid_break: paid });
    if (error) throw error;
    return done("Event added.");
  } catch (e) { return fail(e); }
}

export async function voidEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id"));
    const reason = readReason(form, "removing it");
    const ev = await eventFor(v, id);
    await assertUnlocked(v, ev.employee_id, ev.occurred_at);
    const { error } = await db().rpc("void_event", { p_event_id: id, p_reason: reason, p_by: v.employee.id });
    if (error) throw error;
    return done("Event removed.");
  } catch (e) { return fail(e); }
}

export async function resolveFlag(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const id = String(form.get("id"));
    const note = String(form.get("reason") ?? "").trim();
    if (!note) throw new Refused("Add a short note on why it's fine.");
    const ev = await eventFor(v, id);
    await assertUnlocked(v, ev.employee_id, ev.occurred_at);
    const { error } = await db().rpc("resolve_flag", { p_event_id: id, p_note: note, p_by: v.employee.id });
    if (error) throw error;
    return done("Marked as OK.");
  } catch (e) { return fail(e); }
}

/**
 * Approve one or more employees' weeks. Each employee_id comes with the content hash of the week
 * the manager was looking at ("<id>:<hash>"); if anything changed since, that one is refused.
 */
export async function approveWeek(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const week = String(form.get("week"));
    const seen = new Map(form.getAll("employee").map(String).map(x => x.split(":") as [string, string]));
    if (!isDate(week) || !seen.size) throw new Refused("Nothing to approve.");
    for (const id of seen.keys()) await mayChange(v, id);

    const weeks = (await loadWeek(v.company, week)).filter(w => seen.has(w.employee.id));
    const problems: string[] = [];
    const rows = [];
    for (const w of weeks) {
      const blocker = approvalBlocker(w);
      if (blocker) { problems.push(`${w.employee.full_name}: ${blocker}`); continue; }
      if (w.contentHash !== seen.get(w.employee.id)) { problems.push(`${w.employee.full_name}: changed since you opened the page; reload and check`); continue; }
      if (w.approved) continue;
      rows.push({
        company_id: v.company.id, employee_id: w.employee.id, period_start: week, period_end: addDays(week, 6),
        worked_minutes: w.totals.workedMinutes, break_minutes: w.totals.breakMinutes, shift_count: w.totals.shiftCount,
        minutes_by_category: w.totals.byCategory, content_hash: w.contentHash, approved_by: v.employee.id,
      });
    }
    if (rows.length) {
      // Replace an outdated approval ("changed since") by revoking it first; history keeps both.
      const ids = rows.map(r => r.employee_id);
      const { error: revokeError } = await db().from("timesheet_approvals")
        .update({ revoked_at: new Date().toISOString(), revoked_by: v.employee.id, revoke_reason: "Hours changed; approved again" })
        .eq("company_id", v.company.id).eq("period_start", week).in("employee_id", ids).is("revoked_at", null);
      if (revokeError) throw revokeError;
      const { error } = await db().from("timesheet_approvals").insert(rows);
      if (error) throw error;
    }
    if (problems.length) {
      revalidatePath("/", "layout");
      return { ok: false, error: `${rows.length ? `Approved ${rows.length}. ` : ""}Not approved: ${problems.join("; ")}.` };
    }
    return done(rows.length === 1 ? "Week approved." : `${rows.length} weeks approved.`);
  } catch (e) { return fail(e); }
}

/** Reopen an approved week so it can be corrected. The approval stays in the history, marked revoked. */
export async function reopenWeek(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const v = await manager();
    const employeeId = String(form.get("employee_id")), week = String(form.get("week"));
    const reason = readReason(form, "reopening the week");
    await mayChange(v, employeeId);
    const { error } = await db().from("timesheet_approvals")
      .update({ revoked_at: new Date().toISOString(), revoked_by: v.employee.id, revoke_reason: reason })
      .eq("company_id", v.company.id).eq("employee_id", employeeId).eq("period_start", week).is("revoked_at", null);
    if (error) throw error;
    return done("Week reopened. It needs approving again.");
  } catch (e) { return fail(e); }
}
