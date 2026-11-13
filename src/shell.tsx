/* Ilova qobig'i: to'liq ekran, chapda menyu, o'ngda ish maydoni. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  RefreshCw,
  ScanFace,
  Search,
  Send,
  ShieldCheck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, type Role } from './lib/auth';
import { usePermissions, type PermissionKey } from './lib/permissions';
import { api } from './lib/apiClient';
import { branding } from './lib/branding';
import { cn, isTyping, layerOpen } from './kit';
import AccountModal from './pages/Account';

/* ─────────────────────────── Menyu */

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionKey;
  group: 'asosiy' | 'integratsiya' | 'tizim';
  hint: string;
}

export const NAV: NavItem[] = [
  { to: '/panel', label: 'Boshqaruv paneli', icon: LayoutGrid, permission: 'registerPeople', group: 'asosiy', hint: 'Umumiy holat' },
  { to: '/yuzlar', label: 'Yuzlar bazasi', icon: ScanFace, permission: 'registerPeople', group: 'asosiy', hint: 'Talaba va xodimlar' },
  { to: '/tasdiqlash', label: 'Tasdiqlash', icon: ListChecks, permission: 'registerPeople', group: 'asosiy', hint: 'Yuborilgan yuzlarni ko‘rib chiqish' },
  { to: '/hemis', label: 'HEMIS', icon: RefreshCw, permission: 'manageIntegrations', group: 'integratsiya', hint: 'Ro‘yxatni yangilash' },
  { to: '/telegram', label: 'Telegram', icon: Send, permission: 'manageNotifications', group: 'integratsiya', hint: 'Bot va xabarlar' },
  { to: '/foydalanuvchilar', label: 'Foydalanuvchilar', icon: UsersRound, permission: 'manageRoles', group: 'tizim', hint: 'Tizimga kiruvchilar' },
];

const GROUP_LABEL: Record<NavItem['group'], string> = {
  asosiy: 'Asosiy',
  integratsiya: 'Integratsiyalar',
  tizim: 'Tizim',
};

export const ROLE_LABEL: Record<Role, string> = {
  'super-admin': 'Super admin',
  admin: 'Administrator',
  'kamera-masuli': "Kamera mas'uli",
};

export function useNav(): NavItem[] {
  const { role } = useAuth();
  const { can } = usePermissions();
  return NAV.filter((item) => can(item.permission, role));
}

/* ─────────────────────────── Umumiy qamrov (menyu hisoblagichi va panel uchun) */

export interface Coverage {
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  percent: number | null;
  awaitingApproval?: number;
  byFaculty?: { faculty: string; total: number; confirmed: number; pending: number; missing: number; percent: number | null }[];
  byCourse?: { course: string; courseNumber: number | null; total: number; confirmed: number; pending: number; missing: number; percent: number | null }[];
}

export interface Overview {
  talaba: Coverage;
  xodim: Coverage;
}

const OverviewContext = createContext<{ overview: Overview | null; reload: () => void }>({ overview: null, reload: () => undefined });

export function useOverview() {
  return useContext(OverviewContext);
}

function OverviewProvider({ children }: { children: ReactNode }) {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const allowed = can('registerPeople', role);
  const [overview, setOverview] = useState<Overview | null>(null);

  const reload = useCallback(() => {
    if (!allowed) return;
    api
      .get<Overview>('/api/students-staff/overview', token)
      .then(setOverview)
      .catch(() => undefined);
  }, [allowed, token]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const value = useMemo(() => ({ overview, reload }), [overview, reload]);
  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

/* ─────────────────────────── Himoya */

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
        <ScanFace size={17} aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold text-ink">Yuzlar bazasi</span>
          <span className="block truncate text-[11.5px] text-faint">{branding.orgName}</span>
        </span>
      )}
    </span>
  );
}

