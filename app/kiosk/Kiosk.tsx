"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";

type Action = "clock_in" | "clock_out" | "break_start" | "break_end" | "rest_start";

type View =
  | { t: "scanning" }
  | { t: "checking" }
  | { t: "choose"; code: string; name: string; actions: Action[]; state: string; since: string | null; stale: boolean }
  | { t: "saving"; name: string }
  | { t: "done"; name: string; action: Action; at: string; flagged: boolean }
  | { t: "message"; tone: "error" | "info"; title: string; body?: string };

const TONE: Record<Action, string> = {
  clock_in: "bg-teal-500 hover:bg-teal-400 text-slate-950",
  clock_out: "bg-rose-600 hover:bg-rose-500 text-white",
  break_start: "bg-amber-400 hover:bg-amber-300 text-slate-950",
  rest_start: "bg-violet-300 hover:bg-violet-200 text-slate-950",
  break_end: "bg-sky-400 hover:bg-sky-300 text-slate-950",
};

const CHOOSE_TIMEOUT = 15_000;     // back to scanning if nobody confirms
const DONE_TIME = 3_000;           // how long a success stays on screen
const MESSAGE_TIME = 5_000;        // errors and notices stay a little longer
const SAME_CODE_PAUSE = 6_000;     // ignore the same card held in front of the camera
const REQUEST_TIMEOUT = 8_000;     // never hang on "Checking card…" when Wi-Fi drops
const HEARTBEAT = 5 * 60_000;
const WATCHDOG = 30_000;

const stamp = (code: string) => ({ code, at: Date.now() });

type ApiResult = { status: number; data: Record<string, unknown> } | { status: 0; data: null };

async function api(path: string, body: object): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    // A 502 from the host is an HTML page, not JSON.
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Short tones: rising for success, low for errors. Audio unlocks on the first touch (iOS). */
function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try { ctx.current ??= new AudioContext(); void ctx.current.resume(); } catch {}
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  return useCallback((kind: "ok" | "error") => {
    try {
      const c = (ctx.current ??= new AudioContext());
      const notes = kind === "ok" ? [660, 990] : [220, 180];
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; o.type = kind === "ok" ? "sine" : "square";
        const t = c.currentTime + i * 0.13;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.13);
      });
      navigator.vibrate?.(kind === "ok" ? 60 : [80, 60, 80]);
    } catch {}
  }, []);
}

