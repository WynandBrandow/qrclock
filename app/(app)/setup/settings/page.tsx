import { requireViewer } from "@/lib/auth";
import { saveSettings } from "../actions";
import Form from "@/components/Form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Settings() {
  const v = await requireViewer(["admin"]);
  const c = v.company;
  const zones = Intl.supportedValuesOf("timeZone");
  const check = (name: string, on: boolean, label: string, hint: string) => (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-1 h-4 w-4 accent-teal-600" />
      <span><span className="text-sm font-medium text-slate-800">{label}</span><span className="block text-sm text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <section className="card p-5">
        <Form action={saveSettings} submit="Save settings" className="space-y-5">
          <div><label className="label" htmlFor="name">Business name</label><input id="name" name="name" className="input" defaultValue={c.name} required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="timezone">Time zone</label>
              <select id="timezone" name="timezone" className="input" defaultValue={c.timezone}>
                {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="week_start">Work week starts on</label>
              <select id="week_start" name="week_start" className="input" defaultValue={c.week_start}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="space-y-3">
            <legend className="label">Breaks</legend>
            {check("track_breaks", c.track_breaks, "Track breaks", "Staff scan their card to start and end a break.")}
            {check("breaks_paid", c.breaks_paid, "Breaks are paid", "When off, break time is deducted from hours worked.")}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="label">Scans</legend>
            {check("record_location", c.record_location, "Record the kiosk and location", "Each scan stores which kiosk and location it came from.")}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="dup">Ignore repeat scans within (seconds)</label>
                <input id="dup" name="duplicate_window_seconds" type="number" min={5} max={3600} className="input" defaultValue={c.duplicate_window_seconds} />
              </div>
              <div>
                <label className="label" htmlFor="long">Flag shifts open longer than (hours)</label>
                <input id="long" name="long_shift_hours" type="number" min={1} max={48} className="input" defaultValue={c.long_shift_hours} />
              </div>
            </div>
          </fieldset>
        </Form>
      </section>
    </div>
  );
}
