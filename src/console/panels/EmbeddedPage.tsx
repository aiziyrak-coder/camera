import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { PageSkeleton } from '../../ui';
import RouteScope from '../routeScope';

/**
 * Mavjud sahifa — panel ichida.
 *
 * Sahifa o'zgartirilmaydi: u qanday bo'lsa, shunday chiziladi. Faqat
 * ikki narsa qo'shiladi — o'z manzil qobig'i (routeScope.tsx) va
 * SIJILADIGAN tana. Konsolning o'zi siljimaydi (konsol.md, 1-qoida):
 * siljish faqat yoyilgan panel ichida bo'ladi.
 */
export default function EmbeddedPage({
  path,
  component: Component,
}: {
  path: string;
  component: LazyExoticComponent<ComponentType<object>>;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
      <RouteScope path={path}>
        <Suspense fallback={<PageSkeleton />}>
          <Component />
        </Suspense>
      </RouteScope>
    </div>
  );
}
