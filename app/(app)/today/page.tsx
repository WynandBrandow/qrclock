import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { activeEvents, currentWeekStart } from "@/lib/data";
import { currentState, KIND_LABEL, type ClockEvent } from "@/lib/shifts";
import { fmtDay, fmtTime, localDate, zonedToUtc } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Today" };

export default async function Today() {
  const v = await requireViewer(["manager", "admin"]);
  const c = v.company, tz = c.timezone, now = new Date();
  const today = localDate(now, tz);
  const since = new Date(Math.min(zonedToUtc(today, "00:00", tz).getTime(), now.getTime() - (c.long_shift_hours + 1) * 3600_000));

  const [events, { data: emps }, { count: flags }, { count: unknown }] = await Promise.all([
    activeEvents(c.id, since, new Date(now.getTime() + 60_000)),
    db().from("employees").select("id, full_name").eq("company_id", c.id).eq("active", true).order("full_name"),
    db().from("clock_events").select("id", { count: "exact", head: true })
      .eq("company_id", c.id).eq("status", "active").not("flag", "is", null).is("flag_resolved_at", null),
    db().from("scan_log").select("id", { count: "exact", head: true })
      .eq("company_id", c.id).eq("result", "unknown").gte("created_at", new Date(now.getTime() - 7 * 86400_000).toISOString()),
  ]);

  const lastBy = new Map<string, ClockEvent>();
  for (const e of events) lastBy.set(e.employee_id, e); // events are in time order
  const people = (emps ?? []).map(e => ({ ...e, last: lastBy.get(e.id) ?? null, ...currentState(lastBy.get(e.id) ?? null, c, now) }));
  const working = people.filter(p => p.state !== "off");
  const todays = events.filter(e => localDate(new Date(e.occurred_at), tz) === today).reverse();
  const name = new Map((emps ?? []).map(e => [e.id, e.full_name]));
  const week = currentWeekStart(c);

  return (
    <div className="max-w-5xl">
      <PageHeader title="Today" sub={fmtDay(today)} />

      {(!!flags || !!unknown) && (
        <Link href="/review" className="block card p-4 mb-6 ring-amber-300 bg-amber-50 hover:bg-amber-100">
          <span className="font-medium text-amber-900">Needs review: </span>
          <span className="text-amber-900">
            {[flags ? `${flags} flagged event${flags > 1 ? "s" : ""}` : null, unknown ? `${unknown} unknown card scan${unknown > 1 ? "s" : ""} this week` : null].filter(Boolean).join(" · ")}
          </span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold mb-3">On shift now <span className="text-slate-400 font-normal">({working.length})</span></h2>
          {working.length === 0 ? <Empty>Nobody is clocked in.</Empty> : (
            <ul className="card divide-y divide-slate-100">
              {working.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <Link href={`/timesheets/${p.id}?week=${week}`} className="font-medium text-teal-700 hover:underline truncate">{p.full_name}</Link>
                  <div className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
                    {p.state === "on_break" ? <Badge tone="amber">On break</Badge> : <Badge tone="teal">Working</Badge>}
                    since {fmtTime(p.last!.occurred_at, tz)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {people.some(p => p.stale) && (
            <p className="text-sm text-amber-800 mt-3">
              {people.filter(p => p.stale).map(p => p.full_name).join(", ")}: shift left open longer than {c.long_shift_hours} hours. See Review.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Today&apos;s scans <span className="text-slate-400 font-normal">({todays.length})</span></h2>
          {todays.length === 0 ? <Empty>No scans yet today.</Empty> : (
            <ul className="card divide-y divide-slate-100 text-sm">
              {todays.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name.get(e.employee_id) ?? "Former employee"}</div>
                    <div className="text-slate-500">{KIND_LABEL[e.kind]}{e.flag && !e.flag_resolved_at && <> · <span className="text-amber-700">flagged</span></>}</div>
                  </div>
                  <span className="tabular-nums text-slate-700 whitespace-nowrap">{fmtTime(e.occurred_at, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
