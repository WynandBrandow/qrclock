import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { saveLocation } from "../actions";
import Form from "@/components/Form";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Locations" };

export default async function Locations() {
  const v = await requireViewer(["admin"]);
  const { data: locs } = await db().from("locations").select("id, name, active").eq("company_id", v.company.id).order("name");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Locations" sub="Optional. Work sites: give each kiosk a location and every scan records where it happened." />
      <div className="space-y-3 mb-8">
        {!locs?.length && <Empty>No locations yet.</Empty>}
        {(locs ?? []).map(l => (
          <div key={l.id} className="card p-4">
            <Form action={saveLocation} submit="Save" tone="secondary" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={l.id} />
              <div className="flex-1 min-w-48"><label className="label" htmlFor={`l-${l.id}`}>Name</label><input id={`l-${l.id}`} name="name" className="input" defaultValue={l.name} required /></div>
              <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4 accent-teal-600" /> Active</label>
            </Form>
          </div>
        ))}
      </div>
      <section className="card p-5 max-w-xl">
        <h2 className="font-semibold mb-4">Add a location</h2>
        <Form action={saveLocation} submit="Add location" reset>
          <div><label className="label" htmlFor="new-location">Name</label><input id="new-location" name="name" className="input" placeholder="e.g. Maryborough depot" required /></div>
        </Form>
      </section>
    </div>
  );
}
