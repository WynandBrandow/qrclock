import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";
import { pairKiosk, saveKiosk, unpairKiosk } from "../actions";
import Form from "@/components/Form";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Kiosks" };

type Row = { id: string; name: string; location_id: string | null; active: boolean; device_secret_hash: string | null; paired_at: string | null; last_seen_at: string | null };

export default async function Kiosks() {
  const v = await requireViewer(["admin"]);
  const tz = v.company.timezone;
  const [{ data: kiosks }, { data: locs }] = await Promise.all([
    db().from("kiosks").select("id, name, location_id, active, device_secret_hash, paired_at, last_seen_at").eq("company_id", v.company.id).order("created_at"),
    db().from("locations").select("id, name").eq("company_id", v.company.id).eq("active", true).order("name"),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Kiosks" sub="A kiosk is a tablet or phone at the workplace where staff scan their cards. Each one is paired once with a link." />

      <div className="space-y-4 mb-8">
        {!kiosks?.length && <Empty>No kiosks yet. Add one below, then pair the tablet.</Empty>}
        {((kiosks ?? []) as Row[]).map(k => (
          <section key={k.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-semibold">{k.name}</h2>
              <div className="flex gap-2">
                {!k.active ? <Badge>Off</Badge> : k.device_secret_hash ? <Badge tone="teal">Paired</Badge> : <Badge tone="amber">Not paired</Badge>}
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {k.paired_at ? `Paired ${fmtDateTime(k.paired_at, tz)}. ` : ""}
              {k.last_seen_at ? `Last scan ${fmtDateTime(k.last_seen_at, tz)}.` : "No scans yet."}
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <Form action={saveKiosk} submit="Save">
                <input type="hidden" name="id" value={k.id} />
                <div><label className="label">Name</label><input name="name" className="input" defaultValue={k.name} required /></div>
                <LocationSelect locs={locs ?? []} value={k.location_id} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={k.active} className="h-4 w-4 accent-teal-600" /> On (switching off also unpairs it)</label>
              </Form>
              {k.active && (
                <div className="space-y-4">
                  <Form action={pairKiosk} submit={k.device_secret_hash ? "Pair a different device" : "Pair a device"} showQr>
                    <input type="hidden" name="id" value={k.id} />
                  </Form>
                  {k.device_secret_hash && (
                    <Form action={unpairKiosk} submit="Unpair current device" tone="danger">
                      <input type="hidden" name="id" value={k.id} />
                    </Form>
                  )}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="card p-5 max-w-xl">
        <h2 className="font-semibold mb-4">Add a kiosk</h2>
        <Form action={saveKiosk} submit="Add kiosk" reset>
          <div><label className="label">Name</label><input name="name" className="input" placeholder="e.g. Reception tablet" required /></div>
          <LocationSelect locs={locs ?? []} />
        </Form>
      </section>
    </div>
  );
}

function LocationSelect({ locs, value }: { locs: { id: string; name: string }[]; value?: string | null }) {
  return (
    <div>
      <label className="label">Location</label>
      <select name="location_id" className="input" defaultValue={value ?? ""}>
        <option value="">No location</option>
        {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  );
}
