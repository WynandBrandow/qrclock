"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { finishPasskeySetup, startPasskeySetup } from "@/app/passkeys/actions";

/** "Set up Face ID / fingerprint" on this phone. */
export default function PasskeySetup({ label = "Set up Face ID / fingerprint" }: { label?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const start = await startPasskeySetup();
      if (!start.ok) { setMsg({ tone: "error", text: start.error }); return; }
      const response = await startRegistration({ optionsJSON: start.options });
      const device = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone / iPad" : /Android/.test(navigator.userAgent) ? "Android phone" : "This device";
      const done = await finishPasskeySetup(response, device);
      if (!done.ok) { setMsg({ tone: "error", text: done.error }); return; }
      setMsg({ tone: "ok", text: "Done. Your phone will ask for Face ID or your fingerprint when you clock in." });
      router.refresh();
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setMsg({ tone: "error", text: name === "NotAllowedError" ? "Cancelled. Tap the button to try again." : name === "InvalidStateError" ? "This phone is already set up." : "This phone couldn't set it up. It needs a screen lock (Face ID, fingerprint or PIN)." });
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary" disabled={busy} onClick={go}>{busy ? "Waiting for your phone…" : label}</button>
      {msg && <p className={`text-sm ${msg.tone === "ok" ? "text-teal-700" : "text-red-700"}`} role={msg.tone === "ok" ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}
