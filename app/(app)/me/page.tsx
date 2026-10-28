import { requireViewer } from "@/lib/auth";
import { currentWeekStart, lastEvent, loadWeek, must, namesById, pickWeek } from "@/lib/data";
import { db } from "@/lib/supabase/server";
import { passkeysFor } from "@/lib/passkeys";
import MyPasskeys from "@/components/MyPasskeys";
import { currentState, KIND_LABEL, type EventKind } from "@/lib/shifts";
import { addDays, fmtDateTime, fmtDay, fmtMinutes, weekBounds } from "@/lib/time";
import ShiftTable, { TotalsStrip } from "@/components/ShiftTable";
import { Badge, Notice, PageHeader, WeekPicker } from "@/components/ui";

export const metadata = { title: "My hours" };

export default async function MyHours({ searchParams }: PageProps<"/me">) {
  const v = await requireViewer();
  const c = v.company;
  const week = pickWeek(c, (await searchParams).week);
  const { from, to } = weekBounds(week, c.timezone);
  const [[w], last, changes, names, keys] = await Promise.all([
    loadWeek(c, week, v.employee.id), lastEvent(v.employee.id),
    db().from("event_corrections").select("id, action, reason, corrected_at, corrected_by, before, after")
      .eq("employee_id", v.employee.id).gte("event_time", from.toISOString()).lt("event_time", to.toISOString())
      .order("corrected_at", { ascending: false }).then(must),
    namesById(c.id),
    c.phone_clocking ? passkeysFor(v.employee.id) : Promise.resolve([]),
  ]);
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
        <Notice tone={w.approved ? "teal" : "amber"}>
          Approved: {fmtMinutes(w.approval.worked_minutes)} on {fmtDateTime(w.approval.approved_at, c.timezone)}.
          {!w.approved && " Hours have changed since then; your manager will check and approve again."}
        </Notice>
      )}
      <TotalsStrip worked={t?.workedMinutes ?? 0} breaks={t?.breakMinutes ?? 0} unpaidBreaks={t?.unpaidBreakMinutes ?? 0} shifts={t?.shiftCount ?? 0} inProgress={t?.inProgressMinutes ?? 0} />
      <ShiftTable shifts={w?.shifts ?? []} tz={c.timezone} />
      {!!t?.issueCount && (
        <p className="mt-4 text-sm text-slate-600"><Badge tone="red">Needs a fix</Badge> Shifts marked like this are missing a scan. Your manager will correct them.</p>
      )}
      {c.phone_clocking && (
        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold mb-3">Face ID / fingerprint</h2>
          <MyPasskeys keys={keys.map(k => ({ id: k.id, device_label: k.device_label, created_at: k.created_at, last_used_at: k.last_used_at }))}
            required={c.phone_require_passkey} tz={c.timezone} />
        </section>
      )}
      <section className="mt-8 card p-5 flex flex-col sm:flex-row gap-5 items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/me-card" alt={`QR card for ${v.employee.full_name}`} width={176} height={252} className="w-44 rounded-lg ring-1 ring-slate-200 bg-white shrink-0" />
        <div className="text-sm text-slate-700 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Your card on your phone</h2>
          <p>Keep a copy of your QR card on your phone, as well as on your key tag or in your wallet. At the kiosk, turn your screen brightness up and hold the code to the camera.</p>
          <p><strong>iPhone:</strong> press and hold the picture, then <em>Add to Photos</em>. <strong>Android:</strong> use the button below.</p>
          <a className="btn-primary" href="/me-card?download=1" download>Save card picture</a>
          <p className="text-xs text-slate-600">Treat it like a key: anyone with this code can clock you in. If you lose it, ask your manager for a new one.</p>
        </div>
      </section>
      {changes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Changes to your times this week</h2>
          <ol className="card divide-y divide-slate-100 text-sm">
            {changes.map(h => {
              const b = h.before as { kind?: EventKind; occurred_at?: string } | null, a = h.after as { kind?: EventKind; occurred_at?: string } | null;
              const what = (x: typeof a) => (x?.kind && x.occurred_at ? `${KIND_LABEL[x.kind].toLowerCase()} ${fmtDateTime(x.occurred_at, c.timezone)}` : "a scan");
              return (
                <li key={h.id} className="p-4">
                  <div className="font-medium text-slate-800">
                    {h.action === "edit" ? `Changed ${what(b)} to ${what(a)}` : h.action === "add" ? `Added ${what(a)}` : h.action === "void" ? `Removed ${what(b)}` : "Checked a flagged scan"}
                  </div>
                  <div className="text-slate-600 mt-0.5">&ldquo;{h.reason}&rdquo;</div>
                  <div className="text-xs text-slate-600 mt-1">{names.get(h.corrected_by) ?? "Your manager"} · {fmtDateTime(h.corrected_at, c.timezone)}</div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-slate-600 mt-2">If something here looks wrong, talk to your manager.</p>
        </section>
      )}
    </div>
  );
}
