"use server";
import { revalidatePath } from "next/cache";
import { assertViewer, type Viewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { hashPin, randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/cards";

export type FormResult = { ok: boolean; error?: string; message?: string; link?: string };

const admin = () => assertViewer(["admin"]);
const ROLES = ["employee", "manager", "admin"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function fail(e: unknown): FormResult {
  console.error(e);
  if (e instanceof Error && e.message === "Not allowed") return { ok: false, error: "Only administrators can do that." };
  if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") return { ok: false, error: "That email is already used by another employee." };
  return { ok: false, error: "That didn't save. Try again." };
}

async function own(v: Viewer, table: "employees" | "locations" | "kiosks", id: string) {
  const { data } = await db().from(table).select("company_id").eq("id", id).maybeSingle();
  if (!data || data.company_id !== v.company.id) throw new Error("Not allowed");
}

function saved(message: string, extra: Partial<FormResult> = {}): FormResult {
  revalidatePath("/", "layout");
  return { ok: true, message, ...extra };
}

// ── Employees ──────────────────────────────────────────────────────────────────────────────────

export async function saveEmployee(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    const full_name = str(f, "full_name");
    const email = str(f, "email").toLowerCase() || null;
    const role = str(f, "role") || "employee";
    const active = id ? f.get("active") === "on" : true;
    if (!full_name) return { ok: false, error: "Enter the employee's name." };
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
    if (!ROLES.includes(role)) return { ok: false, error: "Pick a role." };
    if (role !== "employee" && !email) return { ok: false, error: "Managers and administrators need an email to sign in." };

    if (id) {
      await own(v, "employees", id);
      if (id === v.employee.id && (role !== "admin" || !active)) return { ok: false, error: "You can't remove your own administrator access." };
      const { data: before } = await db().from("employees").select("email").eq("id", id).single();
      // A new email signs in as a new account.
      const patch = { full_name, email, role, active, updated_at: new Date().toISOString(), ...(before?.email !== email ? { user_id: null } : {}) };
      const { error } = await db().from("employees").update(patch).eq("id", id);
      if (error) throw error;
      return saved("Saved.");
    }
    const { data, error } = await db().from("employees").insert({ company_id: v.company.id, full_name, email, role }).select("id").single();
    if (error) throw error;
    return saved(`${full_name} added.`, { link: `/setup/employees/${data.id}` });
  } catch (e) { return fail(e); }
}

export async function setPin(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id"), pin = str(f, "pin");
    await own(v, "employees", id);
    if (!pin) {
      await db().from("employees").update({ pin_hash: null }).eq("id", id);
      return saved("PIN removed. They can no longer sign in with their card.");
    }
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "A PIN is 4 to 8 digits." };
    if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, error: "Pick a PIN that's harder to guess." };
    const { error } = await db().from("employees").update({ pin_hash: hashPin(pin), pin_failed_count: 0, pin_locked_until: null }).eq("id", id);
    if (error) throw error;
    return saved("PIN set.");
  } catch (e) { return fail(e); }
}

export async function newQrCode(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    await own(v, "employees", id);
    const { error } = await db().from("employees").update({ qr_token: randomToken(18), qr_issued_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return saved("New QR code made. The old card no longer works; print the new one.");
  } catch (e) { return fail(e); }
}

// ── Locations ──────────────────────────────────────────────────────────────────────────────────

export async function saveLocation(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id"), name = str(f, "name");
    if (!name) return { ok: false, error: "Enter a name." };
    if (id) {
      await own(v, "locations", id);
      const { error } = await db().from("locations").update({ name, active: f.get("active") === "on" }).eq("id", id);
      if (error) throw error;
      return saved("Saved.");
    }
    const { error } = await db().from("locations").insert({ company_id: v.company.id, name });
    if (error) throw error;
    return saved(`${name} added.`);
  } catch (e) { return fail(e); }
}

// ── Kiosks ─────────────────────────────────────────────────────────────────────────────────────

export async function saveKiosk(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id"), name = str(f, "name"), location_id = str(f, "location_id") || null;
    if (!name) return { ok: false, error: "Give the kiosk a name, e.g. 'Front desk tablet'." };
    if (location_id) await own(v, "locations", location_id);
    if (id) {
      await own(v, "kiosks", id);
      const active = f.get("active") === "on";
      const patch = { name, location_id, active, ...(active ? {} : { device_secret_hash: null, pairing_code_hash: null, pairing_expires_at: null }) };
      const { error } = await db().from("kiosks").update(patch).eq("id", id);
      if (error) throw error;
      return saved(active ? "Saved." : "Kiosk switched off and unpaired.");
    }
    const { error } = await db().from("kiosks").insert({ company_id: v.company.id, name, location_id });
    if (error) throw error;
    return saved(`${name} added. Now pair a device with it.`);
  } catch (e) { return fail(e); }
}

/** One-time link (valid 30 minutes) that turns the device that opens it into this kiosk. */
export async function pairKiosk(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    await own(v, "kiosks", id);
    const code = randomToken(24);
    const { error } = await db().from("kiosks").update({
      pairing_code_hash: sha256(code), pairing_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }).eq("id", id).eq("active", true);
    if (error) throw error;
    return saved("Open this link on the kiosk device within 30 minutes. It works once.", { link: `${await appUrl()}/kiosk/pair?code=${code}` });
  } catch (e) { return fail(e); }
}

export async function unpairKiosk(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    await own(v, "kiosks", id);
    const { error } = await db().from("kiosks").update({ device_secret_hash: null, paired_at: null }).eq("id", id);
    if (error) throw error;
    return saved("Device unpaired. It can no longer record scans.");
  } catch (e) { return fail(e); }
}

// ── Settings ───────────────────────────────────────────────────────────────────────────────────

export async function saveSettings(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const name = str(f, "name"), timezone = str(f, "timezone");
    const week_start = Number(f.get("week_start")), duplicate_window_seconds = Number(f.get("duplicate_window_seconds"));
    const long_shift_hours = Number(f.get("long_shift_hours"));
    if (!name) return { ok: false, error: "Enter the business name." };
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return { ok: false, error: "Pick a valid time zone." }; }
    if (!(week_start >= 0 && week_start <= 6)) return { ok: false, error: "Pick the first day of the work week." };
    if (!(duplicate_window_seconds >= 5 && duplicate_window_seconds <= 3600)) return { ok: false, error: "Repeat-scan window must be 5 to 3600 seconds." };
    if (!(long_shift_hours >= 1 && long_shift_hours <= 48)) return { ok: false, error: "Longest shift must be 1 to 48 hours." };
    const { error } = await db().from("companies").update({
      name, timezone, week_start, duplicate_window_seconds, long_shift_hours,
      track_breaks: f.get("track_breaks") === "on", breaks_paid: f.get("breaks_paid") === "on", record_location: f.get("record_location") === "on",
    }).eq("id", v.company.id);
    if (error) throw error;
    return saved("Settings saved.");
  } catch (e) { return fail(e); }
}
