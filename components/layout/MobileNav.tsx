"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";
import { getActiveGroup, standaloneActive, visibleGroups, visibleStandalones } from "@/lib/nav";
import Icon from "./Icon";

// Bottom menu on phones and tablets. Built from the same lib/nav.ts lists as the desktop Sidebar,
// in the same order, with the same names and role filtering, so the two always match.
// The row scrolls sideways; the current page's item is scrolled into view.
export default function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const activeGroup = getActiveGroup(pathname);
  const rowRef = useRef<HTMLDivElement>(null);

  const entries = [
    ...visibleStandalones(role).map(s => ({ key: s.href, label: s.label, href: s.href, icon: s.icon, active: standaloneActive(s.href, pathname) })),
    ...visibleGroups(role).map(g => ({ key: g.id, label: g.label, href: g.defaultHref, icon: g.icon, active: activeGroup?.id === g.id })),
  ];

  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav aria-label="Main menu" className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-40 print:hidden pb-[env(safe-area-inset-bottom)]">
      <div ref={rowRef} className="flex items-stretch justify-center-safe gap-1 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map(e => (
          <Link key={e.key} href={e.href} aria-current={e.active ? "page" : undefined}
            className={`flex flex-col items-center justify-start gap-1 shrink-0 w-[74px] px-1 py-1.5 rounded-lg transition-colors ${
              e.active ? "text-teal-300 bg-slate-800" : "text-slate-400 hover:text-slate-200"}`}>
            <Icon d={e.icon} />
            <span className="text-[10px] font-medium leading-tight text-center line-clamp-2">{e.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
