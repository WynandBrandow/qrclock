import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase/server";

// Where the sign-in email lands. GET only shows a button: email security scanners open links
// (GET) and would otherwise use up the one-time token before the person clicks. POST signs in.
const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = (p.get("token_hash") ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  const type = TYPES.includes(p.get("type") as EmailOtpType) ? p.get("type")! : "email";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sign in · QR Clock</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font-family:system-ui,sans-serif;padding:24px}
main{max-width:380px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;text-align:center}
h1{font-size:1.4rem;margin:0 0 8px}p{color:#475569;margin:0}
button{margin-top:20px;font:600 1.05rem system-ui;padding:14px;border:0;border-radius:10px;background:#0f766e;color:#fff;cursor:pointer;width:100%}
button:focus-visible{outline:2px solid #0d9488;outline-offset:2px}</style></head>
<body><main><h1>Sign in to QR Clock</h1><p>Tap to finish signing in on this device.</p>
<form method="post"><input type="hidden" name="token_hash" value="${token}"><input type="hidden" name="type" value="${type}">
<button>Continue</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token_hash = String(form?.get("token_hash") ?? "");
  const t = String(form?.get("type") ?? "email") as EmailOtpType;
  const type = TYPES.includes(t) ? t : "email";
  const supa = await authClient();
  const { error } = token_hash ? await supa.auth.verifyOtp({ token_hash, type }) : { error: true };
  return NextResponse.redirect(new URL(error ? "/login?error=link" : "/", req.url), 303);
}
