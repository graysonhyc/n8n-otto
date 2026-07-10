// Instant navigation skeleton. Because every backoffice route is
// `force-dynamic` (fresh n8n fetch per view), a `loading.tsx` boundary is what
// lets <Link> prefetch the shell and show this frame the moment a tab is
// clicked — instead of blocking on the server render with a frozen page.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-panel-2 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="p-6">
      <div className="mb-4.5 flex items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Bar className="h-6 w-52" />
          <Bar className="h-3.5 w-72" />
        </div>
        <Bar className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line bg-panel p-4">
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-1/2" />
            <Bar className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
