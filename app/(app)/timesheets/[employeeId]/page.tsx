import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { currentWeekStart, loadWeek, namesById, pickWeek, placesById } from "@/lib/data";
import { FLAG_LABEL, KIND_LABEL, type EventKind } from "@/lib/shifts";
import { addDays, fmtDateTime, fmtDay, fmtMinutes, localDate, localTime, weekBounds } from "@/lib/time";
import ShiftTable, { TotalsStrip } from "@/components/ShiftTable";
import { AddEventForm, ApproveButton, EventActions, UnapproveButton } from "@/components/EventControls";
import { Badge, Notice, PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "Timesheet" };

type Correction = {
  id: string; action: "edit" | "add" | "void" | "resolve"; reason: string; corrected_at: string; corrected_by: string;
  before: { kind?: EventKind; occurred_at?: string; flag?: string } | null;
  after: { kind?: EventKind; occurred_at?: string } | null;
  original: { occurred_at: string } | null;
};

export default async function EmployeeTimesheet({ params, searchParams }: PageProps<"/timesheets/[employeeId]">) {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company, tz = c.timezone;
  const { employeeId } = await params;
  const { data: emp } = await db().from("employees").select("id, full_name, company_id, active").eq("id", employeeId).maybeSingle();
  if (!emp || emp.company_id !== c.id) notFound();

  const week = pickWeek(c, (await searchParams).week);
  const { from, to } = weekBounds(week, tz);
  const [[w], names, places, { data: corr }] = await Promise.all([
    loadWeek(c, week, emp.id),
    namesById(c.id),
    placesById(c.id),
    db().from("event_corrections")
      .select("id, action, reason, corrected_at, corrected_by, before, after, original:clock_events!event_corrections_original_event_id_fkey(occurred_at)")
      .eq("employee_id", emp.id).order("corrected_at", { ascending: false }).limit(300),
  ]);
  const shifts = w?.shifts ?? [];
  const t = w?.totals;
  const events = shifts.flatMap(s => s.events);

  const inWeek = (iso?: string) => !!iso && new Date(iso) >= from && new Date(iso) < to;
  const history = ((corr ?? []) as unknown as Correction[]).filter(h =>
    inWeek(h.before?.occurred_at) || inWeek(h.after?.occurred_at) || inWeek(h.original?.occurred_at));

  const changed = w?.approval && w.approval.worked_minutes !== t?.workedMinutes;
  const today = localDate(new Date(), tz);
  const addDate = today < addDays(week, 7) ? today : addDays(week, 6);

  return (
    <div className="max-w-5xl">
      <div className="text-sm mb-2"><Link className="text-teal-700 hover:underline" href={`/timesheets?week=${week}`}>← All timesheets</Link></div>
      <PageHeader
        title={emp.full_name}
        sub={<>Week of {fmtDay(week)}{!emp.active && " · no longer active"}</>}
        actions={<WeekPicker base={`/timesheets/${emp.id}`} week={week} current={currentWeekStart(c)} label={`${fmtDay(week)} – ${fmtDay(addDays(week, 6))}`} />}
      />

      {w?.approval ? (
        <Notice tone={changed ? "amber" : "teal"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Approved by {names.get(w.approval.approved_by) ?? "a manager"} on {fmtDateTime(w.approval.approved_at, tz)}: {fmtMinutes(w.approval.worked_minutes)}.
              {changed && <strong> Hours have changed since; approve again to update.</strong>}
            </span>
            <div className="flex gap-2">
              {changed && !t?.issueCount && <ApproveButton week={week} employeeIds={[emp.id]} label="Approve again" />}
              <UnapproveButton week={week} employeeId={emp.id} />
            </div>
          </div>
        </Notice>
      ) : t && t.shiftCount > 0 && !t.issueCount && !t.inProgressMinutes ? (
        <div className="flex justify-end mb-4"><ApproveButton week={week} employeeIds={[emp.id]} /></div>
      ) : null}

      <TotalsStrip worked={t?.workedMinutes ?? 0} breaks={t?.breakMinutes ?? 0} shifts={t?.shiftCount ?? 0} inProgress={t?.inProgressMinutes ?? 0} breaksPaid={c.breaks_paid} />
      <ShiftTable shifts={shifts} tz={tz} />

      <h2 className="text-lg font-semibold mt-8 mb-3">Clock events</h2>
      <div className="card divide-y divide-slate-100">
        {events.length === 0 && <div className="p-4 text-sm text-slate-500">No events this week.</div>}
        {events.map(e => {
          const flagged = !!e.flag && !e.flag_resolved_at;
          const where = e.location_id ? places.locations.get(e.location_id) : e.kiosk_id ? places.kiosks.get(e.kiosk_id) : null;
          return (
            <div key={e.id} className="p-4 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{KIND_LABEL[e.kind]}</span>
                  <span className="text-slate-700 tabular-nums">{fmtDateTime(e.occurred_at, tz)}</span>
                  {e.source === "manager" && <Badge tone="blue">{e.replaces_id ? "Corrected" : "Added by manager"}</Badge>}
                  {flagged && <Badge tone="amber">{FLAG_LABEL[e.flag!] ?? e.flag}</Badge>}
                  {e.flag && e.flag_resolved_at && <Badge>Checked</Badge>}
                </div>
                {where && <div className="text-xs text-slate-500 mt-1">{where}</div>}
              </div>
              <EventActions id={e.id} kind={e.kind} flagged={flagged}
                date={localDate(new Date(e.occurred_at), tz)} time={localTime(new Date(e.occurred_at), tz)} />
            </div>
          );
        })}
      </div>
      <div className="mt-4"><AddEventForm employeeId={emp.id} date={addDate} /></div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Change history</h2>
      {history.length === 0 ? <p className="text-sm text-slate-500">No corrections this week.</p> : (
        <ol className="card divide-y divide-slate-100 text-sm">
          {history.map(h => (
            <li key={h.id} className="p-4">
              <div className="font-medium text-slate-800">
                {h.action === "edit" && <>Changed {label(h.before, tz)} → {label(h.after, tz)}</>}
                {h.action === "add" && <>Added {label(h.after, tz)}</>}
                {h.action === "void" && <>Removed {label(h.before, tz)}</>}
                {h.action === "resolve" && <>Marked OK: {FLAG_LABEL[h.before?.flag ?? ""] ?? "flag"}</>}
              </div>
              <div className="text-slate-600 mt-0.5">&ldquo;{h.reason}&rdquo;</div>
              <div className="text-xs text-slate-500 mt-1">{names.get(h.corrected_by) ?? "Unknown"} · {fmtDateTime(h.corrected_at, tz)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function label(x: { kind?: EventKind; occurred_at?: string } | null, tz: string) {
  if (!x?.kind || !x.occurred_at) return "event";
  return `${KIND_LABEL[x.kind].toLowerCase()} ${fmtDateTime(x.occurred_at, tz)}`;
}