export function RequireAuth() {
  const { role } = useAuth();
  const location = useLocation();
  if (!role) return <Navigate to="/kirish" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const { role } = useAuth();
  const { can } = usePermissions();
  if (!can(permission, role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/* ─────────────────────────── Qobiq */

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('yb-sidebar') === '1';
  } catch {
    return false;
  }
}

export default function Shell() {
  const nav = useNav();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('yb-sidebar', collapsed ? '1' : '0');
    } catch {
      /* saqlanmasa ham ishlaydi */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === '/' && !isTyping(e) && !layerOpen()) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = nav.find((n) => location.pathname.startsWith(n.to));

  return (
    <OverviewProvider>
      <div className="flex h-full overflow-hidden bg-side">
        {/* Kompyuter: doimiy menyu */}
        <aside className={cn('hidden shrink-0 border-r border-line transition-[width] duration-200 lg:flex', collapsed ? 'w-[60px]' : 'w-[240px]')}>
          <Sidebar
            nav={nav}
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            onSearch={() => setPaletteOpen(true)}
            onAccount={() => setAccountOpen(true)}
          />
        </aside>

        {/* Telefon: ochiladigan menyu */}
        {mobileOpen && (
          <div className="anim-fade fixed inset-0 z-40 bg-ink/20 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMobileOpen(false)}>
            <aside className="anim-slide flex h-full w-[260px] border-r border-line bg-side">
              <Sidebar
                nav={nav}
                collapsed={false}
                onSearch={() => {
                  setMobileOpen(false);
                  setPaletteOpen(true);
                }}
                onAccount={() => {
                  setMobileOpen(false);
                  setAccountOpen(true);
                }}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col bg-white lg:my-2 lg:mr-2 lg:rounded-xl lg:border lg:border-line">
          {/* Yuqori qator */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 lg:px-5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-soft hover:bg-sunk lg:hidden"
              aria-label="Menyu"
            >
              <Menu size={18} aria-hidden />
            </button>
            <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Joylashuv">
              <span className="hidden text-faint sm:inline">{branding.orgName}</span>
              <span className="hidden text-line sm:inline">/</span>
              <span className="truncate font-medium text-ink">{current?.label ?? ''}</span>
            </nav>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-[12.5px] text-faint transition-colors hover:border-[#d4d4d8] hover:text-soft sm:w-64"
            >
              <Search size={14} aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Qidirish yoki o‘tish...</span>
              <kbd className="kbd hidden sm:inline-flex">Ctrl K</kbd>
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            {nav.length === 0 ? <NoAccess /> : <Outlet />}
          </main>
        </div>
      </div>

      {paletteOpen && <CommandPalette nav={nav} onClose={() => setPaletteOpen(false)} />}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </OverviewProvider>
  );
}

function Sidebar({
  nav,
  collapsed,
  onToggle,
  onSearch,
  onAccount,
}: {
  nav: NavItem[];
  collapsed: boolean;
  onToggle?: () => void;
  onSearch: () => void;
  onAccount: () => void;
}) {
  const { userName, role } = useAuth();
  const { overview } = useOverview();
  const awaiting = (overview?.talaba.awaitingApproval ?? 0) + (overview?.xodim.awaitingApproval ?? 0);
  const groups = (['asosiy', 'integratsiya', 'tizim'] as const).map((g) => ({ g, items: nav.filter((n) => n.group === g) })).filter((x) => x.items.length);

  return (
    <div className="flex w-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}>
        <Logo compact={collapsed} />
      </div>

      <div className={cn('px-3', collapsed && 'px-2.5')}>
        <button
          type="button"
          onClick={onSearch}
          title="Qidirish (Ctrl K)"
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-white text-[12.5px] text-faint transition-colors hover:text-soft',
            collapsed ? 'justify-center' : 'px-2.5',
          )}
        >
          <Search size={14} aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Qidirish</span>
              <kbd className="kbd">/</kbd>
            </>
          )}
        </button>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-3" aria-label="Asosiy menyu">
        {groups.map(({ g, items }) => (
          <div key={g} className="mt-3 first:mt-1">
            {!collapsed && <p className="label-xs px-2.5 pb-1.5 pt-1">{GROUP_LABEL[g]}</p>}
            {collapsed && <div className="mx-auto my-2 h-px w-6 bg-line first:hidden" />}
            <ul className="flex flex-col gap-px">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-8 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors',
                        collapsed ? 'justify-center' : 'px-2.5',
                        isActive ? 'bg-white text-ink shadow-[0_0_0_1px_rgba(10,10,11,0.06),0_1px_2px_rgba(10,10,11,0.05)]' : 'text-soft hover:bg-black/[0.04] hover:text-ink',
                      )
                    }
                  >
                    <item.icon size={16} className="shrink-0" aria-hidden />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {item.to === '/tasdiqlash' && awaiting > 0 && (
                      <span
                        className={cn(
                          'tnum rounded-md bg-ink text-[11px] font-semibold text-white',
                          collapsed ? 'absolute -right-1 -top-1 px-1' : 'px-1.5 py-px',
                        )}
                      >
                        {awaiting > 999 ? '999+' : awaiting}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-2.5">
        <button
          type="button"
          onClick={onAccount}
          title="Hisobim"
          className={cn('flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-black/[0.04]', collapsed && 'justify-center')}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-[12px] font-semibold text-white">
            {(userName ?? '?').slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-ink">{userName}</span>
              <span className="block truncate text-[11.5px] text-faint">{role ? ROLE_LABEL[role] : ''}</span>
            </span>
          )}
        </button>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={cn('mt-1 flex h-7 w-full items-center gap-2 rounded-lg text-[12px] text-faint transition-colors hover:bg-black/[0.04] hover:text-soft', collapsed ? 'justify-center' : 'px-2.5')}
            title={collapsed ? 'Menyuni kengaytirish' : 'Menyuni yig‘ish'}
          >
            {collapsed ? <ChevronsRight size={15} aria-hidden /> : <ChevronsLeft size={15} aria-hidden />}
            {!collapsed && 'Yig‘ish'}
          </button>
        )}
      </div>
    </div>
  );
}

