import { TriangleAlert } from 'lucide-react';
import { RagLegend, StatusBoard, type BoardItem } from '../hisobot/board';
import { EmptyState, ErrorState, Skeleton } from '../../ui';

/**
 * "Qayerda muammo bor?" — bo'linmalar/fakultetlar holat taxtasi,
 * yomoni birinchi. Chizish ishini yagona `StatusBoard` bajaradi — bu
 * yerda faqat holatlar (yuklanmoqda / xato / bo'sh) boshqariladi.
 */
export function UnitsBoard({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  emptyTitle,
  errorTitle,
}: {
  items: BoardItem[];
  loading: boolean;
  /** Xato bor, lekin eski ma'lumot ham bor bo'lsa — raqamlar ustida
   *  ogohlantirish chiqadi, jim qolinmaydi. */
  error: string | null;
  onRetry: () => void;
  onOpen?: (id: string) => void;
  emptyTitle: string;
  errorTitle: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface px-3 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-5 w-16" />
          </div>
        ))}
        <p className="col-span-full bg-surface px-3 py-2 text-[12px] text-muted">Yuklanmoqda…</p>
      </div>
    );
  }

  if (error && items.length === 0) {
    return <ErrorState title={errorTitle} message={error} onRetry={onRetry} />;
  }

  if (items.length === 0) {
    return <EmptyState compact bordered={false} title={emptyTitle} />;
  }

  return (
    <>
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 border-b border-warning/50 bg-warning-soft px-3 py-1.5 text-[12px] text-fg">
          <TriangleAlert size={14} aria-hidden="true" className="shrink-0" />
          <span>Yangilanmadi: {error}</span>
          <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
            Qayta urinish
          </button>
        </p>
      )}
      <StatusBoard items={items} onOpen={onOpen} />
      <RagLegend />
    </>
  );
}
