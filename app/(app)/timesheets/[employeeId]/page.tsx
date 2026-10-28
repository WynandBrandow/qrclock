import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { approvalBlocker, currentWeekStart, loadWeek, must, namesById, pickWeek, placesById } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, FLAG_LABEL, KIND_LABEL, eventLabel, type EventKind } from "@/lib/shifts";
import { addDays, fmtDateTime, fmtDay, fmtMinutes, localDate, localTime, weekBounds } from "@/lib/time";
import ShiftTable, { TotalsStrip } from "@/components/ShiftTable";
import { AddEventForm, ApproveButton, EventActions, ReopenWeek } from "@/components/EventControls";
import { Badge, Notice, PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "Timesheet" };

type Correction = {
  id: string; action: "edit" | "add" | "void" | "resolve"; reason: string; corrected_at: string; corrected_by: string;
  before: { kind?: EventKind; occurred_at?: string; flag?: string } | null;
  after: { kind?: EventKind; occurred_at?: string } | null;
};

export default async function EmployeeTimesheet({ params, searchParams }: PageProps<"/timesheets/[employeeId]">) {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company, tz = c.timezone;
  const { employeeId } = await params;
  const { data: emp } = await db().from("employees").select("id, full_name, company_id, active, role").eq("id", employeeId).maybeSingle();
  if (!emp || emp.company_id !== c.id) notFound();

  const week = pickWeek(c, (await searchParams).week);
  const { from, to } = weekBounds(week, tz);
  const [[w], names, places, corr, approvals] = await Promise.all([
    loadWeek(c, week, emp.id),
    namesById(c.id),
    placesById(c.id),
    db().from("event_corrections").select("id, action, reason, corrected_at, corrected_by, before, after")
      .eq("employee_id", emp.id).gte("event_time", from.toISOString()).lt("event_time", to.toISOString())
      .order("corrected_at", { ascending: false }).then(must),
    db().from("timesheet_approvals").select("id, worked_minutes, approved_by, approved_at, revoked_at, revoked_by, revoke_reason")
      .eq("employee_id", emp.id).eq("period_start", week).order("approved_at", { ascending: false }).then(must),
  ]);
  const shifts = w?.shifts ?? [];
  const t = w?.totals;
  const events = shifts.flatMap(s => s.events);
  const history = corr as unknown as Correction[];

  // Managers can't approve or change their own hours, or an administrator's.
  const hands = v.role === "admin" || (emp.id !== v.employee.id && emp.role !== "admin");
  const locked = !!w?.approved;
  const blocker = w ? approvalBlocker(w) : "no hours";
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

      {w?.approval && locked ? (
        <Notice>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span>
              <strong>Approved</strong> by {names.get(w.approval.approved_by) ?? "a manager"} on {fmtDateTime(w.approval.approved_at, tz)}: {fmtMinutes(w.approval.worked_minutes)}.
              The week is locked; reopen it to make corrections.
            </span>
            {hands && <ReopenWeek week={week} employeeId={emp.id} />}
          </div>
        </Notice>
      ) : w?.approval ? (
        <Notice tone="amber">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span>Approved on {fmtDateTime(w.approval.approved_at, tz)}, but <strong>the hours have changed since</strong>. Check and approve again.</span>
            {hands && !blocker && <ApproveButton week={week} employees={[{ id: emp.id, hash: w.contentHash }]} label="Approve again" />}
          </div>
        </Notice>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3 mb-4 print:hidden">
          {!hands ? <span className="text-sm text-slate-600">Another manager or an administrator approves these hours.</span>
            : blocker ? (t?.shiftCount || t?.issueCount ? <span className="text-sm text-slate-600">Can&apos;t approve yet: {blocker}.</span> : null)
            : <ApproveButton week={week} employees={[{ id: emp.id, hash: w!.contentHash }]} />}
        </div>
      )}

      <TotalsStrip worked={t?.workedMinutes ?? 0} breaks={t?.breakMinutes ?? 0} unpaidBreaks={t?.unpaidBreakMinutes ?? 0}
        shifts={t?.shiftCount ?? 0} inProgress={t?.inProgressMinutes ?? 0} />
      {t && CATEGORIES.some(cat => cat !== "ordinary" && t.byCategory[cat] > 0) && (
        <div className="flex flex-wrap gap-2 -mt-3 mb-6 text-sm">
          {CATEGORIES.filter(cat => t.byCategory[cat] > 0).map(cat => (
            <span key={cat} className="rounded-lg bg-white ring-1 ring-slate-200 px-3 py-1.5">
              {CATEGORY_LABEL[cat]}: <strong className="tabular-nums">{fmtMinutes(t.byCategory[cat])}</strong>
            </span>
          ))}
        </div>
      )}
      <ShiftTable shifts={shifts} tz={tz} />

      <h2 className="text-lg font-semibold mt-8 mb-3">Clock events</h2>
      <div className="card divide-y divide-slate-100">
        {events.length === 0 && <div className="p-4 text-sm text-slate-600">No events this week.</div>}
        {events.map(e => {
          const flagged = !!e.flag && !e.flag_resolved_at;
          const where = e.location_id ? places.locations.get(e.location_id) : e.kiosk_id ? places.kiosks.get(e.kiosk_id) : null;
          return (
            <div key={e.id} id={`event-${e.id}`} className="p-4 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{eventLabel(e)}</span>
                  <span className="text-slate-700 tabular-nums">{fmtDateTime(e.occurred_at, tz)}</span>
                  {e.source === "manager" && <Badge tone="blue">{e.replaces_id ? "Corrected" : "Added by manager"}</Badge>}
                  {flagged && <Badge tone="amber">{FLAG_LABEL[e.flag!] ?? e.flag}</Badge>}
                  {e.flag && e.flag_resolved_at && <Badge>Checked</Badge>}
                </div>
                {(where || e.source === "phone") && (
                  <div className="text-xs text-slate-600 mt-1">
                    {[e.source === "phone" ? "Phone" : null, where, e.distance_m != null ? `${e.distance_m < 1000 ? `${e.distance_m} m` : `${(e.distance_m / 1000).toFixed(1)} km`} from the depot` : null].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              {hands && <EventActions id={e.id} kind={e.kind} flagged={flagged} locked={locked}
                date={localDate(new Date(e.occurred_at), tz)} time={localTime(new Date(e.occurred_at), tz)} />}
            </div>
          );
        })}
      </div>
      {hands && !locked && <div className="mt-4"><AddEventForm employeeId={emp.id} date={addDate} restBreaks={c.rest_breaks} /></div>}

      <h2 className="text-lg font-semibold mt-8 mb-3">Change history</h2>
      {history.length === 0 && approvals.length === 0 ? <p className="text-sm text-slate-600">No corrections or approvals this week.</p> : (
        <ol className="card divide-y divide-slate-100 text-sm">
          {[
            ...history.map(h => ({ at: h.corrected_at, key: h.id, node: (
              <>
                <div className="font-medium text-slate-800">
                  {h.action === "edit" && <>Changed {label(h.before, tz)} → {label(h.after, tz)}</>}
                  {h.action === "add" && <>Added {label(h.after, tz)}</>}
                  {h.action === "void" && <>Removed {label(h.before, tz)}</>}
                  {h.action === "resolve" && <>Marked as OK: {FLAG_LABEL[h.before?.flag ?? ""] ?? "flag"}</>}
                </div>
                <div className="text-slate-600 mt-0.5">&ldquo;{h.reason}&rdquo;</div>
                <div className="text-xs text-slate-600 mt-1">{names.get(h.corrected_by) ?? "Unknown"} · {fmtDateTime(h.corrected_at, tz)}</div>
              </>
            ) })),
            ...approvals.flatMap(a => [
              { at: a.approved_at, key: `${a.id}-a`, node: (
                <>
                  <div className="font-medium text-slate-800">Approved {fmtMinutes(a.worked_minutes)}</div>
                  <div className="text-xs text-slate-600 mt-1">{names.get(a.approved_by) ?? "Unknown"} · {fmtDateTime(a.approved_at, tz)}</div>
                </>
              ) },
              ...(a.revoked_at ? [{ at: a.revoked_at, key: `${a.id}-r`, node: (
                <>
                  <div className="font-medium text-slate-800">Week reopened</div>
                  <div className="text-slate-600 mt-0.5">&ldquo;{a.revoke_reason}&rdquo;</div>
                  <div className="text-xs text-slate-600 mt-1">{names.get(a.revoked_by ?? "") ?? "Unknown"} · {fmtDateTime(a.revoked_at, tz)}</div>
                </>
              ) }] : []),
            ]),
          ].sort((a, b) => b.at.localeCompare(a.at)).map(item => <li key={item.key} className="p-4">{item.node}</li>)}
        </ol>
      )}
    </div>
  );
}

function label(x: { kind?: EventKind; occurred_at?: string } | null, tz: string) {
  if (!x?.kind || !x.occurred_at) return "event";
  return `${KIND_LABEL[x.kind].toLowerCase()} ${fmtDateTime(x.occurred_at, tz)}`;
}
