import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {sub && <div className="text-sm text-slate-500 mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

const TONES = {
  slate: "bg-slate-100 text-slate-700",
  teal: "bg-teal-50 text-teal-800 ring-1 ring-teal-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
} as const;

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Notice({ tone = "teal", children }: { tone?: "teal" | "red" | "amber"; children: ReactNode }) {
  const c = { teal: "bg-teal-50 text-teal-900 ring-teal-200", red: "bg-red-50 text-red-800 ring-red-200", amber: "bg-amber-50 text-amber-900 ring-amber-200" }[tone];
  return <div className={`rounded-lg ring-1 px-4 py-3 text-sm mb-4 ${c}`}>{children}</div>;
}

/** ‹ previous week · this week · next week › */
export function WeekPicker({ base, week, current, label }: { base: string; week: string; current: string; label: string }) {
  const sep = base.includes("?") ? "&" : "?";
  const shift = (days: number) => {
    const [y, m, d] = week.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };
  return (
    <div className="flex items-center gap-1 print:hidden">
      <Link className="btn-secondary px-3" href={`${base}${sep}week=${shift(-7)}`} aria-label="Previous week">‹</Link>
      <span className="px-2 text-sm font-medium text-slate-700 whitespace-nowrap">{label}</span>
      <Link className="btn-secondary px-3" href={`${base}${sep}week=${shift(7)}`} aria-label="Next week">›</Link>
      {week !== current && <Link className="btn-secondary" href={`${base}${sep}week=${current}`}>This week</Link>}
    </div>
  );
}
