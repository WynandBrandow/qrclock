"use server";
import { revalidatePath } from "next/cache";
import { assertViewer, type Viewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { hashPin, randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/cards";
import { queenslandHolidays } from "@/lib/holidays";
import { buildSummary, sendEmail, summaryEmail } from "@/lib/summary";

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
    const payroll_code = str(f, "payroll_code") || null;
    const employment_type = str(f, "employment_type") || null;
    const start_date = str(f, "start_date") || null;
    const phone = str(f, "phone") || null;
    if (phone && !/^[+\d][\d\s()-]{5,24}$/.test(phone)) return { ok: false, error: "That phone number doesn't look right." };
    if (employment_type && !["full_time", "part_time", "casual"].includes(employment_type)) return { ok: false, error: "Pick an employment type." };
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return { ok: false, error: "Enter a valid start date." };
    const details = { payroll_code, employment_type, start_date, phone };

    if (id) {
      await own(v, "employees", id);
      if (id === v.employee.id && (role !== "admin" || !active)) return { ok: false, error: "You can't remove your own administrator access." };
      const { data: before } = await db().from("employees").select("email").eq("id", id).single();
      // A new email signs in as a new account.
      const patch = { full_name, email, role, active, ...details, updated_at: new Date().toISOString(), ...(before?.email !== email ? { user_id: null } : {}) };
      const { error } = await db().from("employees").update(patch).eq("id", id);
      if (error) throw error;
      return saved("Saved.");
    }
    const { data, error } = await db().from("employees").insert({ company_id: v.company.id, full_name, email, role, ...details }).select("id").single();
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
      await db().from("employees").update({ pin_hash: null, pin_version: await nextPinVersion(id) }).eq("id", id);
      return saved("PIN removed. They can no longer sign in with their card, and any phone signed in with it is signed out.");
    }
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "A PIN is 4 to 8 digits." };
    if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, error: "Pick a PIN that's harder to guess." };
    const { error } = await db().from("employees").update({ pin_hash: hashPin(pin), pin_failed_count: 0, pin_lock_count: 0, pin_locked_until: null, pin_version: await nextPinVersion(id) }).eq("id", id);
    if (error) throw error;
    return saved("PIN set. Any phone signed in with the old PIN is signed out.");
  } catch (e) { return fail(e); }
}

export async function newQrCode(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    await own(v, "employees", id);
    const { error } = await db().from("employees").update({ qr_token: randomToken(18), qr_issued_at: new Date().toISOString(), pin_version: await nextPinVersion(id) }).eq("id", id);
    if (error) throw error;
    return saved("New QR code made. The old card no longer works; print the new one.");
  } catch (e) { return fail(e); }
}

/** Bumping the version ends every PIN session already open for this person. */
async function nextPinVersion(id: string) {
  const { data } = await db().from("employees").select("pin_version").eq("id", id).single();
  return (data?.pin_version ?? 0) + 1;
}

// ── Locations ──────────────────────────────────────────────────────────────────────────────────

