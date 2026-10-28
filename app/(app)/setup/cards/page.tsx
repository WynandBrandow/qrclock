import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { cardSvg } from "@/lib/cards";
import { must } from "@/lib/data";
import { localDate } from "@/lib/time";
import IdCard, { KeyTag } from "@/components/IdCard";
import PrintButton from "@/components/PrintButton";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "QR cards" };

// Exact A4 sheets. Wallet cards: 2 × 5 = 10 per page. Key tags: 6 × 5 = 30 per page.
const LAYOUT = {
  card: { perSheet: 10, grid: "grid-cols-[repeat(2,85.6mm)] grid-rows-[repeat(5,54mm)]", pad: "px-[19.4mm] py-[13.5mm]" },
  tag: { perSheet: 30, grid: "grid-cols-[repeat(6,30mm)] grid-rows-[repeat(5,52mm)]", pad: "px-[15mm] py-[18.5mm]" },
} as const;

export default async function Cards({ searchParams }: PageProps<"/setup/cards">) {
  const v = await requireViewer(["admin"]);
  const sp = await searchParams;
  const format = sp.format === "tag" ? "tag" : "card";
  const ids = typeof sp.ids === "string" && sp.ids ? sp.ids.split(",").filter(id => /^[0-9a-f-]{36}$/.test(id)) : null;
  let q = db().from("employees").select("id, full_name, qr_token, qr_issued_at").eq("company_id", v.company.id).eq("active", true).order("full_name");
  if (ids) q = q.in("id", ids);
  const emps = must(await q);
  const items = await Promise.all(emps.map(async e => ({ ...e, svg: await cardSvg(e.qr_token) })));
  const { perSheet, grid, pad } = LAYOUT[format];
  const sheets = Array.from({ length: Math.ceil(items.length / perSheet) }, (_, i) => items.slice(i * perSheet, (i + 1) * perSheet));
  const link = (f: string) => `/setup/cards?format=${f}${ids ? `&ids=${ids.join(",")}` : ""}`;

  return (
    <div>
      <style>{`@media print { @page { size: A4; margin: 0 } }`}</style>
      <div className="print:hidden">
        <PageHeader title="QR cards" sub={ids ? `${items.length} selected` : `All ${items.length} active employees`} actions={<PrintButton />} />
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Card type">
          <Link href={link("card")} aria-current={format === "card" ? "true" : undefined}
            className={format === "card" ? "btn-primary" : "btn-secondary"}>Wallet cards (10 per page)</Link>
          <Link href={link("tag")} aria-current={format === "tag" ? "true" : undefined}
            className={format === "tag" ? "btn-primary" : "btn-secondary"}>Key tags (30 per page)</Link>
        </div>
        <ul className="text-sm text-slate-600 mb-6 list-disc pl-5 space-y-1 max-w-3xl">
          <li>Print on A4 at <strong>100% / actual size</strong>, and turn off the browser&apos;s headers and footers.</li>
          <li>Cut along the dashed lines. Laminate them, or use a card sleeve or a key-tag holder.</li>
          {format === "tag" && <li>Punch the circle at the top for the key ring. Key tags show the first name only.</li>}
          <li>The codes still scan with up to about 30% scratched or covered. If one is lost, make a new code on the employee&apos;s page; the old one stops working.</li>
        </ul>
      </div>
      {items.length === 0 ? <Empty>No active employees. <Link className="text-teal-700 underline" href="/setup/employees">Add staff</Link> first.</Empty> : (
        <div className="space-y-6 print:space-y-0 overflow-x-auto">
          {sheets.map((sheet, i) => (
            <div key={i} className={`w-[210mm] h-[297mm] bg-white shadow ring-1 ring-slate-200 print:shadow-none print:ring-0 ${pad} ${i < sheets.length - 1 ? "break-after-page" : ""}`}>
              <div className={`grid ${grid}`}>
                {sheet.map(e => format === "tag"
                  ? <KeyTag key={e.id} name={e.full_name} svg={e.svg} />
                  : <IdCard key={e.id} name={e.full_name} company={v.company.name} svg={e.svg} issued={localDate(new Date(e.qr_issued_at), v.company.timezone)} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
