import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { activeEvents, must, namesById, placesById } from "@/lib/data";
import { buildShifts, FLAG_LABEL, ISSUE_LABEL, KIND_LABEL, type ClockEvent } from "@/lib/shifts";
import { fmtDateTime, fmtDay, localDate, weekStartOf } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Review" };

const LOOKBACK_DAYS = 60;

export default async function Review() {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company, tz = c.timezone, now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000);

  const [events, names, places, flagged, scans] = await Promise.all([
    // Fetch two extra days so a shift that started before the window still pairs up.
    activeEvents(c.id, new Date(since.getTime() - 2 * 86400_000), new Date(now.getTime() + 60_000)),
    namesById(c.id),
    placesById(c.id),
    db().from("clock_events").select("id, employee_id, kind, occurred_at, flag")
      .eq("company_id", c.id).eq("status", "active").not("flag", "is", null).is("flag_resolved_at", null)
      .order("occurred_at", { ascending: false }).limit(200).then(must),
    db().from("scan_log").select("id, kiosk_id, result, detail, created_at")
      .eq("company_id", c.id).neq("result", "ok").gte("created_at", new Date(now.getTime() - 7 * 86400_000).toISOString())
      .order("created_at", { ascending: false }).limit(50).then(must),
  ]);

  const firstDay = localDate(since, tz);
  const byEmp = new Map<string, ClockEvent[]>();
  for (const e of events) (byEmp.get(e.employee_id) ?? byEmp.set(e.employee_id, []).get(e.employee_id)!).push(e);
  const problems = [...byEmp.entries()]
    .flatMap(([id, evs]) => buildShifts(evs, c, now).filter(s => s.issues.length && s.date >= firstDay).map(s => ({ id, s })))
    .sort((a, b) => b.s.date.localeCompare(a.s.date));

  const link = (employeeId: string, date: string) => `/timesheets/${employeeId}?week=${weekStartOf(date, c.week_start)}`;
  const SCAN_LABEL: Record<string, string> = { unknown: "Unknown QR code", inactive: "Card of an inactive employee", duplicate: "Repeat scan ignored", rejected: "Rejected" };

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Review" sub={`Problems from the last ${LOOKBACK_DAYS} days. Fix them on the employee's timesheet.`} />

      <section>
        <h2 className="text-lg font-semibold mb-3">Incomplete shifts <span className="text-slate-400 font-normal">({problems.length})</span></h2>
        {problems.length === 0 ? <Empty>Every shift has a clock-in and a clock-out.</Empty> : (
          <ul className="card divide-y divide-slate-100">
            {problems.map(({ id, s }) => (
              <li key={s.key}>
                <Link href={link(id, s.date)} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-slate-50">
                  <span className="font-medium">{names.get(id) ?? "Former employee"} <span className="text-slate-500 font-normal">· {fmtDay(s.date)}</span></span>
                  <span className="flex flex-wrap gap-1">{s.issues.map(i => <Badge key={i} tone="red">{ISSUE_LABEL[i]}</Badge>)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Flagged scans <span className="text-slate-400 font-normal">({flagged.length ?? 0})</span></h2>
        {!flagged.length ? <Empty>No unusual scans to check.</Empty> : (
          <ul className="card divide-y divide-slate-100">
            {flagged.map(e => (
              <li key={e.id}>
                <Link href={link(e.employee_id, localDate(new Date(e.occurred_at), tz))} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-slate-50">
                  <span><span className="font-medium">{names.get(e.employee_id) ?? "Former employee"}</span>
                    <span className="text-slate-500"> · {KIND_LABEL[e.kind as ClockEvent["kind"]]} {fmtDateTime(e.occurred_at, tz)}</span></span>
                  <Badge tone="amber">{FLAG_LABEL[e.flag ?? ""] ?? e.flag}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Rejected scans, last 7 days <span className="text-slate-400 font-normal">({scans.length ?? 0})</span></h2>
        {!scans.length ? <Empty>No rejected scans.</Empty> : (
          <ul className="card divide-y divide-slate-100 text-sm">
            {scans.map(s => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>{SCAN_LABEL[s.result] ?? s.result}{s.detail && <span className="text-slate-500"> · {s.detail}</span>}</span>
                <span className="text-slate-500">{s.kiosk_id ? places.kiosks.get(s.kiosk_id) ?? "Kiosk" : "Kiosk"} · {fmtDateTime(s.created_at, tz)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
