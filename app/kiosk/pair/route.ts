import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { randomToken, sha256 } from "@/lib/crypto";
import { KIOSK_COOKIE, KIOSK_COOKIE_OPTIONS } from "@/lib/kiosk";

// Pairing is a two-step: GET shows a confirm button, POST pairs. Link previews in Teams, Slack or
// email only ever GET, so they can no longer use up the one-time code.
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Pair this device · QR Clock</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#020617;color:#f1f5f9;font-family:system-ui,sans-serif;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:1.6rem;margin:0 0 12px}p{color:#cbd5e1;line-height:1.5}
button{margin-top:20px;font:600 1.15rem system-ui;padding:16px 28px;border:0;border-radius:14px;background:#2dd4bf;color:#042f2e;cursor:pointer;width:100%}</style></head>
<body><main><h1>Make this device the kiosk?</h1>
<p>This tablet or phone will record clock-ins for your workplace. Only do this on the device that stays at the workplace.</p>
<form method="post"><input type="hidden" name="code" value="${code}"><button>Yes, make this the kiosk</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const code = String(form?.get("code") ?? "");
  const back = (msg: string) => NextResponse.redirect(new URL(`/kiosk?error=${msg}`, req.url), 303);
  if (code.length < 16) return back("invalid");

  // Use the code up and store the device secret in one statement, so two devices can't both pair.
  const secret = randomToken(32);
  const { data, error } = await db().from("kiosks").update({
    device_secret_hash: sha256(secret), pairing_code_hash: null, pairing_expires_at: null, paired_at: new Date().toISOString(),
  }).eq("pairing_code_hash", sha256(code)).eq("active", true).gt("pairing_expires_at", new Date().toISOString()).select("id");
  if (error) return back("failed");
  if (!data?.length) return back("invalid");

  const res = NextResponse.redirect(new URL("/kiosk", req.url), 303);
  res.cookies.set(KIOSK_COOKIE, secret, KIOSK_COOKIE_OPTIONS);
  return res;
}
