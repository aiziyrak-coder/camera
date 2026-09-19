import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, ScanEye, X } from 'lucide-react';
import { branding } from '../../lib/branding';
import type { Role } from '../../lib/auth';
import { Avatar, IconButton, cn, focusRing } from '../../ui';
import { ROLE_LABEL, matchesPath, usesViewDate, type NavSection } from './navConfig';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-fg shadow-sm', className)} aria-hidden="true">
      <ScanEye size={19} strokeWidth={2.2} />
    </span>
  );
}

interface SidebarProps {
  sections: NavSection[];
  collapsed: boolean;
  /** Telefon: off-canvas panel ochiqmi. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string | null;
  role: Role | null;
  onLogout: () => void;
  /** Tanlangan sana (`?sana=...`) davomat bo'limlari havolalarida saqlanadi. */
  linkSuffix: string;
}

export function Sidebar({ sections, collapsed, mobileOpen, onCloseMobile, userName, role, onLogout, linkSuffix }: SidebarProps) {
  const { pathname } = useLocation();
  // Telefondagi off-canvas panel doim to'liq (yig'ilmagan) holatda.
  const rail = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 animate-fade-in bg-black/40 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        id="app-sidebar"
        aria-label="Asosiy menyu"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-border bg-surface transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-pop' : 'invisible -translate-x-full lg:visible',
          rail ? 'lg:w-[4.25rem]' : 'lg:w-[15.5rem]',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-border', rail ? 'justify-center px-2' : 'px-4')}>
          <BrandMark />
          {!rail && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-fg">{branding.orgName}</p>
              <p className="truncate text-xs text-muted">{branding.systemName}</p>
            </div>
          )}
          {mobileOpen && <IconButton icon={X} label="Menyuni yopish" size="sm" onClick={onCloseMobile} className="lg:hidden" />}
        </div>

        <nav className={cn('no-scrollbar flex-1 overflow-y-auto py-2.5', rail ? 'px-2' : 'px-3')}>
          {sections.map((section, index) => (
            <div key={section.id} className={cn(index > 0 && (rail ? 'mt-2.5 border-t border-border pt-2.5' : 'mt-4'))}>
              {!rail && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{section.label}</p>}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = matchesPath(pathname, item.to, item.end);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={usesViewDate(item.to) ? `${item.to}${linkSuffix}` : item.to}
                        end={item.end}
                        onClick={onCloseMobile}
                        title={rail ? item.label : undefined}
                        aria-label={rail ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex h-8 items-center gap-3 rounded-control text-sm font-medium transition-colors',
                          focusRing,
                          rail ? 'justify-center px-0' : 'px-2.5',
                          active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
                        )}
                      >
                        {active && !rail && <span className="absolute -left-3 top-1.5 h-5 w-[3px] rounded-r bg-primary" aria-hidden="true" />}
                        <Icon size={18} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" aria-hidden="true" />
                        {!rail && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('shrink-0 border-t border-border', rail ? 'px-2 py-3' : 'p-3')}>
          {userName && role && (
            <div className={cn('flex items-center gap-2.5', rail ? 'flex-col' : 'rounded-control px-1.5 py-1')}>
              <Avatar name={userName} size="sm" />
              {!rail && (
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold text-fg">{userName}</p>
                  <p className="truncate text-xs text-muted">{ROLE_LABEL[role]}</p>
                </div>
              )}
              <IconButton icon={LogOut} label="Tizimdan chiqish" size="sm" variant="danger" onClick={onLogout} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
