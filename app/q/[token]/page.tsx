import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { canManage, getViewer } from "@/lib/auth";
import { firstName } from "@/lib/kiosk";
import PinForm from "./PinForm";

export const metadata = { title: "My card" };

// What a phone opens when someone scans a QR card with its camera app.
export default async function CardPage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const { data: emp } = await db().from("employees").select("id, full_name, active, pin_hash, company_id")
    .eq("qr_token", token).maybeSingle();

  const v = await getViewer();
  if (emp && v) {
    if (v.employee.id === emp.id) redirect("/me");
    if (canManage(v.role) && v.company.id === emp.company_id) redirect(`/timesheets/${emp.id}`);
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-slate-900 text-teal-300 text-xs font-bold">QR</span>
          <span className="text-xl font-semibold tracking-tight">QR Clock</span>
        </div>
        <div className="card p-6">
          {!emp || !emp.active ? (
            <p className="text-sm text-slate-700">This card isn&apos;t active. If it&apos;s yours, ask your manager for a new one.</p>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Hi {firstName(emp.full_name)}</h1>
              <p className="text-sm text-slate-600 mt-1 mb-5">
                To clock in or out, scan this card at the kiosk. To see your hours here, enter your PIN.
              </p>
              {emp.pin_hash ? <PinForm token={token} /> : (
                <p className="text-sm rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-3 py-2">
                  You don&apos;t have a PIN yet. Ask your manager to set one, or sign in with your work email.
                </p>
              )}
            </>
          )}
        </div>
        <p className="text-center text-sm mt-6"><Link className="text-teal-700 underline" href="/login">Sign in with email instead</Link></p>
      </div>
    </main>
  );
}
