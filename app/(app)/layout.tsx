import { requireViewer } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import SecondaryNav from "@/components/layout/SecondaryNav";

const ROLE_LABEL = { employee: "Employee", manager: "Manager", admin: "Administrator" } as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const v = await requireViewer();
  return (
    <div className="min-h-screen flex print:block">
      <div className="hidden lg:flex print:hidden"><Sidebar role={v.role} company={v.company.name} /></div>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 print:hidden">
          <div className="flex items-center justify-between gap-3 px-4 lg:px-8 h-14">
            <div className="flex items-center gap-2 min-w-0 lg:hidden">
              <span className="inline-grid place-items-center w-7 h-7 rounded-md bg-slate-900 text-teal-300 text-[11px] font-bold">QR</span>
              <span className="font-semibold truncate">{v.company.name}</span>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-right min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{v.employee.full_name}</div>
                <div className="text-xs text-slate-500">{v.via === "pin" ? "Signed in with card" : ROLE_LABEL[v.role]}</div>
              </div>
              <form action="/signout" method="post">
                <button className="btn-secondary px-3 py-1.5 text-xs">Sign out</button>
              </form>
            </div>
          </div>
        </header>
        <SecondaryNav role={v.role} />
        <main className="flex-1 p-4 lg:p-8 pb-28 lg:pb-8 print:p-0">{children}</main>
      </div>
      <MobileNav role={v.role} />
    </div>
  );
}
