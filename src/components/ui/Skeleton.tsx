/** Yuklanish holati — spinner o'rniga sahifa shaklidagi joy egallovchilar.
 *  Foydalanuvchi nima yuklanayotganini ko'radi, sahifa esa sakramaydi. */

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 motion-reduce:animate-none ${className}`} />;
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  return (
    <div className="overflow-hidden rounded-xl border border-white/70" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="grid gap-4 bg-white/50 px-4 py-3" style={grid}>
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3 w-2/3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-4 border-t border-white/60 px-4 py-3.5" style={grid}>
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonBlock key={c} className={`h-3.5 ${c === 0 ? 'w-5/6' : 'w-1/2'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`} aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/70 bg-white/50 p-4">
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="mt-3 h-7 w-1/3" />
          <SkeletonBlock className="mt-3 h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <section className="glass p-6" aria-busy="true" aria-label="Sahifa yuklanmoqda">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="mt-2 h-3.5 w-80 max-w-full" />
      <SkeletonCards className="mt-6" />
      <div className="mt-6">
        <SkeletonTable />
      </div>
    </section>
  );
}
