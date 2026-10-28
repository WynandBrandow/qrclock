import { NextResponse, type NextRequest } from "next/server";
import { canManage, getViewer } from "@/lib/auth";
import { loadWeek, pickWeek } from "@/lib/data";
import { decimalHours, fmtTime } from "@/lib/time";

// Weekly hours as CSV for payroll: one row per shift, then one total row per employee.
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v || !canManage(v.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const c = v.company;
  const week = pickWeek(c, req.nextUrl.searchParams.get("week") ?? undefined);
  const rows = await loadWeek(c, week);

  const lines = [["Employee", "Date", "Clock in", "Clock out", "Break minutes", "Worked hours", "Status", "Problems"]];
  for (const r of rows) {
    for (const s of r.shifts) {
      lines.push([
        r.employee.full_name, s.date,
        s.start ? fmtTime(s.start.occurred_at, c.timezone) : "", s.end ? fmtTime(s.end.occurred_at, c.timezone) : "",
        String(s.breakMinutes), s.start && s.end ? decimalHours(s.workedMinutes) : "",
        s.inProgress ? "on shift" : "", s.issues.join(" "),
      ]);
    }
    if (r.shifts.length) {
      lines.push([r.employee.full_name, `Week of ${week}`, "", "", String(r.totals.breakMinutes), decimalHours(r.totals.workedMinutes),
        r.approval ? (r.approval.worked_minutes === r.totals.workedMinutes ? "approved" : "changed since approval") : "not approved",
        r.totals.issueCount ? `${r.totals.issueCount} shift(s) to fix` : ""]);
    }
  }
  // Quote every cell; a leading = + - @ is neutralised so spreadsheets don't run it as a formula.
  const cell = (s: string) => `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  const csv = "﻿" + lines.map(l => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="timesheets-${week}.csv"`,
      "cache-control": "no-store",
    },
  });
}
