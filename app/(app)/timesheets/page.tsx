import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { approvalBlocker, currentWeekStart, loadWeek, pickWeek, weekDays } from "@/lib/data";
import { addDays, decimalHours, fmtDay, fmtDayMonth, fmtMinutes, fmtWeekday } from "@/lib/time";
import { ApproveButton } from "@/components/EventControls";
import { Badge, Empty, PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "Timesheets" };

export default async function Timesheets({ searchParams }: PageProps<"/timesheets">) {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company;
  const week = pickWeek(c, (await searchParams).week);
  const days = weekDays(week);
  const rows = await loadWeek(c, week);

  // Managers can't approve their own hours or an administrator's.
  const mayApprove = (id: string, role: string) => v.role === "admin" || (id !== v.employee.id && role !== "admin");
  const ready = rows.filter(r => !r.approved && !approvalBlocker(r) && mayApprove(r.employee.id, r.employee.role));
  const sum = rows.reduce((a, r) => a + r.totals.workedMinutes, 0);

  return (
    <div>
      <PageHeader
        title="Timesheets"
        sub={<>Week of {fmtDay(week)} · {fmtMinutes(sum)} total ({decimalHours(sum)} h)</>}
        actions={<>
          <WeekPicker base="/timesheets" week={week} current={currentWeekStart(c)} label={`${fmtDay(week)} – ${fmtDay(addDays(week, 6))}`} />
          <Link className="btn-secondary" href={`/timesheets/export?week=${week}`}>Export for payroll</Link>
        </>}
      />
      {rows.length === 0 ? <Empty>No employees yet. <Link className="text-teal-700 underline" href="/setup/employees">Add your staff</Link> to get started.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium sticky left-0 bg-white">Employee</th>
                {days.map(d => <th key={d} className="px-3 py-3 font-medium text-right whitespace-nowrap">{fmtWeekday(d)}<div className="font-normal normal-case">{fmtDayMonth(d)}</div></th>)}
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const perDay = days.map(d => r.shifts.filter(s => s.date === d));
                return (
                  <tr key={r.employee.id} className="group hover:bg-slate-50">
                    <th scope="row" className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 font-normal text-left shadow-[1px_0_0_#e2e8f0]">
                      <Link className="block max-w-[9rem] sm:max-w-none truncate font-medium text-teal-700 hover:underline" title={r.employee.full_name} href={`/timesheets/${r.employee.id}?week=${week}`}>{r.employee.full_name}</Link>
                    </th>
                    {perDay.map((list, i) => {
                      const mins = list.reduce((a, s) => a + (s.inProgress ? 0 : s.workedMinutes), 0);
                      const bad = list.some(s => s.issues.length);
                      const live = list.some(s => s.inProgress);
                      return (
                        <td key={days[i]} className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${bad ? "text-red-700 font-medium" : "text-slate-700"}`}>
                          {list.length === 0 ? <span className="text-slate-400" aria-label="no shift">·</span> : live ? <Badge tone="teal">on</Badge> : bad ? <span aria-label="needs fixing">!</span> : fmtMinutes(mins)}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMinutes(r.totals.workedMinutes)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.totals.issueCount ? <Badge tone="red">{r.totals.issueCount} to fix</Badge>
                        : r.flagsOpen ? <Badge tone="amber">{r.flagsOpen} flagged</Badge>
                        : r.approval ? (r.approved ? <Badge tone="teal">Approved</Badge> : <Badge tone="amber">Changed since approval</Badge>)
                        : r.totals.inProgressMinutes ? <Badge tone="blue">On shift</Badge>
                        : r.totals.shiftCount ? <Badge>Not approved</Badge> : <span className="text-slate-500">No hours</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ready.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-slate-600">{ready.length} timesheet{ready.length > 1 ? "s" : ""} complete with no problems</span>
          <ApproveButton week={week} employees={ready.map(r => ({ id: r.employee.id, hash: r.contentHash }))} label={`Approve ${ready.length}`} />
        </div>
      )}
    </div>
  );
}
