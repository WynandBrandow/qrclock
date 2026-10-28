import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { must } from "@/lib/data";
import { fmtDay, localDate } from "@/lib/time";
import { addHoliday, addQueenslandHolidays, removeHoliday } from "../actions";
import Form from "@/components/Form";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Public holidays" };

const hm = (t: string) => t.slice(0, 5);

export default async function Holidays() {
  const v = await requireViewer(["admin"]);
  const thisYear = Number(localDate(new Date(), v.company.timezone).slice(0, 4));
  const rows = must(await db().from("public_holidays").select("id, date, name, from_time, to_time")
    .eq("company_id", v.company.id).gte("date", `${thisYear - 1}-01-01`).order("date").order("from_time"));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Public holidays"
        sub="Hours worked on these days are shown separately on timesheets and in the export, so payroll can apply holiday rates." />

      <section className="card p-5 mb-6">
        <h2 className="font-semibold">Add Queensland holidays</h2>
        <p className="text-sm text-slate-600 mt-1 mb-4">
          Fills in the statewide days from Queensland&apos;s standard rules, including Christmas Eve from 6 pm. Check the list against{" "}
          <a className="text-teal-700 underline" href="https://www.qld.gov.au/recreation/travel/holidays/public" target="_blank" rel="noreferrer">qld.gov.au</a>,
          and add your local show holiday below.
        </p>
        <Form action={addQueenslandHolidays} submit="Add holidays" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="year">Year</label>
            <select id="year" name="year" className="input" defaultValue={thisYear}>
              {[thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </Form>
      </section>

      {rows.length === 0 ? <Empty>No holidays yet.</Empty> : (
        <ul className="card divide-y divide-slate-100 mb-6">
          {rows.map(h => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium">{h.name}</div>
                <div className="text-sm text-slate-600">
                  {fmtDay(h.date)} {h.date.slice(0, 4)}
                  {(hm(h.from_time) !== "00:00" || !h.to_time.startsWith("24")) && <> · {hm(h.from_time)}–{h.to_time.startsWith("24") ? "midnight" : hm(h.to_time)}</>}
                </div>
              </div>
              <Form action={removeHoliday} submit="Remove" tone="secondary" confirm={`Remove ${h.name}?`}>
                <input type="hidden" name="id" value={h.id} />
              </Form>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-5 max-w-xl">
        <h2 className="font-semibold mb-4">Add a holiday</h2>
        <Form action={addHoliday} submit="Add holiday" reset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="h-date">Date</label><input id="h-date" name="date" type="date" className="input" required /></div>
            <div><label className="label" htmlFor="h-name">Name</label><input id="h-name" name="name" className="input" placeholder="e.g. Fraser Coast show day" required /></div>
            <div><label className="label" htmlFor="h-from">From</label><input id="h-from" name="from_time" type="time" className="input" defaultValue="00:00" /></div>
            <div>
              <label className="label" htmlFor="h-to">Until <span className="font-normal text-slate-500">(empty = midnight)</span></label>
              <input id="h-to" name="to_time" type="time" className="input" />
            </div>
          </div>
        </Form>
      </section>
    </div>
  );
}
