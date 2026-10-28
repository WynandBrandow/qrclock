"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";

type Kind = "clock_in" | "clock_out" | "break_start" | "break_end";

type View =
  | { t: "scanning" }
  | { t: "checking" }
  | { t: "choose"; code: string; name: string; actions: Kind[]; state: string; since: string | null; stale: boolean }
  | { t: "saving"; name: string }
  | { t: "done"; name: string; kind: Kind; at: string; flagged: boolean }
  | { t: "message"; tone: "error" | "info"; title: string; body?: string };

const LABEL: Record<Kind, string> = { clock_in: "Clock in", clock_out: "Clock out", break_start: "Start break", break_end: "End break" };
const DONE: Record<Kind, string> = { clock_in: "Clocked in", clock_out: "Clocked out", break_start: "Break started", break_end: "Break ended" };
const TONE: Record<Kind, string> = {
  clock_in: "bg-teal-500 hover:bg-teal-400 text-slate-950",
  clock_out: "bg-rose-500 hover:bg-rose-400 text-white",
  break_start: "bg-amber-400 hover:bg-amber-300 text-slate-950",
  break_end: "bg-sky-400 hover:bg-sky-300 text-slate-950",
};

const CHOOSE_TIMEOUT = 15_000;   // back to scanning if nobody confirms
const RESULT_TIME = 4_000;       // how long a result stays on screen
const SAME_CODE_PAUSE = 6_000;   // ignore the same card held in front of the camera

const stamp = (code: string) => ({ code, at: Date.now() });