function NoAccess() {
  const { logout } = useAuth();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <ShieldCheck size={28} className="mx-auto text-faint" aria-hidden />
        <p className="mt-3 text-[15px] font-semibold">Sizga hali bo‘lim ochilmagan</p>
        <p className="mt-1 text-[13px] text-soft">Administratordan kerakli huquqlarni so‘rang.</p>
        <button type="button" onClick={logout} className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-ink underline-offset-4 hover:underline">
          <LogOut size={15} aria-hidden /> Chiqish
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Buyruqlar oynasi (Ctrl K) */

interface PaletteItem {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

function CommandPalette({ nav, onClose }: { nav: NavItem[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSearchPeople = nav.some((n) => n.to === '/yuzlar');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteItem[] = [];
    if (q && canSearchPeople) {
      list.push({
        key: 'search',
        label: `“${query.trim()}” — odamlardan qidirish`,
        hint: 'Yuzlar bazasi',
        icon: Search,
        run: () => navigate(`/yuzlar?q=${encodeURIComponent(query.trim())}`),
      });
    }
    for (const n of nav) {
      if (!q || n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q)) {
        list.push({ key: n.to, label: n.label, hint: n.hint, icon: n.icon, run: () => navigate(n.to) });
      }
    }
    return list;
  }, [query, nav, navigate, canSearchPeople]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function choose(item: PaletteItem | undefined) {
    if (!item) return;
    item.run();
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop w-full max-w-[560px] overflow-hidden rounded-xl bg-white shadow-lift" role="dialog" aria-modal="true" aria-label="Qidirish">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(items[active]);
              }
            }}
            placeholder="Ism, JSHSHIR yoki bo‘lim nomi..."
            className="h-full flex-1 bg-transparent text-[14px] text-ink placeholder:text-faint focus:outline-none"
            aria-label="Qidirish"
          />
          <button type="button" onClick={onClose} className="text-faint hover:text-ink" aria-label="Yopish">
            <X size={16} aria-hidden />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-faint">Hech narsa topilmadi</li>}
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item)}
                className={cn('flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left', i === active ? 'bg-sunk' : '')}
              >
                <item.icon size={16} className="shrink-0 text-soft" aria-hidden />
                <span className="flex-1 truncate text-[13.5px] text-ink">{item.label}</span>
                <span className="truncate text-[12px] text-faint">{item.hint}</span>
                {i === active && <CornerDownLeft size={14} className="text-faint" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-side px-4 py-2 text-[11.5px] text-faint">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> tanlash
          </span>
          <span>
            <kbd className="kbd">Enter</kbd> ochish
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> yopish
          </span>
        </div>
      </div>
    </div>
  );
}
