import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { db } from "./supabase/server";
import { sha256 } from "./crypto";
import { getCompany, type Company, type Employee } from "./auth";

export const KIOSK_COOKIE = "qc_kiosk";
// Browsers cap cookies at 400 days; the kiosk renews it on every scan and heartbeat, so a kiosk in
// daily use never unpairs itself.
export const KIOSK_COOKIE_OPTIONS = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 400 * 86400,
};

export type Kiosk = { id: string; company_id: string; name: string; location_id: string | null; active: boolean };

/** The kiosk this device was paired as, or null. */
export async function currentKiosk(): Promise<{ kiosk: Kiosk; company: Company; secret: string } | null> {
  const secret = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!secret) return null;
  const { data } = await db().from("kiosks").select("id, company_id, name, location_id, active")
    .eq("device_secret_hash", sha256(secret)).maybeSingle<Kiosk>();
  if (!data?.active) return null;
  return { kiosk: data, company: await getCompany(data.company_id), secret };
}

export function renewKioskCookie<T extends NextResponse>(res: T, secret: string): T {
  res.cookies.set(KIOSK_COOKIE, secret, KIOSK_COOKIE_OPTIONS);
  return res;
}

/**
 * A card holds a link like https://…/q/<token>; a USB scanner may also type the bare token. A
 * scanner set to a different keyboard layout can garble ':' and '/', so as a fallback take a
 * 24-character token from the end of the text.
 */
export function tokenFromScan(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/q\/([A-Za-z0-9_-]{16,64})\/?(?:[?#].*)?$/) ?? t.match(/^([A-Za-z0-9_-]{16,64})$/) ?? t.match(/[^A-Za-z0-9_-]([A-Za-z0-9_-]{24})$/);
  return m ? m[1] : null;
}

export async function employeeByToken(companyId: string, token: string) {
  const { data, error } = await db().from("employees").select("*").eq("qr_token", token).eq("company_id", companyId).maybeSingle<Employee>();
  if (error) throw error;
  return data;
}

export async function logScan(row: { company_id: string; kiosk_id: string; employee_id?: string | null; result: string; detail?: string | null }) {
  await db().from("scan_log").insert(row);
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0];
