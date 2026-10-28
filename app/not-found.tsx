import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-slate-600">That link doesn&apos;t lead anywhere in QR Clock.</p>
        <Link href="/" className="btn-primary mt-6">Go to QR Clock</Link>
      </div>
    </main>
  );
}
