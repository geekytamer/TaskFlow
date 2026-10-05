/** Loading placeholder shaped like a page: a heading, a figure row and a list. */
export function PageSkeleton({ label }: { label: string }) {
  const bar = 'rounded-md bg-ink/[0.07] motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <div className={`${bar} h-8 w-56`} />
        <div className={`${bar} h-4 w-80 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className={`${bar} h-16`} />)}
      </div>
      <div className="divide-y divide-line rounded-panel border border-line bg-surface">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 space-y-2"><div className={`${bar} h-4 w-1/2`} /><div className={`${bar} h-3 w-1/3`} /></div>
            <div className={`${bar} h-5 w-16`} />
          </div>
        ))}
      </div>
    </div>
  );
}
