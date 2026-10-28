"use client";
import { useTransition } from "react";
import { removeMyPasskey } from "@/app/passkeys/actions";
import PasskeySetup from "./PasskeySetup";

/** My Face ID / fingerprint passkeys: list, add on this phone, remove. */
export default function MyPasskeys({ keys, required, tz }: {
  keys: { id: string; device_label: string | null; created_at: string; last_used_at: string | null }[]; required: boolean; tz: string;
}) {
  const [pending, start] = useTransition();
  const when = (d: string) => new Date(d).toLocaleDateString("en-AU", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>
        {required ? "Your workplace asks you to confirm each phone clock-in with Face ID or your fingerprint." : "Optional: confirm your phone clock-ins with Face ID or your fingerprint."}{" "}
        Your face or fingerprint never leaves your phone.
      </p>
      {keys.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {keys.map(k => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>{k.device_label ?? "Phone"} · set up {when(k.created_at)}{k.last_used_at ? ` · last used ${when(k.last_used_at)}` : ""}</span>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs min-h-9" disabled={pending}
                onClick={() => { if (window.confirm("Remove Face ID / fingerprint for this phone?")) start(() => removeMyPasskey(k.id)); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <PasskeySetup label={keys.length ? "Set up on this phone too" : "Set up Face ID / fingerprint"} />
    </div>
  );
}
