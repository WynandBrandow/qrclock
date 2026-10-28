/** Printable ID card: 85.6 × 54 mm (credit-card size) with the employee's QR code. */
export default function IdCard({ name, company, svg, issued }: { name: string; company: string; svg: string; issued: string }) {
  return (
    <div className="w-[85.6mm] h-[54mm] rounded-[3mm] bg-white ring-1 ring-slate-300 p-[4mm] flex gap-[4mm] break-inside-avoid overflow-hidden">
      <div className="w-[40mm] h-[40mm] shrink-0 self-center [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex flex-col justify-between min-w-0 py-[1mm]">
        <div>
          <div className="text-[7pt] uppercase tracking-wider text-slate-500 truncate">{company}</div>
          <div className="text-[12pt] font-semibold leading-tight mt-[1mm] text-slate-900 break-words">{name}</div>
        </div>
        <div className="text-[6.5pt] leading-snug text-slate-500">
          Scan at the kiosk to clock in and out.<br />Issued {issued}
        </div>
      </div>
    </div>
  );
}
