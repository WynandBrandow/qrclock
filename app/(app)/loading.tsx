export default function Loading() {
  return (
    <div className="max-w-5xl animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-slate-200 mb-3" />
      <div className="h-4 w-32 rounded bg-slate-200 mb-8" />
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-slate-200" />)}
      </div>
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
