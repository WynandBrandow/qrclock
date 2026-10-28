"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";
import { canSee, getActiveGroup, getActiveTab } from "@/lib/nav";

// Tab bar for the pages inside a menu group (Setup). Scrolls sideways on small screens.
export default function SecondaryNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const group = getActiveGroup(pathname);
  if (!group) return null;
  const active = getActiveTab(group, pathname);
  return (
    <div className="border-b border-slate-200 bg-white print:hidden">
      <div className="flex gap-1 overflow-x-auto px-4 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {group.items.filter(i => canSee(role, i.roles)).map(i => (
          <Link key={i.href} href={i.href} aria-current={active?.href === i.href ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 -mb-px ${
              active?.href === i.href ? "border-teal-500 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
