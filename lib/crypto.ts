import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET is missing");
  return s;
};

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** 'payload.signature', tamper-evident, for cookies. */
export function sign(payload: string) {
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function unsign(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const payload = value.slice(0, i);
  const a = Buffer.from(sign(payload)), b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b) ? payload : null;
}

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt:${salt}:${scryptSync(pin, salt, 32).toString("base64url")}`;
}

export function checkPin(pin: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pin, salt, 32), b = Buffer.from(hash, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}
