/* Ilova qobig'i: tepada oddiy menyu, pastda sahifa. Yon panel yo'q. */
import { useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, ScanFace, ShieldCheck } from 'lucide-react';
import { useAuth, type Role } from './lib/auth';
import { usePermissions, type PermissionKey } from './lib/permissions';
import { branding } from './lib/branding';
import { cn } from './kit';
import AccountModal from './pages/Account';

export interface NavItem {
  to: string;
  label: string;
  permission: PermissionKey;
}

export const NAV: NavItem[] = [
  { to: '/yuzlar', label: 'Yuzlar bazasi', permission: 'registerPeople' },
  { to: '/hemis', label: 'HEMIS', permission: 'manageIntegrations' },
  { to: '/telegram', label: 'Telegram', permission: 'manageNotifications' },
  { to: '/foydalanuvchilar', label: 'Foydalanuvchilar', permission: 'manageRoles' },
];

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

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
        <ScanFace size={20} aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-ink">Yuzlar bazasi</span>
        <span className="block text-[12px] text-faint">{branding.orgName}</span>
      </span>
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

export default function Shell() {
  const { userName, role, logout } = useAuth();
  const nav = useNav();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" className="shrink-0">
            <Logo />
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Asosiy menyu">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3.5 py-2 text-[14.5px] font-medium transition-colors',
                    isActive ? 'bg-brand-tint text-brand' : 'text-soft hover:bg-ink/[0.04] hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="ml-auto flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-ink/[0.04]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-[13px] font-semibold text-soft">
              {(userName ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[160px] truncate text-[14px] font-medium text-ink">{userName}</span>
              <span className="block text-[12px] text-faint">{role ? ROLE_LABEL[role] : ''}</span>
            </span>
            <ChevronDown size={16} className="text-faint" aria-hidden />
          </button>
        </div>
        {nav.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Asosiy menyu">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-xl px-3 py-1.5 text-[14px] font-medium',
                    isActive ? 'bg-brand-tint text-brand' : 'text-soft',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {nav.length === 0 ? (
          <div className="card mx-auto max-w-md p-8 text-center">
            <ShieldCheck size={32} className="mx-auto text-faint" aria-hidden />
            <p className="mt-3 text-[16px] font-semibold">Sizga hali bo‘lim ochilmagan</p>
            <p className="mt-1 text-[14px] text-soft">Administratordan kerakli huquqlarni so‘rang.</p>
            <button type="button" onClick={logout} className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-brand">
              <LogOut size={16} aria-hidden /> Chiqish
            </button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
