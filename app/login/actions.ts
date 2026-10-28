"use server";
import { headers } from "next/headers";
import { authClient, db } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; error?: string; email?: string };

export async function sendMagicLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address.", email };

  // Only people set up as active employees get a link. The reply is the same either way,
  // so the form can't be used to find out who works here.
  const { data: emp } = await db().from("employees").select("id").eq("email", email).eq("active", true).limit(1).maybeSingle();
  if (emp) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const supa = await authClient();
    const { error } = await supa.auth.signInWithOtp({
      email, options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
    });
    if (error) {
      console.error("magic link failed", error.message);
      return { error: error.status === 429 ? "Too many sign-in emails just now. Wait a minute and try again." : "We couldn't send the email. Try again shortly.", email };
    }
  }
  return { sent: true, email };
}
