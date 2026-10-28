import Link from "next/link";
import { db } from "@/lib/supabase/server";
import type { Company } from "@/lib/auth";
import { localDate } from "@/lib/time";

/** Setup checklist for administrators, worked out from the data. Hidden once the essentials are done. */
export default async function GetStarted({ company }: { company: Company }) {
  const year = localDate(new Date(), company.timezone).slice(0, 4);
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then(r => r.count ?? 0);
  const [staff, kiosks, scans, holidays, posters] = await Promise.all([
    count(db().from("employees").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("active", true)),
    count(db().from("kiosks").select("id", { count: "exact", head: true }).eq("company_id", company.id).not("device_secret_hash", "is", null)),
    count(db().from("clock_events").select("id", { count: "exact", head: true }).eq("company_id", company.id).in("source", ["kiosk", "phone"])),
    count(db().from("public_holidays").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("date", `${year}-01-01`)),
    count(db().from("locations").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("active", true).not("latitude", "is", null)),
  ]);

  const steps = [
    { done: true, title: "Check your settings", body: "Time zone, pay week, paid or unpaid breaks.", href: "/setup/settings", cta: "Settings" },
    { done: staff > 1, title: "Add your staff", body: "Name, role, and an email for anyone who will sign in.", href: "/setup/employees", cta: "Employees" },
    { done: holidays > 0, title: "Add public holidays", body: "One click for Queensland, then your local show day.", href: "/setup/holidays", cta: "Holidays" },
    { done: false, optional: true, title: "Print cards or key tags", body: "Wallet cards (10 per page) or key tags (30 per page).", href: "/setup/cards", cta: "QR cards" },
    { done: kiosks > 0 || (company.phone_clocking && posters > 0), title: "Put up the depot QR poster", body: "Switch on phone clocking in Settings, add the depot with its position under Locations, and print its poster. (Or pair a kiosk tablet.)", href: "/setup/locations", cta: "Locations" },
    { done: scans > 0, title: "Do a test scan", body: "Scan the poster with your phone and clock in, then check it shows under Today.", href: "/today", cta: "" },
  ];
  const essentials = steps.filter(s => !s.optional);
  if (essentials.every(s => s.done)) return null;
  const doneCount = essentials.filter(s => s.done).length;

  return (
    <section className="card p-5 mb-6" aria-labelledby="get-started">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 id="get-started" className="text-lg font-semibold">Get started</h2>
        <span className="text-sm text-slate-600">{doneCount} of {essentials.length} done</span>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 ring-1 ring-slate-300"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${s.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                {s.title}{s.optional && <span className="font-normal text-slate-500"> (when ready)</span>}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </div>
              {!s.done && <div className="text-sm text-slate-600">{s.body}</div>}
            </div>
            {!s.done && s.cta && <Link href={s.href} className="btn-secondary px-3 py-1.5 text-xs min-h-9 shrink-0">{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
