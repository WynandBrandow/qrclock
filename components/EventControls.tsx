"use client";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { addEvent, approveWeek, editEvent, reopenWeek, resolveFlag, voidEvent, type ActionResult } from "@/app/(app)/timesheets/actions";

type Action = (s: ActionResult, f: FormData) => Promise<ActionResult>;

const KIND_OPTIONS = [
  ["clock_in", "Clock in"], ["clock_out", "Clock out"], ["break_start", "Start break (meal)"], ["break_end", "End break"],
] as const;

/** A small form bound to a server action; calls onDone after a successful save. */
function ActionForm({ action, children, submit, pendingLabel = "Saving…", onDone, tone = "primary", className = "" }: {
  action: Action; children?: ReactNode; submit: string; pendingLabel?: string; onDone?: (message?: string) => void;
  tone?: "primary" | "danger"; className?: string;
}) {
  const [state, run, pending] = useActionState(action, { ok: false });
  useEffect(() => { if (state.ok) onDone?.(state.message); }, [state, onDone]);
  return (
    <form action={run} className={`space-y-3 ${className}`}>
      {children}
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      {state.ok && state.message && !onDone && <p className="text-sm text-teal-700" role="status">{state.message}</p>}
      <button className={tone === "danger" ? "btn-danger" : "btn-primary"} disabled={pending}>{pending ? pendingLabel : submit}</button>
    </form>
  );
}

function WhenFields({ date, time }: { date: string; time: string }) {
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="label" htmlFor={`${id}-d`}>Date</label><input id={`${id}-d`} className="input" type="date" name="date" defaultValue={date} required /></div>
      <div><label className="label" htmlFor={`${id}-t`}>Time</label><input id={`${id}-t`} className="input" type="time" name="time" defaultValue={time} required /></div>
    </div>
  );
}

function KindField({ value, restBreaks }: { value?: string; restBreaks?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>Event</label>
      <select id={id} className="input" name="kind" defaultValue={value ?? "clock_out"}>
        {KIND_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        {restBreaks && <option value="rest_start">Start rest break (paid)</option>}
      </select>
    </div>
  );
}

function Reason({ label = "Reason (kept in the history)", placeholder, autoFocus }: { label?: string; placeholder?: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" name="reason" required maxLength={300} placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

/** A button that opens a small panel; Escape closes it and focus returns to the button. */
function Disclosure({ label, children }: { label: string; children: (close: (msg?: string) => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
  const id = useId();
  const close = (m?: string) => { setOpen(false); setMsg(m); document.getElementById(`${id}-btn`)?.focus(); };
  return (
    <div onKeyDown={e => { if (e.key === "Escape" && open) close(); }}>
      <button id={`${id}-btn`} type="button" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setMsg(undefined); }}
        className="btn-secondary px-3 py-1.5 text-xs min-h-9">{label}</button>
      {msg && <span className="ml-2 text-xs text-teal-700" role="status">{msg}</span>}
      {open && <div id={id} className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-left">{children(close)}</div>}
    </div>
  );
}

/** Edit / Remove / Mark as OK for one clock event. */
export function EventActions({ id, kind, date, time, flagged, locked }: {
  id: string; kind: string; date: string; time: string; flagged: boolean; locked: boolean;
}) {
  const [open, setOpen] = useState<"edit" | "void" | "ok" | null>(null);
  const [msg, setMsg] = useState<string | undefined>();
  const buttons = useRef<HTMLDivElement>(null);
  const panelId = useId();
  if (locked) return null;
  const close = (m?: string) => { setOpen(null); setMsg(m); buttons.current?.querySelector("button")?.focus(); };
  const toggle = (which: "edit" | "void" | "ok") => { setOpen(open === which ? null : which); setMsg(undefined); };
  const b = (which: "edit" | "void" | "ok", label: string) => (
    <button type="button" aria-expanded={open === which} aria-controls={panelId} onClick={() => toggle(which)}
      className="btn-secondary px-3 py-1.5 text-xs min-h-9">{label}</button>
  );
  return (
    <div onKeyDown={e => { if (e.key === "Escape" && open) close(); }}>
      <div ref={buttons} className="flex flex-wrap gap-1 justify-end">
        {b("edit", "Edit")}{b("void", "Remove")}{flagged && b("ok", "Mark as OK")}
      </div>
      {msg && <p className="text-xs text-teal-700 text-right mt-1" role="status">{msg}</p>}
      {open && (
        <div id={panelId} className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-left">
          {open === "edit" && (
            <ActionForm action={editEvent} submit="Save correction" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <KindField value={kind} />
              <WhenFields date={date} time={time} />
              <Reason placeholder="e.g. Forgot to scan out, left at 5pm" autoFocus />
            </ActionForm>
          )}
          {open === "void" && (
            <ActionForm action={voidEvent} submit="Remove event" pendingLabel="Removing…" tone="danger" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-slate-600">The event stops counting. The original stays in the history.</p>
              <Reason placeholder="e.g. Scanned twice by mistake" autoFocus />
            </ActionForm>
          )}
          {open === "ok" && (
            <ActionForm action={resolveFlag} submit="Mark as OK" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <Reason label="Note" placeholder="e.g. Checked with them, times are right" autoFocus />
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

export function AddEventForm({ employeeId, date, restBreaks }: { employeeId: string; date: string; restBreaks: boolean }) {
  return (
    <Disclosure label="Add a missing event">
      {close => (
        <ActionForm action={addEvent} submit="Add event" onDone={close} className="max-w-md">
          <input type="hidden" name="employee_id" value={employeeId} />
          <KindField restBreaks={restBreaks} />
          <WhenFields date={date} time="17:00" />
          <Reason placeholder="e.g. Kiosk was offline" />
        </ActionForm>
      )}
    </Disclosure>
  );
}

/** Approves exactly the weeks the manager is looking at (each id carries its content hash). */
export function ApproveButton({ week, employees, label = "Approve week" }: { week: string; employees: { id: string; hash: string }[]; label?: string }) {
  return (
    <ActionForm action={approveWeek} submit={label} pendingLabel="Approving…" className="flex flex-col items-end">
      <input type="hidden" name="week" value={week} />
      {employees.map(e => <input key={e.id} type="hidden" name="employee" value={`${e.id}:${e.hash}`} />)}
    </ActionForm>
  );
}

export function ReopenWeek({ week, employeeId }: { week: string; employeeId: string }) {
  return (
    <Disclosure label="Reopen week">
      {close => (
        <ActionForm action={reopenWeek} submit="Reopen week" pendingLabel="Reopening…" tone="danger" onDone={close} className="max-w-sm">
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <p className="text-sm text-slate-600">The approval is kept in the history. The week can be corrected, then needs approving again.</p>
          <Reason placeholder="e.g. Missed clock-out found after payroll" autoFocus />
        </ActionForm>
      )}
    </Disclosure>
  );
}
