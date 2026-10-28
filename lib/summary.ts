import "server-only";
import { db } from "./supabase/server";
import { activeEvents, currentWeekStart, loadWeek, must } from "./data";
import { buildShifts, ISSUE_LABEL, type ClockEvent } from "./shifts";
import { addDays, fmtDateTime, fmtDay } from "./time";
import { appUrl } from "./cards";
import type { Company } from "./auth";

export type SummaryItem = { title: string; lines: string[]; link: string };

const KIOSK_SILENT_MINUTES = 15;

/** What a manager should look at today. Empty when everything is fine. */
export async function buildSummary(c: Company, now = new Date()): Promise<SummaryItem[]> {
  const base = await appUrl();
  const items: SummaryItem[] = [];
  const since = new Date(now.getTime() - 3 * 86400_000);
  const [events, emps, flags, kiosks, errors] = await Promise.all([
    activeEvents(c.id, since, now),
    db().from("employees").select("id, full_name").eq("company_id", c.id).then(must),
    db().from("clock_events").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("status", "active")
      .not("flag", "is", null).is("flag_resolved_at", null),
    db().from("kiosks").select("name, last_heartbeat_at, device_secret_hash").eq("company_id", c.id).eq("active", true).then(must),
    db().from("app_errors").select("id", { count: "exact", head: true }).gte("created_at", new Date(now.getTime() - 86400_000).toISOString()),
  ]);
  const name = new Map(emps.map(e => [e.id, e.full_name]));

  // Shifts from the last three days with a missing clock-out (or clock-in).
  const byEmp = new Map<string, ClockEvent[]>();
  for (const e of events) (byEmp.get(e.employee_id) ?? byEmp.set(e.employee_id, []).get(e.employee_id)!).push(e);
  const open = [...byEmp.entries()].flatMap(([id, evs]) => buildShifts(evs, c, now).filter(s => s.issues.length)
    .map(s => `${name.get(id) ?? "Former employee"}, ${fmtDay(s.date)}: ${s.issues.map(i => ISSUE_LABEL[i]).join(", ")}`));
  if (open.length) items.push({ title: `${open.length} shift${open.length > 1 ? "s" : ""} with a missing scan`, lines: open, link: `${base}/review` });

  if (flags.count) items.push({ title: `${flags.count} flagged scan${flags.count > 1 ? "s" : ""} to check`, lines: [], link: `${base}/review` });

  // Last week's timesheets not yet approved.
  const lastWeek = addDays(currentWeekStart(c, now), -7);
  const unapproved = (await loadWeek(c, lastWeek, undefined, now)).filter(w => w.shifts.length && !w.approved);
  if (unapproved.length) {
    items.push({ title: `Last week (${fmtDay(lastWeek)}): ${unapproved.length} timesheet${unapproved.length > 1 ? "s" : ""} not approved`,
      lines: unapproved.map(w => w.employee.full_name), link: `${base}/timesheets?week=${lastWeek}` });
  }

  const silent = kiosks.filter(k => k.device_secret_hash && (!k.last_heartbeat_at || now.getTime() - new Date(k.last_heartbeat_at).getTime() > KIOSK_SILENT_MINUTES * 60_000));
  if (silent.length) {
    items.push({ title: `${silent.length} kiosk${silent.length > 1 ? "s" : ""} not responding`,
      lines: silent.map(k => `${k.name}: last check-in ${k.last_heartbeat_at ? fmtDateTime(k.last_heartbeat_at, c.timezone) : "never"}`), link: `${base}/setup/kiosks` });
  }

  if (errors.count) items.push({ title: `${errors.count} app error${errors.count > 1 ? "s" : ""} in the last 24 hours`, lines: ["Claude can look at these on request."], link: `${base}/review` });
  return items;
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function summaryEmail(c: Company, items: SummaryItem[]) {
  const subject = `QR Clock: ${items.length} thing${items.length > 1 ? "s" : ""} to check at ${c.name}`;
  const text = [`${c.name}: things to check today`, "", ...items.flatMap(i => [`• ${i.title}`, ...i.lines.map(l => `    ${l}`), `  ${i.link}`, ""]),
    "You get this because daily summaries are switched on in QR Clock (Setup → Settings)."].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;color:#0f172a;max-width:560px">
<h2 style="margin:0 0 12px">${esc(c.name)}: things to check today</h2>
${items.map(i => `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px">
<div style="font-weight:600">${esc(i.title)}</div>
${i.lines.length ? `<ul style="margin:6px 0 8px;padding-left:18px;color:#334155">${i.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
<a href="${esc(i.link)}" style="color:#0f766e">Open in QR Clock</a></div>`).join("")}
<p style="color:#64748b;font-size:12px">You get this because daily summaries are switched on in QR Clock (Setup → Settings).</p></div>`;
  return { subject, text, html };
}

export async function managerEmails(companyId: string) {
  const rows = must(await db().from("employees").select("email").eq("company_id", companyId).eq("active", true)
    .in("role", ["manager", "admin"]).not("email", "is", null));
  return rows.map(r => r.email!).filter(Boolean);
}

export async function sendEmail(to: string[], subject: string, text: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "QR Clock <noreply@ccov.co.za>", to, subject, text, html }),
  });
  if (!res.ok) throw new Error(`email failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
