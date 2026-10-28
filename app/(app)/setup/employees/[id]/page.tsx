import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer, type Employee } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { cardSvg } from "@/lib/cards";
import { fmtDateTime } from "@/lib/time";
import { newQrCode, saveEmployee, setPin } from "../../actions";
import Form from "@/components/Form";
import IdCard from "@/components/IdCard";
import { PageHeader } from "@/components/ui";
import { RoleField } from "../fields";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: PageProps<"/setup/employees/[id]">) {
  const v = await requireViewer(["admin"]);
  const { id } = await params;
  const { data: e } = await db().from("employees").select("*").eq("id", id).maybeSingle<Employee>();
  if (!e || e.company_id !== v.company.id) notFound();
  const svg = await cardSvg(e.qr_token);
  const tz = v.company.timezone;

  return (
    <div className="max-w-5xl">
      <div className="text-sm mb-2"><Link className="text-teal-700 hover:underline" href="/setup/employees">← Employees</Link></div>
      <PageHeader title={e.full_name} actions={<Link className="btn-secondary" href={`/timesheets/${e.id}`}>Timesheet</Link>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold mb-4">Details</h2>
          <Form action={saveEmployee} submit="Save">
            <input type="hidden" name="id" value={e.id} />
            <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="input" defaultValue={e.full_name} required /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" defaultValue={e.email ?? ""} /></div>
            <RoleField value={e.role} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="payroll_code">Payroll ID</label>
                <input id="payroll_code" name="payroll_code" className="input" defaultValue={e.payroll_code ?? ""} placeholder="optional" />
              </div>
              <div>
                <label className="label" htmlFor="employment_type">Employment</label>
                <select id="employment_type" name="employment_type" className="input" defaultValue={e.employment_type ?? ""}>
                  <option value="">Not set</option>
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="start_date">Start date</label>
                <input id="start_date" name="start_date" type="date" className="input" defaultValue={e.start_date ?? ""} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={e.active} className="h-4 w-4 accent-teal-600" /> Active (can clock in and sign in)</label>
          </Form>
        </section>

        <section className="card p-5 space-y-5">
          <div>
            <h2 className="font-semibold">QR card</h2>
            <p className="text-sm text-slate-500 mt-1">Issued {fmtDateTime(e.qr_issued_at, tz)}.</p>
          </div>
          <div className="overflow-x-auto"><IdCard name={e.full_name} company={v.company.name} svg={svg} issued={fmtDateTime(e.qr_issued_at, tz)} /></div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/setup/cards?ids=${e.id}`}>Print wallet card</Link>
            <Link className="btn-secondary" href={`/setup/cards?format=tag&ids=${e.id}`}>Print key tag</Link>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Card lost or stolen?</summary>
            <div className="mt-3">
              <Form action={newQrCode} submit="Make a new QR code" tone="danger" pendingLabel="Making…"
                confirm={`Make a new QR code for ${e.full_name}? Their current card stops working straight away.`}>
                <input type="hidden" name="id" value={e.id} />
                <p className="text-slate-600">The old card stops working straight away.</p>
              </Form>
            </div>
          </details>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Card + PIN sign-in</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            {e.pin_hash ? "A PIN is set." : "No PIN yet."} With a PIN, they can scan their own card with a phone camera to see their hours.
          </p>
          <Form action={setPin} submit={e.pin_hash ? "Change PIN" : "Set PIN"} reset>
            <input type="hidden" name="id" value={e.id} />
            <div>
              <label className="label" htmlFor="pin">New PIN (4 to 8 digits)</label>
              <input id="pin" name="pin" className="input max-w-40 tracking-widest" inputMode="numeric" pattern="\d{4,8}" maxLength={8} autoComplete="off" required />
            </div>
          </Form>
          <p className="text-xs text-slate-500 mt-3">Give the PIN to them privately. If they forget it, set a new one here.</p>
          {e.pin_hash && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Form action={setPin} submit="Remove PIN" tone="danger" confirm={`Remove ${e.full_name}'s PIN? They won't be able to sign in with their card.`}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="pin" value="" />
              </Form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
