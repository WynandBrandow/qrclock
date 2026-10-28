"use client";
import { useActionState } from "react";
import { pinSignIn, type PinState } from "./actions";

export default function PinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<PinState, FormData>(pinSignIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="pin" className="label">PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="current-password"
          required autoFocus className="input text-center text-2xl tracking-[0.5em]" maxLength={8} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="remember" defaultChecked className="mt-0.5 h-4 w-4 accent-teal-600" />
        <span>This is my own phone: keep me signed in, so I can clock in by scanning the depot poster.</span>
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "See my hours"}</button>
    </form>
  );
}
