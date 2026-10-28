"use client";
import { useId, useRef, useState } from "react";

/** Latitude / longitude / radius inputs, with "use my current location" for an admin standing at the depot. */
export default function LocationFields({ lat, lng, radius }: { lat?: number | null; lng?: number | null; radius?: number }) {
  const id = useId();
  const latRef = useRef<HTMLInputElement>(null), lngRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const here = () => {
    if (!navigator.geolocation) return setMsg("This browser can't share its location.");
    setMsg("Finding your position…");
    navigator.geolocation.getCurrentPosition(
      p => {
        if (latRef.current) latRef.current.value = p.coords.latitude.toFixed(6);
        if (lngRef.current) lngRef.current.value = p.coords.longitude.toFixed(6);
        setMsg(`Done, accurate to about ${Math.round(p.coords.accuracy)} m. Press Save.`);
      },
      () => setMsg("Couldn't get your position. Allow location for this site and try again."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor={`${id}-lat`}>Latitude</label><input ref={latRef} id={`${id}-lat`} name="latitude" inputMode="decimal" className="input" defaultValue={lat ?? ""} placeholder="-25.5379" /></div>
        <div><label className="label" htmlFor={`${id}-lng`}>Longitude</label><input ref={lngRef} id={`${id}-lng`} name="longitude" inputMode="decimal" className="input" defaultValue={lng ?? ""} placeholder="152.7016" /></div>
        <div><label className="label" htmlFor={`${id}-r`}>Radius (metres)</label><input id={`${id}-r`} name="radius_m" type="number" min={25} max={5000} className="input" defaultValue={radius ?? 200} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary text-xs" onClick={here}>Use my current location</button>
        {msg && <span className="text-xs text-slate-600" role="status">{msg}</span>}
      </div>
    </div>
  );
}
