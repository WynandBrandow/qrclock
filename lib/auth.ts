import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authClient, db } from "./supabase/server";
import { sign, unsign } from "./crypto";
import type { Settings } from "./shifts";

export type Role = "employee" | "manager" | "admin";

export type Employee = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  user_id: string | null;
  role: Role;
  qr_token: string;
  qr_issued_at: string;
  pin_hash: string | null;
  pin_failed_count: number;
  pin_locked_until: string | null;
  pin_version: number;
  payroll_code: string | null;
  employment_type: string | null;
  start_date: string | null;
  phone: string | null;
  active: boolean;
};

export type Company = Settings & {
  id: string;
  name: string;
  duplicate_window_seconds: number;
  record_location: boolean;
  daily_summary: boolean;
  phone_clocking: boolean;
  phone_require_location: boolean;
  phone_require_passkey: boolean;
};

export type Viewer = {
  employee: Employee;
  company: Company;
  /** 'email' = Supabase magic link. 'pin' = QR card + PIN on a phone, limited to the person's own hours. */
  via: "email" | "pin";
  /** Role used for access checks. PIN sessions are always treated as 'employee'. */
  role: Role;
};

export const PIN_COOKIE = "qc_pin";
const PIN_HOURS = 12;
const REMEMBER_DAYS = 120;

export const canManage = (role: Role) => role === "manager" || role === "admin";

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supa = await authClient();
  const { data: { user } } = await supa.auth.getUser();

  if (user) {
    let { data: emp } = await db().from("employees").select("*").eq("user_id", user.id).maybeSingle<Employee>();
    if (!emp && user.email && user.email_confirmed_at) {
      // First sign-in: link the auth account to the employee with this email.
      const { data: byEmail } = await db().from("employees").select("*")
        .eq("email", user.email.toLowerCase()).is("user_id", null).eq("active", true).limit(1).maybeSingle<Employee>();
      if (byEmail) {
        await db().from("employees").update({ user_id: user.id }).eq("id", byEmail.id);
        emp = { ...byEmail, user_id: user.id };
      }
    }
    if (emp?.active) {
      const company = await getCompany(emp.company_id);
      return { employee: emp, company, via: "email", role: emp.role };
    }
  }

  const store = await cookies();
  const payload = unsign(store.get(PIN_COOKIE)?.value);
  if (payload) {
    const [id, exp, version] = payload.split("|");
    if (Number(exp) > Date.now()) {
      const { data: emp } = await db().from("employees").select("*").eq("id", id).maybeSingle<Employee>();
      // A new PIN or a new card bumps pin_version, which ends every PIN session already open.
      if (emp?.active && String(emp.pin_version) === version) return { employee: emp, company: await getCompany(emp.company_id), via: "pin", role: "employee" };
    }
  }
  return null;
});

export async function getCompany(id: string): Promise<Company> {
  const { data, error } = await db().from("companies").select("*").eq("id", id).single<Company>();
  if (error || !data) throw new Error("company not found");
  return data;
}

/** For pages: sends visitors without the role elsewhere. */
export async function requireViewer(roles?: Role[]): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (roles && !roles.includes(v.role)) redirect("/me");
  return v;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertViewer(roles?: Role[]): Promise<Viewer> {
  const v = await getViewer();
  if (!v || (roles && !roles.includes(v.role))) throw new Error("Not allowed");
  return v;
}

/** remember = "this is my own phone": stay signed in for 120 days, so the depot poster works in one scan. */
export async function startPinSession(employeeId: string, pinVersion: number, remember = false) {
  const hours = remember ? REMEMBER_DAYS * 24 : PIN_HOURS;
  const exp = Date.now() + hours * 3600_000;
  (await cookies()).set(PIN_COOKIE, sign(`${employeeId}|${exp}|${pinVersion}`), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: hours * 3600,
  });
}

export async function endSessions() {
  (await cookies()).delete(PIN_COOKIE);
  const supa = await authClient();
  await supa.auth.signOut();
}
