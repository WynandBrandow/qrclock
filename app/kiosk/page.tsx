import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentKiosk } from "@/lib/kiosk";
import Kiosk from "./Kiosk";

export const metadata: Metadata = {
  title: "Kiosk",
  manifest: "/kiosk.webmanifest",
  appleWebApp: { capable: true, title: "Kiosk", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#020617", viewportFit: "cover" };

const ERRORS: Record<string, string> = {
  invalid: "That pairing link isn't valid any more: it was already used, or it expired. Create a new one under Setup → Kiosks.",
  expired: "That pairing link has expired. Create a new one under Setup → Kiosks.",
  failed: "Pairing didn't complete. Try the link again.",
};

export default async function KioskPage({ searchParams }: PageProps<"/kiosk">) {
  const k = await currentKiosk();
  const { error } = await searchParams;
  if (!k) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-teal-400 text-slate-900 font-bold text-sm">QR</div>
          <h1 className="text-2xl font-semibold">This device isn&apos;t a kiosk yet</h1>
          {typeof error === "string" && ERRORS[error] && <p className="mt-4 rounded-lg bg-red-500/15 text-red-200 px-4 py-3 text-sm">{ERRORS[error]}</p>}
          <p className="mt-4 text-slate-300">
            An administrator can pair it: sign in, open <strong>Setup → Kiosks</strong>, choose <strong>Pair a device</strong>,
            and open the link (or scan its QR code) on this device.
          </p>
          <Link href="/login" className="inline-block mt-6 text-teal-300 underline">Sign in</Link>
        </div>
      </main>
    );
  }
  return <Kiosk company={k.company.name} kioskName={k.kiosk.name} tz={k.company.timezone} restBreaks={k.company.track_breaks && k.company.rest_breaks} />;
}
