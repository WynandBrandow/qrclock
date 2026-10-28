import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { must } from "@/lib/data";
import { newPosterCode, saveLocation } from "../actions";
import Form from "@/components/Form";
import LocationFields from "@/components/LocationFields";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Locations" };

export default async function Locations() {
  const v = await requireViewer(["admin"]);
  const locs = must(await db().from("locations").select("id, name, active, latitude, longitude, radius_m")
    .eq("company_id", v.company.id).order("name"));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Locations" sub="Each work site has a QR poster staff scan with their phone to clock in, and an optional position to check they're on site." />
      {!v.company.phone_clocking && (
        <Notice tone="amber">Clocking in by phone is switched off. Turn it on under <Link className="underline" href="/setup/settings">Settings</Link>.</Notice>
      )}
      <div className="space-y-4 mb-8">
        {!locs.length && <Empty>No locations yet. Add your depot below.</Empty>}
        {locs.map(l => (
          <section key={l.id} className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{l.name}</h2>
              <div className="flex gap-2">
                {!l.active && <Badge>Not in use</Badge>}
                {l.latitude == null ? <Badge tone="amber">No position set</Badge> : <Badge tone="teal">Position set, {l.radius_m} m</Badge>}
              </div>
            </div>
            <Form action={saveLocation} submit="Save" tone="secondary">
              <input type="hidden" name="id" value={l.id} />
              <div><label className="label" htmlFor={`l-${l.id}`}>Name</label><input id={`l-${l.id}`} name="name" className="input" defaultValue={l.name} required /></div>
              <LocationFields lat={l.latitude} lng={l.longitude} radius={l.radius_m} />
              <p className="text-xs text-slate-600">Stand at the depot and tap <em>Use my current location</em>, or paste the coordinates from a map. Phone scans further away than the radius are flagged (or refused, if Settings says so).</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4 accent-teal-600" /> Active</label>
            </Form>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              <Link className="btn-primary" href={`/setup/locations/${l.id}/poster`}>Print QR poster</Link>
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Poster photographed or shared?</summary>
                <div className="mt-3">
                  <Form action={newPosterCode} submit="Make a new poster code" tone="danger"
                    confirm={`Make a new poster code for ${l.name}? The current poster stops working straight away; print and put up the new one.`}>
                    <input type="hidden" name="id" value={l.id} />
                  </Form>
                </div>
              </details>
            </div>
          </section>
        ))}
      </div>
      <section className="card p-5">
        <h2 className="font-semibold mb-4">Add a location</h2>
        <Form action={saveLocation} submit="Add location" reset>
          <div><label className="label" htmlFor="new-location">Name</label><input id="new-location" name="name" className="input" placeholder="e.g. Maryborough depot" required /></div>
          <LocationFields />
        </Form>
      </section>
    </div>
  );
}
