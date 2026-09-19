import { cn } from '../../../ui';

/** Qavat yoki bino holatining bitta chizig'i: jonli / tasvirsiz / oflayn
 * kameralar ulushi.
 *
 * Kampus kesimi kameralar RO'YXATINI yuklamaydi (butun tejamkorlik shunda) —
 * bizda faqat sanoqlar bor. Shuning uchun ulush: rang bo'yicha holat,
 * yonida esa aniq raqamlar. */
export default function StatusBar({
  live,
  noVideo,
  offline,
  className,
}: {
  live: number;
  noVideo: number;
  offline: number;
  className?: string;
}) {
  // noVideo jonlilarning ICHIDA: kamera javob beryapti, lekin tasvir yo'q.
  const healthy = Math.max(0, live - noVideo);
  const total = healthy + noVideo + offline;
  if (total === 0) {
    return <div className={cn('h-1.5 rounded-full bg-surface-3', className)} />;
  }
  const pct = (value: number) => `${(value * 100) / total}%`;
  return (
    <div
      className={cn('flex h-1.5 overflow-hidden rounded-full bg-surface-3', className)}
      role="img"
      aria-label={`${healthy} jonli, ${noVideo} tasvirsiz, ${offline} oflayn`}
    >
      {healthy > 0 && <span className="bg-success" style={{ width: pct(healthy) }} />}
      {noVideo > 0 && <span className="bg-warning" style={{ width: pct(noVideo) }} />}
      {offline > 0 && <span className="bg-subtle" style={{ width: pct(offline) }} />}
    </div>
  );
}