export async function saveLocation(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id"), name = str(f, "name");
    if (!name) return { ok: false, error: "Enter a name." };
    const latS = str(f, "latitude"), lngS = str(f, "longitude"), radiusS = str(f, "radius_m");
    const latitude = latS ? Number(latS) : null, longitude = lngS ? Number(lngS) : null, radius_m = radiusS ? Number(radiusS) : 200;
    if ((latitude == null) !== (longitude == null)) return { ok: false, error: "Enter both latitude and longitude, or neither." };
    if (latitude != null && !(latitude >= -90 && latitude <= 90 && longitude! >= -180 && longitude! <= 180)) return { ok: false, error: "Those coordinates don't look right." };
    if (!(radius_m >= 25 && radius_m <= 5000)) return { ok: false, error: "The radius must be 25 to 5000 metres." };
    if (id) {
      await own(v, "locations", id);
      const { error } = await db().from("locations").update({ name, active: f.get("active") === "on", latitude, longitude, radius_m }).eq("id", id);
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
    const meal_break_after_hours = Number(f.get("meal_break_after_hours")), min_meal_break_minutes = Number(f.get("min_meal_break_minutes"));
    if (!(meal_break_after_hours >= 0 && meal_break_after_hours <= 24)) return { ok: false, error: "Meal break rule: 0 to 24 hours (0 turns it off)." };
    if (!(min_meal_break_minutes >= 0 && min_meal_break_minutes <= 240)) return { ok: false, error: "Shortest meal break: 0 to 240 minutes." };
    // Changing how weeks are cut would move hours between already-approved weeks.
    if (week_start !== v.company.week_start || timezone !== v.company.timezone) {
      const { count } = await db().from("timesheet_approvals").select("id", { count: "exact", head: true }).eq("company_id", v.company.id).is("revoked_at", null);
      if (count) return { ok: false, error: `The week start and time zone can't change while ${count} week${count > 1 ? "s are" : " is"} approved; it would move hours between approved weeks.` };
    }
    const { error } = await db().from("companies").update({
      name, timezone, week_start, duplicate_window_seconds, long_shift_hours, meal_break_after_hours, min_meal_break_minutes,
      track_breaks: f.get("track_breaks") === "on", breaks_paid: f.get("breaks_paid") === "on", record_location: f.get("record_location") === "on",
      rest_breaks: f.get("rest_breaks") === "on", daily_summary: f.get("daily_summary") === "on",
      phone_clocking: f.get("phone_clocking") === "on", phone_require_location: f.get("phone_require_location") === "on",
    }).eq("id", v.company.id);
    if (error) throw error;
    return saved("Settings saved.");
  } catch (e) { return fail(e); }
}

// ── Public holidays ────────────────────────────────────────────────────────────────────────────

export async function addHoliday(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const date = str(f, "date"), name = str(f, "name");
    const from_time = str(f, "from_time") || "00:00", to_time = str(f, "to_time") || "24:00";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
    if (!name) return { ok: false, error: "Give the holiday a name." };
    if (!(from_time < to_time)) return { ok: false, error: "The start time must be before the end time." };
    const { error } = await db().from("public_holidays").insert({ company_id: v.company.id, date, name, from_time, to_time });
    if (error) throw error;
    return saved(`${name} added.`);
  } catch (e) { return fail(e); }
}

export async function removeHoliday(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const { error } = await db().from("public_holidays").delete().eq("id", str(f, "id")).eq("company_id", v.company.id);
    if (error) throw error;
    return saved("Removed.");
  } catch (e) { return fail(e); }
}

export async function addQueenslandHolidays(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const year = Number(f.get("year"));
    if (!(year >= 2020 && year <= 2100)) return { ok: false, error: "Pick a year." };
    const rows = queenslandHolidays(year).map(h => ({ ...h, company_id: v.company.id }));
    const { error, count } = await db().from("public_holidays")
      .upsert(rows, { onConflict: "company_id,date,from_time", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;
    return saved(`Added ${count ?? rows.length} Queensland holidays for ${year}. Check them against qld.gov.au and add your local show holiday.`);
  } catch (e) { return fail(e); }
}

/** Sends the daily summary to the admin who clicked, right now, so they can see what it looks like. */
export async function sendTestSummary(): Promise<FormResult> {
  try {
    const v = await admin();
    if (!v.employee.email) return { ok: false, error: "Your account has no email address." };
    const items = await buildSummary(v.company);
    const m = summaryEmail(v.company, items.length ? items : [{ title: "Nothing to check today", lines: ["When something needs a look, it will be listed here."], link: `${await appUrl()}/today` }]);
    await sendEmail([v.employee.email], `[Test] ${m.subject}`, m.text, m.html);
    return { ok: true, message: `Test summary sent to ${v.employee.email}.` };
  } catch (e) { return fail(e); }
}

/** A new poster code for a location: the old poster (and any photo of it) stops working. */
export async function newPosterCode(_: FormResult, f: FormData): Promise<FormResult> {
  try {
    const v = await admin();
    const id = str(f, "id");
    await own(v, "locations", id);
    const { error } = await db().from("locations").update({ qr_token: randomToken(18) }).eq("id", id);
    if (error) throw error;
    return saved("New poster code made. Print the new poster; the old one no longer works.");
  } catch (e) { return fail(e); }
}
