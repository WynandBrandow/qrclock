"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormResult } from "@/app/(app)/setup/actions";
import QrImage from "./QrImage";

type Action = (s: FormResult, f: FormData) => Promise<FormResult>;

/** A form bound to a server action, with its error or success message underneath. */
export default function Form({ action, submit, children, className = "space-y-4", tone = "primary", reset = false, linkLabel, showQr = false, confirm, pendingLabel = "Saving…" }: {
  action: Action; submit: string; children?: ReactNode; className?: string; tone?: "primary" | "secondary" | "danger";
  reset?: boolean; linkLabel?: string; showQr?: boolean;
  /** Ask "are you sure?" first, for actions that are hard to undo. */
  confirm?: string; pendingLabel?: string;
}) {
  const [state, run, pending] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && reset) ref.current?.reset(); }, [state, reset]);
  const btn = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger" }[tone];
  return (
    <form ref={ref} action={run} className={className} onSubmit={e => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn} disabled={pending}>{pending ? pendingLabel : submit}</button>
        {state.error && <span className="text-sm text-red-700" role="alert">{state.error}</span>}
        {state.ok && state.message && <span className="text-sm text-teal-700" role="status">{state.message}</span>}
      </div>
      {state.ok && state.link && (
        state.link.startsWith("/") ? <Link className="text-sm text-teal-700 underline" href={state.link}>{linkLabel ?? "Open"}</Link> : (
          <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 space-y-3">
            <input readOnly className="input font-mono text-xs" value={state.link} onFocus={e => e.currentTarget.select()} aria-label="Pairing link" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => navigator.clipboard?.writeText(state.link!)}>Copy link</button>
              <a className="btn-secondary text-xs" href={state.link}>Use this device as the kiosk</a>
            </div>
            {showQr && <div className="w-44"><QrImage value={state.link} /><p className="text-xs text-slate-500 mt-1">Or scan this with the kiosk&apos;s camera.</p></div>}
          </div>
        )
      )}
    </form>
  );
}
