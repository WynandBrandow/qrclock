// The app menu, defined once. The desktop Sidebar and the phone/tablet MobileNav both read these
// lists, in this order, with these labels and role filters. Never add a menu item anywhere else.
import type { Role } from "./auth";

export type NavItem = { label: string; href: string; icon: string; roles?: Role[] };
export type NavGroup = {
  id: string; label: string; defaultHref: string; icon: string; roles?: Role[];
  prefixes: string[];
  items: NavItem[];
};

const MANAGERS: Role[] = ["manager", "admin"];
const ADMINS: Role[] = ["admin"];

export const STANDALONES: NavItem[] = [
  { label: "Today", href: "/today", roles: MANAGERS,
    icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  { label: "Timesheets", href: "/timesheets", roles: MANAGERS,
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
  { label: "Review", href: "/review", roles: MANAGERS,
    icon: "M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" },
  { label: "My hours", href: "/me",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
];

export const GROUPS: NavGroup[] = [
  {
    id: "setup", label: "Setup", defaultHref: "/setup/employees", roles: ADMINS,
    prefixes: ["/setup"],
    icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
    items: [
      { label: "Employees", href: "/setup/employees", icon: "" },
      { label: "QR cards", href: "/setup/cards", icon: "" },
      { label: "Kiosks", href: "/setup/kiosks", icon: "" },
      { label: "Locations", href: "/setup/locations", icon: "" },
      { label: "Holidays", href: "/setup/holidays", icon: "" },
      { label: "Settings", href: "/setup/settings", icon: "" },
    ],
  },
];

export const canSee = (role: Role, roles?: Role[]) => !roles || roles.includes(role);

export function visibleStandalones(role: Role) {
  return STANDALONES.filter(s => canSee(role, s.roles));
}

export function visibleGroups(role: Role) {
  return GROUPS.filter(g => canSee(role, g.roles) && g.items.some(i => canSee(role, i.roles)));
}

export function getActiveGroup(pathname: string): NavGroup | null {
  return GROUPS.find(g => g.prefixes.some(p => pathname === p || pathname.startsWith(p + "/"))) ?? null;
}

/** The most specific item in the group that matches the path. */
export function getActiveTab(group: NavGroup, pathname: string): NavItem | null {
  const matches = group.items.filter(i => pathname === i.href || pathname.startsWith(i.href + "/"));
  return matches.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function standaloneActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Where a signed-in person lands. */
export const homeFor = (role: string) => (role === "manager" || role === "admin" ? "/today" : "/me");
