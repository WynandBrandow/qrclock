"use client";
import { useEffect } from "react";

// Shown when a page fails (for example the database is unreachable). The error itself is
// recorded by instrumentation.ts.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="max-w-xl card p-6" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page couldn&apos;t load. It&apos;s usually a brief connection problem. Nothing you entered has been lost.
      </p>
      {error.digest && <p className="mt-2 text-xs text-slate-500">Reference: {error.digest}</p>}
      <button type="button" className="btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
