"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { checkPin } from "@/lib/crypto";
import { startPinSession, type Employee } from "@/lib/auth";

export type PinState = { error?: string };

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

export async function pinSignIn(_: PinState, form: FormData): Promise<PinState> {
  const token = String(form.get("token") ?? "");
  const pin = String(form.get("pin") ?? "");
  const { data: emp } = await db().from("employees").select("*").eq("qr_token", token).maybeSingle<Employee>();
  if (!emp || !emp.active || !emp.pin_hash) return { error: "This card can't be used to sign in. Ask your manager." };

  if (emp.pin_locked_until && new Date(emp.pin_locked_until) > new Date()) {
    return { error: `Too many wrong PINs. Try again after ${new Date(emp.pin_locked_until).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}.` };
  }
  if (!/^\d{4,8}$/.test(pin) || !checkPin(pin, emp.pin_hash)) {
    const tries = emp.pin_failed_count + 1;
    const lock = tries >= MAX_TRIES;
    await db().from("employees").update({
      pin_failed_count: lock ? 0 : tries,
      pin_locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
    }).eq("id", emp.id);
    return { error: lock ? `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.` : `Wrong PIN. ${MAX_TRIES - tries} tr${MAX_TRIES - tries === 1 ? "y" : "ies"} left.` };
  }

  await db().from("employees").update({ pin_failed_count: 0, pin_locked_until: null }).eq("id", emp.id);
  await startPinSession(emp.id);
  redirect("/me");
}
