"use server";
import { db } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { lastEvent } from "@/lib/data";
import { distanceMeters } from "@/lib/geo";
import { verifyPasskey } from "@/lib/passkeys";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { actionEvent, currentState, nextActions, type Action } from "@/lib/shifts";

export type PhonePunch =
  | { ok: true; action: Action; at: string; flagged: boolean; distance: number | null }
  | { ok: false; error: string };

const ACTIONS: Action[] = ["clock_in", "clock_out", "break_start", "break_end", "rest_start"];

/** A punch from the person's own phone, after scanning the depot poster. */
export async function phonePunch(input: {
  site: string; action: string; lat?: number | null; lng?: number | null; accuracy?: number | null;
  passkey?: AuthenticationResponseJSON | null;
}): Promise<PhonePunch> {
  const v = await getViewer();
  if (!v) return { ok: false, error: "You're signed out on this phone. Sign in again, then scan the poster." };
  const c = v.company;
  if (!c.phone_clocking) return { ok: false, error: "Clocking in by phone is switched off. Use the kiosk, or ask your manager." };
  if (!ACTIONS.includes(input.action as Action)) return { ok: false, error: "Please scan the poster again." };
  const action = input.action as Action;

  const { data: loc } = await db().from("locations").select("id, company_id, name, active, latitude, longitude, radius_m")
    .eq("qr_token", input.site).maybeSingle();
  if (!loc || !loc.active || loc.company_id !== c.id) return { ok: false, error: "This poster isn't valid any more. Ask your manager for the new one." };

  // Distance from the depot, from the position the phone shared just now. Only the distance is kept.
  const hasFix = typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng);
  const known = loc.latitude != null && loc.longitude != null;
  const distance = hasFix && known ? distanceMeters({ lat: input.lat!, lng: input.lng! }, { lat: loc.latitude!, lng: loc.longitude! }) : null;
  // A rough GPS fix (indoors) gets the benefit of its own uncertainty, up to 500 m.
  const slack = Math.min(500, Math.max(0, Math.round(input.accuracy ?? 0)));
  const far = distance != null && distance - slack > loc.radius_m;
  const unknown = known && distance == null;
  if (c.phone_require_location && (far || unknown)) {
    return { ok: false, error: far
      ? `You're about ${(distance! / 1000).toFixed(distance! < 10_000 ? 1 : 0)} km from ${loc.name}. Clock in when you're at the depot.`
      : "Allow location for this site so we can check you're at the depot, then try again." };
  }

  // Face ID / fingerprint: proves the phone's owner is the one tapping, not just someone holding it.
  if (c.phone_require_passkey && (!input.passkey || !(await verifyPasskey(v, input.passkey)))) {
    return { ok: false, error: "Face ID or fingerprint check didn't go through. Tap the button again." };
  }

  const { state } = currentState(await lastEvent(v.employee.id), c);
  if (!nextActions(state, c).includes(action)) return { ok: false, error: "Your status just changed. Please scan the poster again." };

  const { kind, paidBreak } = actionEvent(action);
  const { data, error } = await db().rpc("record_punch", {
    p_employee_id: v.employee.id, p_kind: kind, p_source: "phone", p_paid_break: paidBreak, p_location_id: loc.id,
    p_distance_m: distance ?? undefined, p_extra_flag: far ? "away_from_site" : unknown ? "no_location" : undefined,
  });
  if (error) throw error;
  const r = data as { ok: boolean; reason?: string; occurred_at?: string; flag?: string | null };
  if (!r.ok) {
    return { ok: false, error: r.reason === "duplicate" ? "That was already recorded a moment ago." : r.reason === "inactive" ? "Your account isn't active. Talk to your manager." : "That didn't save. Please try again." };
  }
  return { ok: true, action, at: r.occurred_at!, flagged: !!r.flag, distance };
}
