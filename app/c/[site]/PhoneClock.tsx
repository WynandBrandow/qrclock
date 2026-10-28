"use client";
import Link from "next/link";
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { phonePunch, type PhonePunch } from "./actions";
import { startPasskeyCheck } from "@/app/passkeys/actions";

type Action = "clock_in" | "clock_out" | "break_start" | "break_end" | "rest_start";

const TONE: Record<Action, string> = {
  clock_in: "bg-teal-600 hover:bg-teal-700 text-white",
  clock_out: "bg-rose-600 hover:bg-rose-700 text-white",
  break_start: "bg-amber-400 hover:bg-amber-300 text-slate-950",
  rest_start: "bg-violet-300 hover:bg-violet-200 text-slate-950",
  break_end: "bg-sky-500 hover:bg-sky-600 text-white",
};

/** One position fix, only when a button is tapped. Gives up after 8 s (the punch is then flagged). */
function locate(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

export default function PhoneClock(p: {
  site: string; siteName: string; name: string; tz: string; state: string; stale: boolean; since: string | null;
  actions: Action[]; restBreaks: boolean; wantLocation: boolean; requirePasskey: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PhonePunch | null>(null);
  const time = (d: string) => new Date(d).toLocaleTimeString("en-AU", { timeZone: p.tz, hour: "numeric", minute: "2-digit" });
  const label = (a: Action) => ({ clock_in: "Clock in", clock_out: "Clock out", break_end: "End break",
    break_start: p.restBreaks ? "Meal break" : "Start break", rest_start: "Rest break" })[a];
  const done = (a: Action) => ({ clock_in: "Clocked in", clock_out: "Clocked out", break_end: "Break ended",
    break_start: p.restBreaks ? "Meal break started" : "Break started", rest_start: "Rest break started" })[a];

  const tap = async (a: Action) => {
    if (busy) return;
    let passkey = null;
    if (p.requirePasskey) {
      // Face ID / fingerprint first, straight from the tap (iPhones only allow it from a tap).
      setBusy("Confirm with Face ID or your fingerprint…");
      try {
        const start = await startPasskeyCheck();
        if (!start.ok) { setResult({ ok: false, error: start.error }); setBusy(null); return; }
        passkey = await startAuthentication({ optionsJSON: start.options });
      } catch {
        setResult({ ok: false, error: "Face ID or fingerprint wasn't confirmed. Nothing was saved; tap again." });
        setBusy(null);
        return;
      }
    }
    setBusy(p.wantLocation ? "Checking you're at the depot…" : "Saving…");
    const fix = p.wantLocation ? await locate() : null;
    setBusy("Saving…");
    try {
      setResult(await phonePunch({ site: p.site, action: a, lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, passkey }));
    } catch {
      setResult({ ok: false, error: "No connection. Nothing was saved; try again or tell your manager the time." });
    }
    setBusy(null);
    navigator.vibrate?.(60);
  };

  if (result?.ok) {
    return (
      <div className="text-center" role="status">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl ${TONE[result.action]}`} aria-hidden="true">✓</div>
        <h1 className="mt-5 text-2xl font-semibold">{done(result.action)}</h1>
        <p className="mt-2 text-lg text-slate-700">{p.name}, {time(result.at)}</p>
        {result.flagged && <p className="mt-3 text-sm text-amber-800">Saved, and flagged for your manager to check.</p>}
        <Link className="btn-secondary mt-6" href="/me">See my hours</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Hi {p.name}</h1>
      <p className="text-sm text-slate-600 mt-1">{p.siteName}</p>
      <p className="mt-3 text-slate-700">
        {p.state === "off" ? (p.stale ? "Your last shift wasn't clocked out. Ask your manager to fix it." : "You're not clocked in.")
          : p.state === "on_break" ? `On a break since ${p.since ? time(p.since) : ""}.` : `On shift since ${p.since ? time(p.since) : ""}.`}
      </p>
      <div className="mt-6 grid gap-3">
        {p.actions.map(a => (
          <button key={a} type="button" disabled={!!busy} onClick={() => tap(a)}
            className={`rounded-xl py-5 text-2xl font-semibold transition-colors disabled:opacity-60 ${TONE[a]}`}>{label(a)}</button>
        ))}
      </div>
      {busy && <p className="mt-4 text-sm text-slate-600" role="status">{busy}</p>}
      {result && !result.ok && <p className="mt-4 text-sm text-red-700" role="alert">{result.error}</p>}
      {p.wantLocation && !result && !busy && (
        <p className="mt-5 text-xs text-slate-600">When you tap, your phone is asked for its location once, to check you&apos;re at the depot. Only the distance is kept.</p>
      )}
    </div>
  );
}
