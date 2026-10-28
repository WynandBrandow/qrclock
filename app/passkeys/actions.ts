"use server";
import { revalidatePath } from "next/cache";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { assertViewer, getViewer } from "@/lib/auth";
import { authenticationOptions, finishRegistration, registrationOptions } from "@/lib/passkeys";
import { db } from "@/lib/supabase/server";

// Passkey setup and removal for the signed-in person (their own phone).

export async function startPasskeySetup() {
  const v = await getViewer();
  if (!v) return { ok: false as const, error: "You're signed out. Sign in again on this phone." };
  return { ok: true as const, options: await registrationOptions(v) };
}

export async function finishPasskeySetup(response: RegistrationResponseJSON, label: string) {
  const v = await getViewer();
  if (!v) return { ok: false as const, error: "You're signed out. Sign in again on this phone." };
  try {
    const r = await finishRegistration(v, response, label);
    if (r.ok) revalidatePath("/", "layout");
    return r;
  } catch (e) {
    console.error("passkey register", e);
    return { ok: false as const, error: "That didn't save. Please try again." };
  }
}

export async function startPasskeyCheck() {
  const v = await getViewer();
  if (!v) return { ok: false as const, error: "You're signed out. Sign in again on this phone." };
  return { ok: true as const, options: await authenticationOptions(v) };
}

/** Remove one of my own passkeys. */
export async function removeMyPasskey(id: string) {
  const v = await getViewer();
  if (!v) return;
  await db().from("passkeys").delete().eq("id", id).eq("employee_id", v.employee.id);
  revalidatePath("/", "layout");
}

/** Admin: remove all of someone's passkeys (new or lost phone). They set up again on the next scan. */
export async function removeAllPasskeys(_: unknown, form: FormData) {
  try {
    const v = await assertViewer(["admin"]);
    const id = String(form.get("id"));
    const { data: emp } = await db().from("employees").select("company_id, full_name").eq("id", id).maybeSingle();
    if (!emp || emp.company_id !== v.company.id) throw new Error("Not allowed");
    const { error } = await db().from("passkeys").delete().eq("employee_id", id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, message: `Removed. ${emp.full_name} sets up Face ID or fingerprint again on their next scan.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "That didn't save. Try again." };
  }
}
