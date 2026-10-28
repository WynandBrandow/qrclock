import { requireViewer } from "@/lib/auth";
import { currentWeekStart, lastEvent, loadWeek, pickWeek } from "@/lib/data";
import { currentState } from "@/lib/shifts";
import { addDays, fmtDateTime, fmtDay, fmtMinutes } from "@/lib/time";
import ShiftTable, { TotalsStrip } from "@/components/ShiftTable";
import { Badge, Notice, PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "My hours" };

export default async function MyHours({ searchParams }: PageProps<"/me">) {
  const v = await requireViewer();
  const c = v.company;
  const week = pickWeek(c, (await searchParams).week);
  const [[w], last] = await Promise.all([loadWeek(c, week, v.employee.id), lastEvent(v.employee.id)]);
  const { state } = currentState(last, c);
  const t = w?.totals;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="My hours"
        sub={state === "off" ? "Not clocked in" : state === "on_break" ? `On a break since ${fmtDateTime(last!.occurred_at, c.timezone)}` : `On shift since ${fmtDateTime(last!.occurred_at, c.timezone)}`}
        actions={<WeekPicker base="/me" week={week} current={currentWeekStart(c)} label={`${fmtDay(week)} – ${fmtDay(addDays(week, 6))}`} />}
      />
      {v.via === "pin" && <Notice>You&apos;re signed in with your card on this device. Sign out when you&apos;re done.</Notice>}
      {w?.approval && (
        <Notice>
          Approved: {fmtMinutes(w.approval.worked_minutes)} on {fmtDateTime(w.approval.approved_at, c.timezone)}.
          {w.approval.worked_minutes !== t?.workedMinutes && " Hours have changed since then; your manager will re-approve."}
        </Notice>
      )}
      <TotalsStrip worked={t?.workedMinutes ?? 0} breaks={t?.breakMinutes ?? 0} shifts={t?.shiftCount ?? 0} inProgress={t?.inProgressMinutes ?? 0} breaksPaid={c.breaks_paid} />
      <ShiftTable shifts={w?.shifts ?? []} tz={c.timezone} />
      {!!t?.issueCount && (
        <p className="mt-4 text-sm text-slate-600"><Badge tone="red">Needs a fix</Badge> Shifts marked like this are missing a scan. Your manager will correct them.</p>
      )}
    </div>
  );
}