export default function Kiosk({ company, kioskName, tz, restBreaks }: { company: string; kioskName: string; tz: string; restBreaks: boolean }) {
  const [view, setView] = useState<View>({ t: "scanning" });
  const [now, setNow] = useState<Date | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraRun, setCameraRun] = useState(0); // bump to restart the camera
  const [offline, setOffline] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const busy = useRef(false);
  const saving = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockOffset = useRef(0);       // server time minus device time
  const build = useRef<string | null>(null);
  const beep = useBeep();

  const label = (a: Action) => ({
    clock_in: "Clock in", clock_out: "Clock out", break_end: "End break",
    break_start: restBreaks ? "Meal break" : "Start break", rest_start: "Rest break",
  })[a];
  const doneLabel = (a: Action) => ({
    clock_in: "Clocked in", clock_out: "Clocked out", break_end: "Break ended",
    break_start: restBreaks ? "Meal break started" : "Break started", rest_start: "Rest break started",
  })[a];
  const time = (d: Date | string) => new Date(d).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const reset = useCallback((after = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { busy.current = false; saving.current = false; setView({ t: "scanning" }); }, after);
  }, []);

  const show = useCallback((v: View, resetAfter: number) => {
    setView(v); reset(resetAfter);
    if (v.t === "message" && v.tone === "error") beep("error");
  }, [reset, beep]);

  const handleCode = useCallback(async (code: string) => {
    if (busy.current) return;
    const last = lastCode.current;
    if (last && last.code === code && Date.now() - last.at < SAME_CODE_PAUSE) return;
    busy.current = true;
    lastCode.current = stamp(code);
    setView({ t: "checking" });
    const { status, data } = await api("/api/kiosk/scan", { code });
    if (!data) return show({ t: "message", tone: "error", title: "No connection", body: "Nothing was saved. Tell your manager the time, or try again shortly." }, MESSAGE_TIME);
    if (status === 401) return show({ t: "message", tone: "error", title: "Kiosk not paired", body: "An administrator needs to pair this device again under Setup → Kiosks." }, 10_000);
    if (data.error === "unknown") return show({ t: "message", tone: "error", title: "Card not recognised", body: "This QR code isn't registered. Ask your manager for a new card." }, MESSAGE_TIME);
    if (data.error === "inactive") return show({ t: "message", tone: "error", title: `Sorry ${data.name}`, body: "This card is no longer active. Please see your manager." }, MESSAGE_TIME);
    if (status >= 500) return show({ t: "message", tone: "error", title: "Server busy", body: "Nothing was saved. Please scan again." }, MESSAGE_TIME);
    if (status !== 200) return show({ t: "message", tone: "error", title: "Something went wrong", body: "Please scan again." }, MESSAGE_TIME);
    if (data.duplicate) {
      const l = data.last as { kind: Action; occurred_at: string; paid_break?: boolean };
      const a: Action = l.kind === "break_start" && l.paid_break ? "rest_start" : l.kind;
      return show({ t: "message", tone: "info", title: `Already done, ${data.name}`, body: `${doneLabel(a)} at ${time(l.occurred_at)}. Nothing more to do.` }, MESSAGE_TIME);
    }
    setView({ t: "choose", code, name: data.name as string, actions: data.actions as Action[], state: data.state as string, since: data.since as string | null, stale: !!data.stale });
    reset(CHOOSE_TIMEOUT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, show, tz, restBreaks]);

  const confirm = async (code: string, name: string, action: Action) => {
    if (saving.current) return; // a double tap sends one request
    saving.current = true;
    if (timer.current) clearTimeout(timer.current);
    setView({ t: "saving", name });
    const { status, data } = await api("/api/kiosk/scan", { code, action });
    if (!data) return show({ t: "message", tone: "error", title: "No connection", body: "Not saved. Tell your manager the time, or try again shortly." }, MESSAGE_TIME);
    if (status === 200 && data.ok) {
      lastCode.current = stamp(code);
      beep("ok");
      return show({ t: "done", name, action, at: data.occurred_at as string, flagged: !!data.flag }, DONE_TIME);
    }
    if (data.error === "duplicate") return show({ t: "message", tone: "info", title: `Already done, ${name}`, body: "That was just recorded." }, MESSAGE_TIME);
    if (data.error === "changed") return show({ t: "message", tone: "info", title: "Please scan again", body: "Your status changed on another device." }, MESSAGE_TIME);
    show({ t: "message", tone: "error", title: "Not saved", body: "Please scan again." }, MESSAGE_TIME);
  };

  const cancel = () => { lastCode.current = null; reset(0); };

  // Remember the camera choice on this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qc_facing");
      if (saved === "environment" || saved === "user") setTimeout(() => setFacing(saved), 0);
    } catch {}
  }, []);
  const switchCamera = () => setFacing(f => {
    const next = f === "user" ? "environment" : "user";
    try { localStorage.setItem("qc_facing", next); } catch {}
    return next;
  });

  // Clock in the header, corrected to server time.
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + clockOffset.current));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); if (timer.current) clearTimeout(timer.current); };
  }, []);

  // Camera scanner. Restarts when the camera is switched or the watchdog finds it stuck.
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
      catch (e) {
        const name = e instanceof Error ? e.name : String(e);
        setCamError(/NotReadable|in use/i.test(name)
          ? "The camera is in use by another app. Close it, or the kiosk will retry shortly."
          : "The camera is blocked. Allow camera access for this site, then reload. A USB QR scanner still works.");
      }
    })();
    return () => { cancelled = true; scannerRef.current?.destroy(); scannerRef.current = null; };
  }, [facing, handleCode, cameraRun]);

  // Watchdog: if the video stops moving (a tablet left on for weeks), restart the camera.
  useEffect(() => {
    let lastT = -1;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || document.visibilityState !== "visible") return;
      const track = (v.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const stuck = (track && track.readyState === "ended") || (lastT >= 0 && v.currentTime === lastT && !v.paused);
      lastT = v.currentTime;
      if (stuck || (camError && /in use/.test(camError))) { lastT = -1; setCameraRun(n => n + 1); }
    }, WATCHDOG);
    return () => clearInterval(id);
  }, [camError]);

  // USB / Bluetooth scanners type the code fast and press Enter (some send Tab).
  useEffect(() => {
    let buf = "", lastKey = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const t = Date.now();
      if (t - lastKey > 100) buf = "";
      lastKey = t;
      if (e.key === "Enter" || e.key === "Tab") {
        // The scanner's Enter must never press a button on screen (it would confirm the
        // previous person's action). Only a person's own key press, with nothing buffered, may.
        if (buf.length >= 16) { e.preventDefault(); handleCode(buf); }
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleCode]);

  // Keep the screen on.
  const wakeHeld = useRef(false);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = async () => {
      try { lock = await navigator.wakeLock?.request("screen"); wakeHeld.current = !!lock; lock?.addEventListener("release", () => { wakeHeld.current = false; }); } catch {}
    };
    get();
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  // Online / offline banner.
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const first = setTimeout(() => setOffline(!navigator.onLine), 0);
    return () => { clearTimeout(first); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Heartbeat: tells the admin the kiosk is alive, keeps pairing fresh, syncs the clock, and
  // reloads the page (when idle) after a new release or once a night.
  useEffect(() => {
    const loadedAt = Date.now();
    const beat = async () => {
      const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      let battery: { level: number; charging: boolean } | null = null;
      try { battery = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.() ?? null; } catch {}
      const sent = Date.now();
      const { status, data } = await api("/api/kiosk/heartbeat", {
        camera: track ? track.readyState : "none", online: navigator.onLine, wakeLock: wakeHeld.current,
        battery: battery?.level, charging: battery?.charging, build: build.current,
      });
      if (!data || status !== 200) { setOffline(true); return; }
      setOffline(false);
      const server = Date.parse(data.now as string);
      if (!Number.isNaN(server)) clockOffset.current = server - (sent + Date.now()) / 2;
      const idle = !busy.current;
      if (build.current && data.build !== build.current && idle) location.reload();
      build.current = data.build as string;
      const hour = Number(new Date().toLocaleString("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }));
      if (hour === 3 && Date.now() - loadedAt > 2 * 3600_000 && idle) location.reload();
    };
    beat();
    const id = setInterval(beat, HEARTBEAT);
    return () => clearInterval(id);
  }, [tz]);

  // Move focus into the overlay so keyboard and screen-reader users land on it.
  useEffect(() => { if (view.t !== "scanning") dialogRef.current?.focus(); }, [view.t]);

  const overlay = view.t !== "scanning";

  return (
    <main className="fixed inset-0 bg-slate-950 text-white flex flex-col select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {offline && (
        <div role="alert" className="bg-rose-600 text-white text-center px-4 py-2 font-medium">
          No internet: scans are not being saved. Tell your manager the time you arrived or left.
        </div>
      )}
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

      <div className="relative flex-1 grid place-items-center px-6 pb-6" inert={overlay}>
        <div className="relative w-full max-w-xl aspect-[4/3] rounded-3xl overflow-hidden bg-slate-900 ring-1 ring-slate-800">
          <video ref={videoRef} className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} muted playsInline />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-1/2 aspect-square rounded-2xl border-4 border-teal-300/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
          </div>
          {camError && <div className="absolute inset-0 grid place-items-center p-8 text-center text-slate-300 bg-slate-900">{camError}</div>}
        </div>
        <p className="mt-6 text-xl text-slate-300 text-center">Hold your QR card up to the camera</p>
        <button type="button" onClick={switchCamera} className="mt-3 text-sm text-slate-400 underline underline-offset-4 p-2">Switch camera</button>
      </div>

      {overlay && (
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="kiosk-title"
          className="absolute inset-0 overflow-y-auto grid place-items-center bg-slate-950/95 p-6 outline-none">
          <div className="w-full max-w-xl text-center">
            <div role="status" className="sr-only">
              {view.t === "done" ? `${doneLabel(view.action)}, ${view.name}` : view.t === "message" ? `${view.title}. ${view.body ?? ""}` : ""}
            </div>
            {view.t === "checking" && <p id="kiosk-title" className="text-2xl text-slate-300">Checking card…</p>}
            {view.t === "saving" && <p id="kiosk-title" className="text-2xl text-slate-300">Saving, {view.name}…</p>}

            {view.t === "choose" && (
              <>
                <h1 id="kiosk-title" className="text-4xl font-semibold">Hi {view.name}</h1>
                <p className="mt-3 text-lg text-slate-300">
                  {view.state === "off" ? (view.stale ? "Your last shift wasn't clocked out. Ask your manager to fix it." : "You're not clocked in.")
                    : view.state === "on_break" ? `On a break since ${view.since ? time(view.since) : ""}.`
                    : `On shift since ${view.since ? time(view.since) : ""}.`}
                </p>
                <div className="mt-8 grid gap-4">
                  {view.actions.map(a => (
                    <button key={a} type="button" onClick={() => confirm(view.code, view.name, a)}
                      className={`rounded-2xl py-6 text-3xl font-semibold transition-colors ${TONE[a]}`}>{label(a)}</button>
                  ))}
                  <button type="button" onClick={cancel} className="rounded-2xl py-4 text-xl text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900">Cancel</button>
                </div>
              </>
            )}

            {view.t === "done" && (
              <>
                <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-5xl ${TONE[view.action]}`} aria-hidden="true">✓</div>
                <h1 id="kiosk-title" className="mt-6 text-4xl font-semibold">{doneLabel(view.action)}</h1>
                <p className="mt-3 text-2xl text-slate-300">{view.name}, {time(view.at)}</p>
                {view.flagged && <p className="mt-4 text-amber-300">Saved, and flagged for your manager to check.</p>}
              </>
            )}

            {view.t === "message" && (
              <>
                <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-5xl ${view.tone === "error" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`} aria-hidden="true">
                  {view.tone === "error" ? "!" : "i"}
                </div>
                <h1 id="kiosk-title" className="mt-6 text-3xl font-semibold">{view.title}</h1>
                {view.body && <p className="mt-3 text-xl text-slate-300">{view.body}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
