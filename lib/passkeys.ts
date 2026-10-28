import "server-only";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "./supabase/server";
import { sign, unsign } from "./crypto";
import { appUrl } from "./cards";
import { must } from "./data";
import type { Viewer } from "./auth";

// Face ID / fingerprint (passkeys) for phone punches. The phone keeps the private key and does
// the biometric check itself; we store only the public key and a use counter.

const COOKIE = "qc_wa";
const CHALLENGE_MINUTES = 5;
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

async function rp() {
  const origin = await appUrl();
  return { origin, rpID: new URL(origin).hostname };
}

async function saveChallenge(purpose: "register" | "auth", employeeId: string, challenge: string) {
  const exp = Date.now() + CHALLENGE_MINUTES * 60_000;
  (await cookies()).set(COOKIE, sign(`${purpose}|${employeeId}|${exp}|${challenge}`), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: CHALLENGE_MINUTES * 60,
  });
}

/** The challenge we issued to this person for this purpose, used once. */
async function takeChallenge(purpose: "register" | "auth", employeeId: string) {
  const store = await cookies();
  const payload = unsign(store.get(COOKIE)?.value);
  store.delete(COOKIE);
  if (!payload) return null;
  const [p, emp, exp, challenge] = payload.split("|");
  return p === purpose && emp === employeeId && Number(exp) > Date.now() ? challenge : null;
}

export async function passkeysFor(employeeId: string) {
  return must(await db().from("passkeys").select("id, credential_id, public_key, counter, transports, device_label, created_at, last_used_at")
    .eq("employee_id", employeeId).order("created_at"));
}

export async function registrationOptions(v: Viewer) {
  const { rpID } = await rp();
  const existing = await passkeysFor(v.employee.id);
  const options = await generateRegistrationOptions({
    rpName: "QR Clock", rpID,
    userID: new TextEncoder().encode(v.employee.id), userName: v.employee.email ?? v.employee.full_name, userDisplayName: v.employee.full_name,
    attestationType: "none",
    excludeCredentials: existing.map(k => ({ id: k.credential_id, transports: k.transports ?? undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
  });
  await saveChallenge("register", v.employee.id, options.challenge);
  return options;
}

export async function finishRegistration(v: Viewer, response: RegistrationResponseJSON, label: string) {
  const expectedChallenge = await takeChallenge("register", v.employee.id);
  if (!expectedChallenge) return { ok: false as const, error: "That took too long. Please try again." };
  const { origin, rpID } = await rp();
  const r = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!r.verified) return { ok: false as const, error: "Your phone's check didn't go through. Please try again." };
  const { credential } = r.registrationInfo;
  const { error } = await db().from("passkeys").insert({
    company_id: v.company.id, employee_id: v.employee.id, credential_id: credential.id, public_key: b64url(credential.publicKey),
    counter: credential.counter, transports: credential.transports ?? null, device_label: label.slice(0, 80) || null,
  });
  if (error) throw error;
  return { ok: true as const };
}

export async function authenticationOptions(v: Viewer) {
  const { rpID } = await rp();
  const keys = await passkeysFor(v.employee.id);
  const options = await generateAuthenticationOptions({
    rpID, userVerification: "required",
    allowCredentials: keys.map(k => ({ id: k.credential_id, transports: k.transports ?? undefined })),
  });
  await saveChallenge("auth", v.employee.id, options.challenge);
  return options;
}

/** True when this person's own passkey signed the challenge we just issued, with Face ID / fingerprint. */
export async function verifyPasskey(v: Viewer, response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge("auth", v.employee.id);
  if (!expectedChallenge) return false;
  const key = (await passkeysFor(v.employee.id)).find(k => k.credential_id === response.id);
  if (!key) return false;
  const { origin, rpID } = await rp();
  try {
    const r = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credential_id, publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")), counter: Number(key.counter), transports: key.transports ?? undefined },
    });
    if (!r.verified) return false;
    await db().from("passkeys").update({ counter: r.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", key.id);
    return true;
  } catch (e) {
    console.error("passkey verify", e);
    return false;
  }
}
