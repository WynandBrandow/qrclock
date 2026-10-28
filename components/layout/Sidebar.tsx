"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";
import { getActiveGroup, standaloneActive, visibleGroups, visibleStandalones } from "@/lib/nav";
import Icon from "./Icon";

// Desktop menu (1024 px and up). Built from lib/nav.ts, the same lists as MobileNav.
export default function Sidebar({ role, company }: { role: Role; company: string }) {
  const pathname = usePathname();
  const activeGroup = getActiveGroup(pathname);
  const link = (key: string, href: string, label: string, icon: string, active: boolean) => (
    <Link key={key} href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-slate-800 text-teal-300" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"}`}>
      <Icon d={icon} />{label}
    </Link>
  );
  return (
    <aside className="w-60 shrink-0 bg-slate-900 min-h-screen flex flex-col sticky top-0 h-screen">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-white font-semibold tracking-tight flex items-center gap-2">
          <span className="inline-grid place-items-center w-7 h-7 rounded-md bg-teal-400 text-slate-900 text-[11px] font-bold">QR</span>
          QR Clock
        </div>
        <div className="text-xs text-slate-400 mt-1 truncate">{company}</div>
      </div>
      <nav aria-label="Main menu" className="flex-1 p-3 space-y-1">
        {visibleStandalones(role).map(s => link(s.href, s.href, s.label, s.icon, standaloneActive(s.href, pathname)))}
        {visibleGroups(role).map(g => link(g.id, g.defaultHref, g.label, g.icon, activeGroup?.id === g.id))}
      </nav>
    </aside>
  );
}
