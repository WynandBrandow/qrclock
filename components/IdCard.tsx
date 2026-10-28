// Printable cards. Sizes are exact millimetres so they print true at 100% scale. The dashed border
// is a cut line; it prints (print-color-adjust: exact) but is light enough to trim off.

const cut = "border border-dashed border-slate-300 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]";
const qr = "[&>svg]:w-full [&>svg]:h-full [&>svg]:block";

/** Wallet card: 85.6 × 54 mm (credit-card size). */
export default function IdCard({ name, company, svg, issued }: { name: string; company: string; svg: string; issued: string }) {
  return (
    <div className={`w-[85.6mm] h-[54mm] bg-white p-[3.5mm] flex gap-[3.5mm] overflow-hidden break-inside-avoid ${cut}`}>
      <div className={`w-[42mm] h-[42mm] shrink-0 self-center ${qr}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex flex-col justify-between min-w-0 py-[1.5mm]">
        <div className="min-w-0">
          <div className="text-[6.5pt] uppercase tracking-wider text-slate-600 line-clamp-2">{company}</div>
          <div className={`font-semibold leading-tight mt-[1mm] text-slate-900 break-words line-clamp-3 ${name.length > 22 ? "text-[9.5pt]" : "text-[11.5pt]"}`}>{name}</div>
        </div>
        <div className="text-[6pt] leading-snug text-slate-600">
          Scan at the kiosk to clock in and out. Scan with your phone + PIN to see your hours.
          <div className="mt-[0.8mm]">Issued {issued}</div>
        </div>
      </div>
    </div>
  );
}

/** Key tag: 30 × 52 mm, with a hole marker at the top for the key ring. */
export function KeyTag({ name, svg }: { name: string; svg: string }) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <div className={`w-[30mm] h-[52mm] bg-white rounded-[3mm] px-[2mm] pt-[2mm] pb-[2.5mm] flex flex-col items-center overflow-hidden break-inside-avoid ${cut}`}>
      <div className="w-[4mm] h-[4mm] rounded-full border border-slate-400 shrink-0" aria-hidden="true" />
      <div className={`w-[26mm] h-[26mm] mt-[2.5mm] shrink-0 ${qr}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className={`mt-[2mm] font-semibold text-slate-900 text-center leading-tight w-full truncate ${first.length > 9 ? "text-[8pt]" : "text-[10pt]"}`}>{first}</div>
      <div className="mt-auto text-[5pt] text-slate-600 text-center leading-tight">Scan to clock in/out</div>
    </div>
  );
}
