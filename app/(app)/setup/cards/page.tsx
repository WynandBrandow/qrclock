import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/server";
import { cardSvg } from "@/lib/cards";
import { fmtDateTime } from "@/lib/time";
import IdCard from "@/components/IdCard";
import PrintButton from "@/components/PrintButton";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "QR cards" };

export default async function Cards({ searchParams }: PageProps<"/setup/cards">) {
  const v = await requireViewer(["admin"]);
  const { ids } = await searchParams;
  let q = db().from("employees").select("id, full_name, qr_token, qr_issued_at").eq("company_id", v.company.id).eq("active", true).order("full_name");
  if (typeof ids === "string" && ids) q = q.in("id", ids.split(","));
  const { data: emps } = await q;
  const cards = await Promise.all((emps ?? []).map(async e => ({ ...e, svg: await cardSvg(e.qr_token) })));

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="QR cards" sub="Credit-card size (85.6 × 54 mm). Print at 100% scale, cut out, and laminate or put in a card holder."
          actions={<PrintButton />} />
      </div>
      {cards.length === 0 ? <Empty>No active employees.</Empty> : (
        <div className="flex flex-wrap gap-[6mm] print:gap-[4mm]">
          {cards.map(c => <IdCard key={c.id} name={c.full_name} company={v.company.name} svg={c.svg} issued={fmtDateTime(c.qr_issued_at, v.company.timezone)} />)}
        </div>
      )}
    </div>
  );
}
