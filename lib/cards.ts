import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

/** Base URL printed into QR cards. Set NEXT_PUBLIC_APP_URL so cards outlive a domain change. */
export async function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function cardUrl(token: string) {
  return `${await appUrl()}/q/${token}`;
}

// Error correction H: up to ~30% of the code can be scratched or covered (key tags and wallets
// wear) and it still scans. The 4-module white margin is the quiet zone scanners need.
export const QR_OPTIONS = { errorCorrectionLevel: "H", margin: 4 } as const;

export async function cardSvg(token: string) {
  return QRCode.toString(await cardUrl(token), { ...QR_OPTIONS, type: "svg", color: { dark: "#000000", light: "#ffffff" } });
}
