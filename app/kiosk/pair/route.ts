import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { randomToken, sha256 } from "@/lib/crypto";
import { KIOSK_COOKIE } from "@/lib/kiosk";

// Opened on the tablet from the one-time link an admin creates under Setup → Kiosks.
// Swaps the pairing code for a long-lived device secret kept in an httpOnly cookie.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const back = (msg: string) => NextResponse.redirect(new URL(`/kiosk?error=${msg}`, req.url));
  if (code.length < 16) return back("invalid");

  const { data: kiosk } = await db().from("kiosks").select("id, active, pairing_expires_at")
    .eq("pairing_code_hash", sha256(code)).maybeSingle();
  if (!kiosk || !kiosk.active) return back("invalid");
  if (!kiosk.pairing_expires_at || new Date(kiosk.pairing_expires_at) < new Date()) return back("expired");

  const secret = randomToken(32);
  const { error } = await db().from("kiosks").update({
    device_secret_hash: sha256(secret), pairing_code_hash: null, pairing_expires_at: null, paired_at: new Date().toISOString(),
  }).eq("id", kiosk.id);
  if (error) return back("failed");

  const res = NextResponse.redirect(new URL("/kiosk", req.url));
  res.cookies.set(KIOSK_COOKIE, secret, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400,
  });
  return res;
}
