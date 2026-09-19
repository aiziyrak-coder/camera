import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { useLiveEvents } from '../lib/realtime';
import { usePersistedState } from '../lib/usePersistedState';
import { VIEW_DATE_PARAM } from '../lib/viewDate';
import { PageSkeleton, cn } from '../ui';
import { ShellContext, type Crumb, type PageMeta } from '../ui/pageContext';
import { findActive, homeForRole, isPathAllowedForRole, usesViewDate, visibleSections } from './shell/navConfig';
import { CommandPalette } from './shell/CommandPalette';
import { useCommandPaletteHotkey } from './shell/useCommandPaletteHotkey';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';
import { usePresentation } from './shell/usePresentation';

/** Tizimga kirgandan keyingi YAGONA maket: chapda menyu, tepada panel
 *  (non-yo'l, sana, soat, holat, hodisalar, mavzu, taqdimot, foydalanuvchi),
 *  o'rtada sahifa. Sahifalar `Page` shabloni bilan chiziladi. */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { role, userName, logout } = useAuth();
  const { can } = usePermissions();

  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [collapsed, setCollapsed] = usePersistedState<boolean>('shell-sidebar-collapsed', false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const presentation = usePresentation();
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = useCallback(() => setSearchOpen((v) => !v), []);
  useCommandPaletteHotkey(toggleSearch, !presentation.active);

  // Hodisalarni ko'rish huquqi bo'lmasa, server WebSocket'ni baribir yopadi
  // (4403) — ulanishga umuman urinmaymiz. event_updated — mavjud hodisaning
  // holati o'zgargani, yangi hodisa emas.
  const canReviewEvents = can('reviewEvents', role);
  const [unreadEvents, setUnreadEvents] = useState(0);
  useLiveEvents((event) => {
    if (event.kind !== 'event_updated') setUnreadEvents((n) => n + 1);
  }, canReviewEvents);

  useEffect(() => {
    setMobileNavOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMobileNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const canKey = useCallback((key: Parameters<typeof can>[0]) => can(key, role), [can, role]);
  const sections = useMemo(() => visibleSections(canKey, role), [canKey, role]);

  const exitPresentation = presentation.exit;
  const handleLogout = useCallback(() => {
    exitPresentation();
    logout();
    navigate('/kirish', { replace: true });
  }, [logout, navigate, exitPresentation]);

  const openEvents = useCallback(() => {
    setUnreadEvents(0);
    navigate('/hodisalar');
  }, [navigate]);

  const shellValue = useMemo(() => ({ setPageMeta: setMeta, presentation: presentation.active, inShell: true }), [presentation.active]);

  const crumbs: Crumb[] = useMemo(() => {
    if (meta?.crumbs && meta.crumbs.length > 0) return meta.crumbs;
    const active = findActive(location.pathname);
    if (!active) return meta ? [{ label: meta.title }] : [];
    if (active.item.to === '/') return [{ label: meta?.title ?? active.item.label }];
    return [{ label: active.section.label }, { label: meta?.title ?? active.item.label }];
  }, [meta, location.pathname]);

  // Cheklangan rol (kamera mas'uli) ruxsat etilmagan manzilga tushsa
  // (eski havola, brauzer tarixi) — o'z bosh sahifasiga qaytariladi.
  if (!isPathAllowedForRole(role, location.pathname)) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  const rawDate = params.get(VIEW_DATE_PARAM);
  const linkSuffix = rawDate ? `?${VIEW_DATE_PARAM}=${encodeURIComponent(rawDate)}` : '';
  const showDate = usesViewDate(location.pathname);

  return (
    <ShellContext.Provider value={shellValue}>
      <div className="flex min-h-screen bg-bg">
        <a
          href="#asosiy"
          className="sr-only z-[70] rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Asosiy qismga o'tish
        </a>
        {!presentation.active && (
          <Sidebar
            sections={sections}
            collapsed={collapsed}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
            userName={userName}
            role={role}
            onLogout={handleLogout}
            linkSuffix={linkSuffix}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            crumbs={crumbs}
            showDate={showDate}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            mobileNavOpen={mobileNavOpen}
            sidebarCollapsed={collapsed}
            onToggleSidebar={() => setCollapsed((value) => !value)}
            presentation={presentation}
            bell={{ enabled: canReviewEvents, count: unreadEvents, onOpen: openEvents }}
            userName={userName}
            role={role}
            onLogout={handleLogout}
            onOpenSearch={() => setSearchOpen(true)}
            wallScreen={can('viewReports', role) || can('manageAttendance', role)}
          />
          <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} sections={sections} can={canKey} />
          <main id="asosiy" tabIndex={-1} className={cn('flex min-w-0 flex-1 flex-col outline-none', presentation.active ? 'p-6' : 'px-4 py-5 sm:px-6 lg:px-8 lg:py-7')}>
            <div className={cn('mx-auto flex w-full min-w-0 flex-1 flex-col', !presentation.active && 'max-w-[1600px]')}>
              {/* Sahifa bo'lagi yuklanayotganda menyu va panel joyida qoladi. */}
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
