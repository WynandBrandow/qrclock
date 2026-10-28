import { requireViewer } from "@/lib/auth";
import { saveSettings, sendTestSummary } from "../actions";
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
              <label className="label" htmlFor="week_start">Pay week starts on</label>
              <select id="week_start" name="week_start" className="input" defaultValue={c.week_start}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="space-y-3">
            <legend className="label">Breaks</legend>
            {check("track_breaks", c.track_breaks, "Track breaks", "Staff scan their card to start and end a break.")}
            {check("breaks_paid", c.breaks_paid, "Meal breaks are paid", "When off, meal break time is deducted from hours worked.")}
            {check("rest_breaks", c.rest_breaks, "Separate paid rest breaks", "The kiosk offers “Meal break” (unpaid unless paid above) and “Rest break” (always paid, e.g. a 10-minute award rest break).")}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="meal_after">Warn when no meal break after (hours)</label>
                <input id="meal_after" name="meal_break_after_hours" type="number" step="0.25" min={0} max={24} className="input" defaultValue={c.meal_break_after_hours} />
                <p className="text-xs text-slate-500 mt-1">0 turns the warning off. Many awards: 5 hours.</p>
              </div>
              <div>
                <label className="label" htmlFor="meal_min">Shortest meal break that counts (minutes)</label>
                <input id="meal_min" name="min_meal_break_minutes" type="number" min={0} max={240} className="input" defaultValue={c.min_meal_break_minutes} />
              </div>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="label">Clocking in by phone</legend>
            {check("phone_clocking", c.phone_clocking, "Staff can clock in with their phone", "They scan the depot’s QR poster (Setup → Locations) with their own phone. No tablet needed.")}
            {check("phone_require_passkey", c.phone_require_passkey, "Confirm phone punches with Face ID or fingerprint", "Each person sets it up once on their phone; then every clock-in or out needs their face or fingerprint, so a borrowed or unlocked phone can’t be used. The biometric never leaves the phone.")}
            {check("phone_require_location", c.phone_require_location, "Refuse phone scans away from the depot", "Off: scans from far away (or without location) are recorded but flagged on Review. On: they are refused. Set the depot’s position under Setup → Locations.")}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="label">Alerts</legend>
            {check("daily_summary", c.daily_summary, "Email managers a daily summary", "Early each morning, only when something needs a look: missing clock-outs, flagged scans, last week not approved, a kiosk offline, app errors. Goes to every active manager and administrator with an email.")}
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
      <section className="card p-5 mt-6">
        <h2 className="font-semibold">Try the daily summary</h2>
        <p className="text-sm text-slate-600 mt-1 mb-4">Sends today&apos;s summary to you only, so you can see what managers get.</p>
        <Form action={sendTestSummary} submit="Email me a test summary" tone="secondary" pendingLabel="Sending…" />
      </section>
    </div>
  );
}
