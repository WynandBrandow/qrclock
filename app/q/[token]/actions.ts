"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { checkPin } from "@/lib/crypto";
import { startPinSession } from "@/lib/auth";

export type PinState = { error?: string };

export async function pinSignIn(_: PinState, form: FormData): Promise<PinState> {
  const token = String(form.get("token") ?? "");
  const pin = String(form.get("pin") ?? "");
  if (!/^\d{4,8}$/.test(pin)) return { error: "Your PIN is 4 to 8 digits." };

  // pin_attempt reserves this try atomically before the PIN is checked, so parallel guesses
  // can't get past the limit. It returns no pin_hash while the card is locked.
  const { data, error } = await db().rpc("pin_attempt", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { error: "This card can't be used to sign in. Ask your manager." };
  if (!row.pin_hash) return { error: lockedMessage(row.locked_until) };

  if (!(await checkPin(pin, row.pin_hash))) return { error: "Wrong PIN. Check it and try again." };

  await db().rpc("pin_succeeded", { p_employee_id: row.employee_id });
  await startPinSession(row.employee_id, row.pin_version, form.get("remember") === "on");
  const next = String(form.get("next") ?? "");
  redirect(/^\/c\/[A-Za-z0-9_-]{16,64}$/.test(next) ? next : "/me");
}

function lockedMessage(until: string | null) {
  if (!until || until === "infinity" || new Date(until).getFullYear() > 9000) {
    return "Too many wrong PINs. Ask your manager to set a new PIN.";
  }
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
  return `Too many wrong PINs. Try again in ${mins < 90 ? `${mins} minute${mins > 1 ? "s" : ""}` : `${Math.round(mins / 60)} hours`}.`;
}
