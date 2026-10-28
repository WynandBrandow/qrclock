import { NextResponse, type NextRequest } from "next/server";
import { canManage, getViewer } from "@/lib/auth";
import { loadWeek, namesById, pickWeek, placesById } from "@/lib/data";
import { CATEGORIES, ISSUE_LABEL, WARNING_LABEL } from "@/lib/shifts";
import { addDays, decimalHours, localDate, localTime } from "@/lib/time";

// Payroll CSV for one pay week.
//   file=detail  (default) one row per shift
//   file=summary one row per employee, hours by day type
//   scope=approved (default) only approved, unchanged weeks; scope=all includes the rest, with a status
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v || !canManage(v.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const c = v.company, tz = c.timezone;
  const p = req.nextUrl.searchParams;
  const week = pickWeek(c, p.get("week") ?? undefined);
  const file = p.get("file") === "summary" ? "summary" : "detail";
  const all = p.get("scope") === "all";

  const [weeks, names, places] = await Promise.all([loadWeek(c, week), namesById(c.id), placesById(c.id)]);
  const rows = weeks.filter(w => w.shifts.length && (all || w.approved));
  const EMPLOYMENT: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", casual: "Casual" };
  const status = (w: (typeof rows)[number]) =>
    w.approved ? "Approved" : w.approval ? "Changed since approval" : w.totals.issueCount ? "Needs fixing" : w.totals.inProgressMinutes ? "On shift" : "Not approved";
  const hours = (m: number) => decimalHours(m);
  const catHeads = ["Weekday hours", "Saturday hours", "Sunday hours", "Public holiday hours"];

  let lines: string[][];
  if (file === "detail") {
    lines = [["Employee", "Payroll ID", "Employment", "Date in", "Time in", "Date out", "Time out", "Unpaid break minutes",
      "Paid break minutes", "Paid hours", ...catHeads, "Location", "Status", "Approved by", "Approved at", "Problems", "Warnings"]];
    for (const w of rows) {
      for (const s of w.shifts) {
        const start = s.start ? new Date(s.start.occurred_at) : null, end = s.end ? new Date(s.end.occurred_at) : null;
        const ev = s.start ?? s.end;
        const where = ev?.location_id ? places.locations.get(ev.location_id) : ev?.kiosk_id ? places.kiosks.get(ev.kiosk_id) : "";
        const complete = !!(s.start && s.end);
        lines.push([
          w.employee.full_name, w.employee.payroll_code ?? "", EMPLOYMENT[w.employee.employment_type ?? ""] ?? "",
          start ? localDate(start, tz) : "", start ? localTime(start, tz) : "",
          end ? localDate(end, tz) : "", end ? localTime(end, tz) : "",
          String(s.unpaidBreakMinutes), String(s.breakMinutes - s.unpaidBreakMinutes),
          complete ? hours(s.workedMinutes) : "",
          ...CATEGORIES.map(cat => (complete ? hours(s.byCategory[cat]) : "")),
          where ?? "", s.inProgress ? "On shift" : status(w),
          w.approved ? names.get(w.approval!.approved_by) ?? "" : "", w.approved ? `${localDate(new Date(w.approval!.approved_at), tz)} ${localTime(new Date(w.approval!.approved_at), tz)}` : "",
          s.issues.map(i => ISSUE_LABEL[i]).join("; "), s.warnings.map(x => WARNING_LABEL[x]).join("; "),
        ]);
      }
    }
  } else {
    lines = [["Employee", "Payroll ID", "Employment", "Week start", "Week end", "Paid hours", ...catHeads,
      "Unpaid break hours", "Shifts", "Status", "Approved by", "Approved at"]];
    for (const w of rows) {
      lines.push([
        w.employee.full_name, w.employee.payroll_code ?? "", EMPLOYMENT[w.employee.employment_type ?? ""] ?? "",
        week, addDays(week, 6), hours(w.totals.workedMinutes), ...CATEGORIES.map(cat => hours(w.totals.byCategory[cat])),
        hours(w.totals.unpaidBreakMinutes), String(w.totals.shiftCount), status(w),
        w.approved ? names.get(w.approval!.approved_by) ?? "" : "", w.approved ? `${localDate(new Date(w.approval!.approved_at), tz)} ${localTime(new Date(w.approval!.approved_at), tz)}` : "",
      ]);
    }
  }

  // Quote every cell; a leading = + - @ tab or CR is neutralised so spreadsheets don't run it as a formula.
  const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  const csv = "﻿" + lines.map(l => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qrclock-${file}-${week}${all ? "-all" : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
