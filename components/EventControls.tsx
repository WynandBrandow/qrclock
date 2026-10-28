"use client";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { addEvent, approveWeek, editEvent, resolveFlag, unapproveWeek, voidEvent, type ActionResult } from "@/app/(app)/timesheets/actions";

type Action = (s: ActionResult, f: FormData) => Promise<ActionResult>;

const KIND_OPTIONS = [
  ["clock_in", "Clock in"], ["clock_out", "Clock out"], ["break_start", "Start break"], ["break_end", "End break"],
] as const;

/** A small form bound to a server action; calls onDone after a successful save. */
function ActionForm({ action, children, submit, onDone, tone = "primary", className = "" }: {
  action: Action; children?: ReactNode; submit: string; onDone?: () => void; tone?: "primary" | "danger"; className?: string;
}) {
  const [state, run, pending] = useActionState(action, { ok: false });
  useEffect(() => { if (state.ok) onDone?.(); }, [state, onDone]);
  return (
    <form action={run} className={`space-y-3 ${className}`}>
      {children}
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button className={tone === "danger" ? "btn-danger" : "btn-primary"} disabled={pending}>{pending ? "Saving…" : submit}</button>
    </form>
  );
}

function WhenFields({ date, time }: { date: string; time: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="label">Date</label><input className="input" type="date" name="date" defaultValue={date} required /></div>
      <div><label className="label">Time</label><input className="input" type="time" name="time" defaultValue={time} required /></div>
    </div>
  );
}

function KindField({ value }: { value?: string }) {
  return (
    <div>
      <label className="label">Event</label>
      <select className="input" name="kind" defaultValue={value ?? "clock_out"}>
        {KIND_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

function Reason({ label = "Reason (kept in the history)", placeholder }: { label?: string; placeholder?: string }) {
  return <div><label className="label">{label}</label><input className="input" name="reason" required maxLength={300} placeholder={placeholder} /></div>;
}

/** Edit / Remove / Mark OK buttons for one clock event, each opening its own small form. */
export function EventActions({ id, kind, date, time, flagged }: { id: string; kind: string; date: string; time: string; flagged: boolean }) {
  const [open, setOpen] = useState<"edit" | "void" | "ok" | null>(null);
  const close = () => setOpen(null);
  return (
    <div>
      <div className="flex flex-wrap gap-1 justify-end">
        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpen(open === "edit" ? null : "edit")}>Edit</button>
        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpen(open === "void" ? null : "void")}>Remove</button>
        {flagged && <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpen(open === "ok" ? null : "ok")}>Mark OK</button>}
      </div>
      {open && (
        <div className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-left">
          {open === "edit" && (
            <ActionForm action={editEvent} submit="Save correction" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <KindField value={kind} />
              <WhenFields date={date} time={time} />
              <Reason placeholder="e.g. Forgot to scan out, left at 5pm" />
            </ActionForm>
          )}
          {open === "void" && (
            <ActionForm action={voidEvent} submit="Remove event" tone="danger" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-slate-600">The event stops counting. The original stays in the history.</p>
              <Reason placeholder="e.g. Scanned twice by mistake" />
            </ActionForm>
          )}
          {open === "ok" && (
            <ActionForm action={resolveFlag} submit="Mark as OK" onDone={close}>
              <input type="hidden" name="id" value={id} />
              <Reason label="Note" placeholder="e.g. Checked with them, times are right" />
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

export function AddEventForm({ employeeId, date }: { employeeId: string; date: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Add a missing event</button>;
  return (
    <div className="card p-4 max-w-md">
      <ActionForm action={addEvent} submit="Add event" onDone={() => setOpen(false)}>
        <input type="hidden" name="employee_id" value={employeeId} />
        <KindField />
        <WhenFields date={date} time="17:00" />
        <Reason placeholder="e.g. Kiosk was offline" />
      </ActionForm>
    </div>
  );
}

export function ApproveButton({ week, employeeIds, label = "Approve week" }: { week: string; employeeIds: string[]; label?: string }) {
  return (
    <ActionForm action={approveWeek} submit={label} className="flex flex-col items-end">
      <input type="hidden" name="week" value={week} />
      {employeeIds.map(id => <input key={id} type="hidden" name="employee_id" value={id} />)}
    </ActionForm>
  );
}

export function UnapproveButton({ week, employeeId }: { week: string; employeeId: string }) {
  return (
    <ActionForm action={unapproveWeek} submit="Reopen week" tone="danger" className="flex flex-col items-end">
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="employee_id" value={employeeId} />
    </ActionForm>
  );
}
