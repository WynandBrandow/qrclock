import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { saveEmployee } from "../actions";
import Form from "@/components/Form";
import { Badge, PageHeader } from "@/components/ui";
import { RoleField } from "./fields";

export const metadata = { title: "Employees" };

export default async function Employees() {
  const v = await requireViewer(["admin"]);
  const { data: emps } = await db().from("employees")
    .select("id, full_name, email, role, active, pin_hash, user_id").eq("company_id", v.company.id)
    .order("active", { ascending: false }).order("full_name");

  return (
    <div className="max-w-5xl">
      <PageHeader title="Employees" sub={`${emps?.filter(e => e.active).length ?? 0} active`}
        actions={<Link className="btn-secondary" href="/setup/cards">Print QR cards</Link>} />

      <div className="card overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(emps ?? []).map(e => (
              <tr key={e.id} className={e.active ? "" : "opacity-60"}>
                <td className="px-4 py-3">
                  <Link className="font-medium text-teal-700 hover:underline" href={`/setup/employees/${e.id}`}>{e.full_name}</Link>
                  {!e.active && <span className="ml-2"><Badge>Inactive</Badge></span>}
                </td>
                <td className="px-4 py-3 text-slate-600 break-all">{e.email ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{e.role}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {e.email && <Badge tone={e.user_id ? "teal" : "slate"}>{e.user_id ? "Email (used)" : "Email"}</Badge>}
                    {e.pin_hash && <Badge tone="blue">Card + PIN</Badge>}
                    {!e.email && !e.pin_hash && <span className="text-slate-400">Kiosk only</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5 max-w-xl">
        <h2 className="font-semibold mb-4">Add an employee</h2>
        <Form action={saveEmployee} submit="Add employee" reset linkLabel="Open their page to set a PIN or print their card →">
          <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="input" required /></div>
          <div>
            <label className="label" htmlFor="email">Email <span className="font-normal text-slate-500">(optional for employees)</span></label>
            <input id="email" name="email" type="email" className="input" />
          </div>
          <RoleField />
        </Form>
      </section>
    </div>
  );
}
