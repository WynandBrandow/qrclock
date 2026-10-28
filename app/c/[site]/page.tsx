import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { lastEvent } from "@/lib/data";
import { firstName } from "@/lib/kiosk";
import { currentState, nextActions } from "@/lib/shifts";
import PhoneClock from "./PhoneClock";

export const metadata = { title: "Clock in" };

// What a phone opens when someone scans the depot's QR poster.
export default async function SitePage({ params }: PageProps<"/c/[site]">) {
  const { site } = await params;
  const { data: loc } = await db().from("locations").select("id, company_id, name, active, latitude, longitude")
    .eq("qr_token", site).maybeSingle();
  const v = await getViewer();

  const shell = (body: React.ReactNode) => (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-slate-900 text-teal-300 text-xs font-bold">QR</span>
          <span className="text-xl font-semibold tracking-tight">QR Clock</span>
        </div>
        <div className="card p-6">{body}</div>
      </div>
    </main>
  );

  if (!loc || !loc.active) return shell(<p className="text-slate-700">This poster isn&apos;t in use any more. Ask your manager for the current one.</p>);

  if (!v || v.company.id !== loc.company_id) {
    return shell(
      <>
        <h1 className="text-lg font-semibold">Clock in at {loc.name}</h1>
        <p className="text-sm text-slate-600 mt-2">First, sign in on this phone once. After that, scanning this poster takes you straight to the buttons.</p>
        <ol className="mt-4 space-y-3 text-sm text-slate-700 list-decimal pl-5">
          <li><strong>With your QR card or key tag:</strong> scan it with this phone&apos;s camera, enter your PIN, and leave <em>keep me signed in</em> ticked.</li>
          <li><strong>Or with your work email:</strong> <Link className="text-teal-700 underline" href="/login">get a sign-in link</Link>.</li>
        </ol>
        <p className="text-sm text-slate-600 mt-4">Then scan this poster again.</p>
      </>,
    );
  }

  const c = v.company;
  if (!c.phone_clocking) return shell(<p className="text-slate-700">Clocking in by phone isn&apos;t switched on. Use the kiosk, or ask your manager.</p>);
  const last = await lastEvent(v.employee.id);
  const { state, stale } = currentState(last, c);
  return shell(
    <PhoneClock site={site} siteName={loc.name} name={firstName(v.employee.full_name)} tz={c.timezone}
      state={state} stale={stale} since={last?.occurred_at ?? null} actions={nextActions(state, c)}
      restBreaks={c.track_breaks && c.rest_breaks} wantLocation={loc.latitude != null && loc.longitude != null} />,
  );
}
