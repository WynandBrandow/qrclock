import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase/server";

// Where the magic link lands. Handles both the PKCE ?code= link and a ?token_hash= template link.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supa = await authClient();

  let ok = false;
  if (code) ok = !(await supa.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supa.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(new URL(ok ? "/" : "/login?error=link", url.origin));
}
