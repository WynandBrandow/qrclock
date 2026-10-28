import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

/** Base URL printed into QR cards. Set NEXT_PUBLIC_APP_URL so cards outlive a domain change. */
export async function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function cardSvg(token: string) {
  return QRCode.toString(`${await appUrl()}/q/${token}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}
