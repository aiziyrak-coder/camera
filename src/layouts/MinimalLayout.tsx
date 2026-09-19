import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { branding } from '../lib/branding';
import { useAuth } from '../lib/auth';
import { ButtonLink, PageSkeleton, cn } from '../ui';
import { BrandMark } from './shell/Sidebar';

/** Tizimga kirmasdan ochiladigan sahifalar uchun sodda maket:
 *  - `center` — kirish va parolni tiklash (markazdagi karta);
 *  - `page` — ochiq ro'yxatdan o'tish (tepada nom va "Kirish"). */
export default function MinimalLayout({ variant = 'center' }: { variant?: 'center' | 'page' }) {
  const { role } = useAuth();

  if (variant === 'page') {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-control">
              <BrandMark className="h-8 w-8" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-fg">{branding.orgName}</span>
                <span className="block truncate text-xs text-muted">{branding.systemName}</span>
              </span>
            </Link>
            <div className="flex-1" />
            <ButtonLink to={role ? '/' : '/kirish'} size="sm" icon={role ? undefined : LogIn}>
              {role ? 'Bosh sahifa' : 'Kirish'}
            </ButtonLink>
          </div>
        </header>
        <main className="flex-1 px-4 py-6">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* Juda yengil fon naqshi — shovqinsiz. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(rgb(var(--c-border))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      <div className={cn('relative w-full max-w-[400px]')}>
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="h-11 w-11 rounded-xl" />
          <p className="mt-4 text-lg font-semibold tracking-tight text-fg">{branding.systemName}</p>
          <p className="mt-0.5 text-sm text-muted">{branding.orgFullName}</p>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-subtle">
          <ShieldCheck size={14} aria-hidden="true" />
          Ulanish shifrlangan (HTTPS)
        </p>
      </div>
    </div>
  );
}
