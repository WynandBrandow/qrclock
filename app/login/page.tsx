import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const v = await getViewer();
  if (v) redirect(homeFor(v.role));
  const { error } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-slate-900 text-teal-300 text-xs font-bold">QR</span>
          <span className="text-xl font-semibold tracking-tight">QR Clock</span>
        </div>
        <div className="card p-6">
          {error && <p className="mb-4 text-sm text-red-700" role="alert">That sign-in link didn&apos;t work. It may have expired or been used already. Ask for a new one below.</p>}
          <LoginForm />
        </div>
        <div className="mt-6 card p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">No work email?</p>
          <p className="mt-1">Scan your QR card with your phone&apos;s camera and enter your PIN to see your hours.</p>
        </div>
      </div>
    </main>
  );
}
