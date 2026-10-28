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
    // Public sign-up is off in Supabase, so the login is created here, only for real employees.
    // "Already registered" is the normal case after the first sign-in.
    const { error: createError } = await db().auth.admin.createUser({ email, email_confirm: true });
    if (createError && createError.code !== "email_exists") console.error("create auth user failed", createError.message);
    const supa = await authClient();
    const { error } = await supa.auth.signInWithOtp({
      email, options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
    });
    // Failures (including rate limits) are only logged: a different reply would reveal who is on staff.
    if (error) console.error("magic link failed", error.status, error.message);
  }
  return { sent: true, email };
}