export default function Kiosk({ company, kioskName, tz }: { company: string; kioskName: string; tz: string }) {
  const [view, setView] = useState<View>({ t: "scanning" });
  const [now, setNow] = useState<Date | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const time = (d: Date | string) => new Date(d).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const reset = useCallback((after = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { busy.current = false; setView({ t: "scanning" }); }, after);
  }, []);

  const show = useCallback((v: View, resetAfter: number) => { setView(v); reset(resetAfter); }, [reset]);

  const handleCode = useCallback(async (code: string) => {
    if (busy.current) return;
    const last = lastCode.current;
    if (last && last.code === code && Date.now() - last.at < SAME_CODE_PAUSE) return;
    busy.current = true;
    lastCode.current = stamp(code);
    setView({ t: "checking" });
    try {
      const res = await fetch("/api/kiosk/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (res.status === 401) return show({ t: "message", tone: "error", title: "Kiosk not paired", body: "Ask an administrator to pair this device again." }, 10_000);
      if (data.error === "unknown") return show({ t: "message", tone: "error", title: "Card not recognised", body: "This QR code isn't registered. Ask your manager for a new card." }, RESULT_TIME);
      if (data.error === "inactive") return show({ t: "message", tone: "error", title: `Sorry ${data.name}`, body: "This card is no longer active. Please see your manager." }, RESULT_TIME);
      if (!res.ok) return show({ t: "message", tone: "error", title: "Something went wrong", body: "Please scan again." }, RESULT_TIME);
      if (data.duplicate) {
        return show({ t: "message", tone: "info", title: `Already done, ${data.name}`, body: `${DONE[data.last.kind as Kind]} at ${time(data.last.occurred_at)}. Nothing more to do.` }, RESULT_TIME);
      }
      setView({ t: "choose", code, name: data.name, actions: data.actions, state: data.state, since: data.since, stale: data.stale });
      reset(CHOOSE_TIMEOUT);
    } catch {
      show({ t: "message", tone: "error", title: "No connection", body: "Check the internet connection and scan again." }, RESULT_TIME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, show, tz]);

  const confirm = async (code: string, name: string, kind: Kind) => {
    if (timer.current) clearTimeout(timer.current);
    setView({ t: "saving", name });
    try {
      const res = await fetch("/api/kiosk/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, kind }) });
      const data = await res.json();
      if (res.ok && data.ok) {
        lastCode.current = stamp(code);
        return show({ t: "done", name, kind, at: data.occurred_at, flagged: !!data.flag }, RESULT_TIME);
      }
      if (data.error === "duplicate") return show({ t: "message", tone: "info", title: `Already done, ${name}`, body: "That was just recorded." }, RESULT_TIME);
      if (data.error === "changed") return show({ t: "message", tone: "info", title: "Please scan again", body: "Your status changed on another device." }, RESULT_TIME);
      show({ t: "message", tone: "error", title: "Not saved", body: "Please scan again." }, RESULT_TIME);
    } catch {
      show({ t: "message", tone: "error", title: "No connection", body: "Not saved. Check the internet connection and scan again." }, RESULT_TIME);
    }
  };

  // Clock in the header.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  // Camera scanner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await QrScanner.hasCamera())) { setCamError("No camera found. A USB QR scanner still works."); return; }
      const scanner = new QrScanner(videoRef.current, r => handleCode(r.data), {
        preferredCamera: facing, maxScansPerSecond: 6, highlightScanRegion: false, returnDetailedScanResult: true,
      });
      scannerRef.current = scanner;
      try { await scanner.start(); setCamError(null); }
      catch { setCamError("The camera is blocked. Allow camera access for this site, then reload. A USB QR scanner still works."); }
    })();
    return () => { cancelled = true; scannerRef.current?.destroy(); scannerRef.current = null; };
  }, [facing, handleCode]);

  // USB / Bluetooth scanners type the code and press Enter.
  useEffect(() => {
    let buf = "", lastKey = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const t = Date.now();
      if (t - lastKey > 100) buf = "";
      lastKey = t;
      if (e.key === "Enter") { if (buf.length >= 16) handleCode(buf); buf = ""; }
      else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCode]);

  // Keep the screen on.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch {} };
    get();
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  const overlay = view.t !== "scanning";

  return (
    <main className="fixed inset-0 bg-slate-950 text-white flex flex-col select-none">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{company}</div>
          <div className="text-sm text-slate-400 truncate">{kioskName}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums" suppressHydrationWarning>{now ? time(now) : ""}</div>
          <div className="text-sm text-slate-400" suppressHydrationWarning>
            {now?.toLocaleDateString("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </header>

      <div className="relative flex-1 grid place-items-center px-6 pb-6">
        <div className="relative w-full max-w-xl aspect-[4/3] rounded-3xl overflow-hidden bg-slate-900 ring-1 ring-slate-800">
          <video ref={videoRef} className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} muted playsInline />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-1/2 aspect-square rounded-2xl border-4 border-teal-300/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
          </div>
          {camError && <div className="absolute inset-0 grid place-items-center p-8 text-center text-slate-300 bg-slate-900">{camError}</div>}
        </div>
        <p className="mt-6 text-xl text-slate-300 text-center">Hold your QR card up to the camera</p>
        <button type="button" onClick={() => setFacing(f => (f === "user" ? "environment" : "user"))}
          className="mt-3 text-sm text-slate-500 underline underline-offset-4">Switch camera</button>

        {overlay && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/90 backdrop-blur-sm p-6" role="dialog" aria-live="assertive">
            <div className="w-full max-w-xl text-center">
              {view.t === "checking" && <p className="text-2xl text-slate-300">Checking card…</p>}
              {view.t === "saving" && <p className="text-2xl text-slate-300">Saving, {view.name}…</p>}

              {view.t === "choose" && (
                <>
                  <h1 className="text-4xl font-semibold">Hi {view.name}</h1>
                  <p className="mt-3 text-lg text-slate-300">
                    {view.state === "off" ? (view.stale ? "Your last shift wasn't clocked out. Your manager will fix it." : "You're not clocked in.")
                      : view.state === "on_break" ? `On a break since ${view.since ? time(view.since) : ""}.`
                      : `On shift since ${view.since ? time(view.since) : ""}.`}
                  </p>
                  <div className="mt-8 grid gap-4">
                    {view.actions.map((k, i) => (
                      <button key={k} type="button" onClick={() => confirm(view.code, view.name, k)} autoFocus={i === 0}
                        className={`rounded-2xl py-6 text-3xl font-semibold transition-colors ${TONE[k]}`}>{LABEL[k]}</button>
                    ))}
                    <button type="button" onClick={() => reset(0)} className="rounded-2xl py-4 text-xl text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900">Cancel</button>
                  </div>
                </>
              )}

              {view.t === "done" && (
                <>
                  <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-5xl ${TONE[view.kind]}`} aria-hidden="true">✓</div>
                  <h1 className="mt-6 text-4xl font-semibold">{DONE[view.kind]}</h1>
                  <p className="mt-3 text-2xl text-slate-300">{view.name}, {time(view.at)}</p>
                  {view.flagged && <p className="mt-4 text-amber-300">Saved, and flagged for your manager to check.</p>}
                </>
              )}

              {view.t === "message" && (
                <>
                  <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-5xl ${view.tone === "error" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`} aria-hidden="true">
                    {view.tone === "error" ? "!" : "i"}
                  </div>
                  <h1 className="mt-6 text-3xl font-semibold">{view.title}</h1>
                  {view.body && <p className="mt-3 text-xl text-slate-300">{view.body}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
