import Link from "next/link";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { appUrl, QR_OPTIONS } from "@/lib/cards";
import PrintButton from "@/components/PrintButton";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "QR poster" };

// A4 poster for the depot wall: staff scan it with their own phone to clock in and out.
export default async function Poster({ params }: PageProps<"/setup/locations/[id]/poster">) {
  const v = await requireViewer(["admin"]);
  const { id } = await params;
  const { data: loc } = await db().from("locations").select("id, company_id, name, qr_token").eq("id", id).maybeSingle();
  if (!loc || loc.company_id !== v.company.id) notFound();
  const svg = await QRCode.toString(`${await appUrl()}/c/${loc.qr_token}`, { ...QR_OPTIONS, type: "svg" });

  return (
    <div>
      <style>{`@media print { @page { size: A4; margin: 0 } }`}</style>
      <div className="print:hidden">
        <div className="text-sm mb-2"><Link className="text-teal-700 hover:underline" href="/setup/locations">← Locations</Link></div>
        <PageHeader title={`QR poster: ${loc.name}`} sub="Print on A4 at 100%, and put it up at eye height near where staff arrive, out of direct sun and rain." actions={<PrintButton />} />
      </div>
      <div className="overflow-x-auto">
        <div className="w-[210mm] h-[297mm] bg-white shadow ring-1 ring-slate-200 print:shadow-none print:ring-0 px-[18mm] py-[16mm] flex flex-col items-center text-center">
          <div className="text-[13pt] uppercase tracking-[0.2em] text-slate-600">{v.company.name}</div>
          <h1 className="mt-[4mm] text-[38pt] font-bold leading-tight text-slate-900">Clock in &amp; out here</h1>
          <p className="mt-[2mm] text-[16pt] text-slate-700">Scan with your phone camera</p>
          <div className="mt-[8mm] w-[120mm] h-[120mm] [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <ol className="mt-[8mm] text-left text-[13pt] leading-relaxed text-slate-800 list-decimal pl-[8mm] space-y-[1mm]">
            <li>Open your phone&apos;s camera and point it at the code.</li>
            <li>Tap the link, then tap <strong>Clock in</strong>, <strong>Clock out</strong> or <strong>Break</strong>.</li>
            <li>Allow location when asked: it only checks you&apos;re at the depot.</li>
          </ol>
          <p className="mt-auto text-[11pt] text-slate-600">
            First time? Scan your own QR card with your phone and enter your PIN, or sign in with your work email, then scan this poster.
            <br />{loc.name}
          </p>
        </div>
      </div>
    </div>
  );
}
