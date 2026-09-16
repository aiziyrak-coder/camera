/** Qavat yoki bino holatining bitta chizig'i: jonli / tasvirsiz / oflayn
 * kameralar ulushi.
 *
 * Har kamerani alohida nuqta qilib chizish ham mumkin edi, lekin kampus
 * kesimi kameralar RO'YXATINI yuklamaydi (butun tejamkorlik shunda) —
 * bizda faqat sanoqlar bor. Shuning uchun ulush: rang bo'yicha holat,
 * yonida esa aniq raqamlar. */
export default function StatusBar({
  live,
  noVideo,
  offline,
  className = '',
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
    return <div className={`h-1.5 rounded-full bg-slate-200 ${className}`} />;
  }
  const pct = (value: number) => `${(value * 100) / total}%`;
  return (
    <div className={`flex h-1.5 overflow-hidden rounded-full bg-slate-200 ${className}`}>
      {healthy > 0 && <span className="bg-emerald-500" style={{ width: pct(healthy) }} />}
      {noVideo > 0 && <span className="bg-amber-400" style={{ width: pct(noVideo) }} />}
      {offline > 0 && <span className="bg-slate-400" style={{ width: pct(offline) }} />}
    </div>
  );
}
