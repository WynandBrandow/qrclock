import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { currentWeekStart, loadWeek, pickWeek } from "@/lib/data";
import { addDays, fmtDay } from "@/lib/time";
import { PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "Export for payroll" };

export default async function ExportPage({ searchParams }: PageProps<"/timesheets/export">) {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company;
  const week = pickWeek(c, (await searchParams).week);
  const weeks = (await loadWeek(c, week)).filter(w => w.shifts.length);
  const approved = weeks.filter(w => w.approved).length;
  const href = (file: string, scope = "approved") => `/api/export?week=${week}&file=${file}&scope=${scope}`;

  return (
    <div className="max-w-3xl">
      <div className="text-sm mb-2"><Link className="text-teal-700 hover:underline" href={`/timesheets?week=${week}`}>← Timesheets</Link></div>
      <PageHeader title="Export for payroll"
        actions={<WeekPicker base="/timesheets/export" week={week} current={currentWeekStart(c)} label={`${fmtDay(week)} – ${fmtDay(addDays(week, 6))}`} />} />

      <div className={`rounded-lg ring-1 px-4 py-3 text-sm mb-6 ${approved === weeks.length && weeks.length ? "bg-teal-50 ring-teal-200 text-teal-900" : "bg-amber-50 ring-amber-200 text-amber-900"}`}>
        {weeks.length === 0 ? "No hours recorded this week."
          : `${approved} of ${weeks.length} timesheet${weeks.length > 1 ? "s are" : " is"} approved. Payroll files include approved timesheets only.`}
        {approved < weeks.length && weeks.length > 0 && <> <Link className="underline" href={`/timesheets?week=${week}`}>Approve the rest</Link> first, or download everything below to check.</>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Summary</h2>
          <p className="text-sm text-slate-600 mt-1 mb-4">One row per employee: paid hours split into weekday, Saturday, Sunday and public holiday, for entering into payroll.</p>
          <a className="btn-primary" href={href("summary")} aria-disabled={!approved}>Download summary (CSV)</a>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Shift detail</h2>
          <p className="text-sm text-slate-600 mt-1 mb-4">One row per shift with dates, 24-hour times, breaks and hours by day type. Keep it as the week&apos;s time record.</p>
          <a className="btn-primary" href={href("detail")}>Download detail (CSV)</a>
        </section>
      </div>

      <section className="mt-6 text-sm text-slate-600 space-y-2">
        <p>
          Hours are decimal (7.50 = 7 h 30 min), with unpaid meal breaks already taken out. Overnight shifts are split at
          midnight, so a Friday-night shift shows its Saturday hours separately. Public holidays come from{" "}
          {v.role === "admin" ? <Link className="text-teal-700 underline" href="/setup/holidays">Setup → Holidays</Link> : "Setup → Holidays"}.
        </p>
        <p>
          Checking before approval? Download everything, including unapproved and incomplete timesheets:{" "}
          <a className="text-teal-700 underline" href={href("detail", "all")}>detail</a> ·{" "}
          <a className="text-teal-700 underline" href={href("summary", "all")}>summary</a>.
        </p>
      </section>
    </div>
  );
}
