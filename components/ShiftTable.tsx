import { ISSUE_LABEL, WARNING_LABEL, type Shift } from "@/lib/shifts";
import { fmtDay, fmtMinutes, fmtTime } from "@/lib/time";
import { Badge, Empty } from "./ui";

/** One row per shift: day, in, out, breaks, worked, problems. */
export default function ShiftTable({ shifts, tz }: { shifts: Shift[]; tz: string }) {
  if (!shifts.length) return <Empty>No shifts this week.</Empty>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="px-2.5 sm:px-4 py-3 font-medium">Day</th>
            <th className="px-2.5 sm:px-4 py-3 font-medium">In</th>
            <th className="px-2.5 sm:px-4 py-3 font-medium">Out</th>
            <th className="px-2.5 sm:px-4 py-3 font-medium hidden sm:table-cell">Breaks</th>
            <th className="px-2.5 sm:px-4 py-3 font-medium text-right">Worked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shifts.map(sh => (
            <tr key={sh.key} className="align-top">
              <td className="px-2.5 sm:px-4 py-3 whitespace-nowrap font-medium text-slate-800">{fmtDay(sh.date)}</td>
              <td className="px-2.5 sm:px-4 py-3 whitespace-nowrap">{sh.start ? fmtTime(sh.start.occurred_at, tz) : <span className="text-red-700">missing</span>}</td>
              <td className="px-2.5 sm:px-4 py-3 whitespace-nowrap">
                {sh.end ? fmtTime(sh.end.occurred_at, tz) : sh.inProgress ? <Badge tone="teal">On shift</Badge> : <span className="text-red-700">missing</span>}
              </td>
              <td className="px-2.5 sm:px-4 py-3 text-slate-600 hidden sm:table-cell">
                {sh.breaks.length === 0 ? "—" : sh.breaks.map(b => (
                  <div key={b.start.id} className="whitespace-nowrap">
                    {fmtTime(b.start.occurred_at, tz)}–{b.end ? fmtTime(b.end.occurred_at, tz) : sh.inProgress ? "now" : "?"}
                    <span className="text-xs text-slate-500"> {b.start.paid_break ? "rest, paid" : b.paid ? "meal, paid" : "meal"}</span>
                  </div>
                ))}
                {sh.unpaidBreakMinutes > 0 && <div className="text-xs text-slate-500">{fmtMinutes(sh.unpaidBreakMinutes)} unpaid</div>}
              </td>
              <td className="px-2.5 sm:px-4 py-3 text-right whitespace-nowrap">
                <div className="font-medium tabular-nums">{sh.start && (sh.end || sh.inProgress) ? fmtMinutes(sh.workedMinutes) : "—"}</div>
                {sh.breakMinutes > 0 && <div className="text-xs text-slate-500 sm:hidden">{fmtMinutes(sh.breakMinutes)} break</div>}
                <div className="flex flex-wrap justify-end gap-1 mt-1">
                  {sh.issues.map(i => <Badge key={i} tone="red">{ISSUE_LABEL[i]}</Badge>)}
                  {sh.warnings.map(x => <Badge key={x} tone="amber">{WARNING_LABEL[x]}</Badge>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsStrip({ worked, breaks, unpaidBreaks, shifts, inProgress }: {
  worked: number; breaks: number; unpaidBreaks: number; shifts: number; inProgress: number;
}) {
  const item = (label: string, value: string, sub?: string) => (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {item("Worked this week", fmtMinutes(worked), inProgress ? `+ ${fmtMinutes(inProgress)} on shift now` : undefined)}
      {item("Breaks", fmtMinutes(breaks), unpaidBreaks ? `${fmtMinutes(unpaidBreaks)} unpaid, deducted` : breaks ? "All paid" : undefined)}
      {item("Shifts", String(shifts))}
    </div>
  );
}
