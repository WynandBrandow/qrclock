"use client";
import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  if (state.sent) {
    return (
      <div className="text-center" role="status">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-teal-700 text-xl">✉</div>
        <h2 className="font-semibold text-slate-900">Check your email</h2>
        <p className="mt-2 text-sm text-slate-600">
          If <strong>{state.email}</strong> belongs to someone set up in QR Clock, a sign-in link is on its way. It works once and expires in an hour.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className="input" placeholder="you@example.com" />
      </div>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}
