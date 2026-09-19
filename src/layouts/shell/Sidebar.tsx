import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, ScanEye, Star, X, type LucideIcon } from 'lucide-react';
import { usePersistedState } from '../../lib/usePersistedState';
import { branding } from '../../lib/branding';
import type { Role } from '../../lib/auth';
import { Avatar, IconButton, cn, focusRing } from '../../ui';
import { ROLE_LABEL, matchesPath, usesViewDate, type NavItem, type NavSection } from './navConfig';

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
  // Foydalanuvchi tanlovlari brauzerda (usePersistedState — try/catch bilan).
  const [favorites, setFavorites] = usePersistedState<string[]>('shell-nav-favorites', []);
  const [collapsedSections, setCollapsedSections] = usePersistedState<string[]>('shell-nav-collapsed', []);
  const safeFavorites = Array.isArray(favorites) ? favorites : [];
  const allItems = sections.flatMap((section) => section.items);
  // Tartib — foydalanuvchi qo'shgan tartibda; huquqi yo'qolgan sahifa ko'rinmaydi.
  const favoriteItems = safeFavorites.map((to) => allItems.find((item) => item.to === to)).filter((item): item is NavItem => Boolean(item));

  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });
  const toggleFavorite = (to: string) =>
    setFavorites((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(to) ? list.filter((x) => x !== to) : [...list, to];
    });

  const itemProps: NavItemSharedProps = { pathname, rail, linkSuffix, onNavigate: onCloseMobile, favorites: safeFavorites, onToggleFavorite: toggleFavorite };

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
          {favoriteItems.length > 0 && (
            <NavGroup
              id="sevimlilar"
              label="Sevimlilar"
              icon={Star}
              items={favoriteItems}
              first
              rail={rail}
              collapsed={!rail && collapsedSections.includes('sevimlilar')}
              onToggle={() => toggleSection('sevimlilar')}
              itemProps={itemProps}
            />
          )}
          {sections.map((section, index) => (
            <NavGroup
              key={section.id}
              id={section.id}
              label={section.label}
              items={section.items}
              first={index === 0 && favoriteItems.length === 0}
              rail={rail}
              // Faol sahifa bo'limi yig'ilgan bo'lsa ham ko'rinadi.
              collapsed={!rail && collapsedSections.includes(section.id) && !section.items.some((item) => matchesPath(pathname, item.to, item.end))}
              onToggle={() => toggleSection(section.id)}
              itemProps={itemProps}
            />
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

interface NavItemSharedProps {
  pathname: string;
  rail: boolean;
  linkSuffix: string;
  onNavigate: () => void;
  favorites: string[];
  onToggleFavorite: (to: string) => void;
}

function NavGroup({
  id,
  label,
  icon: GroupIcon,
  items,
  first,
  rail,
  collapsed,
  onToggle,
  itemProps,
}: {
  id: string;
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
  first: boolean;
  rail: boolean;
  collapsed: boolean;
  onToggle: () => void;
  itemProps: NavItemSharedProps;
}) {
  const listId = `nav-${id}`;
  return (
    <div className={cn(!first && (rail ? 'mt-2.5 border-t border-border pt-2.5' : 'mt-3'))}>
      {!rail && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className={cn(
            'group/sec mb-0.5 flex h-7 w-full items-center gap-1.5 rounded-control px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle transition-colors hover:text-muted',
            focusRing,
          )}
        >
          {GroupIcon && <GroupIcon size={12} className="text-warning" fill="currentColor" aria-hidden="true" />}
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn('opacity-0 transition-[transform,opacity] group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100', collapsed && '-rotate-90 opacity-100')}
          />
        </button>
      )}
      {!collapsed && (
        <ul id={listId} className="flex flex-col gap-0.5">
          {items.map((item) => (
            <NavRow key={item.to} item={item} {...itemProps} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NavRow({ item, pathname, rail, linkSuffix, onNavigate, favorites, onToggleFavorite }: NavItemSharedProps & { item: NavItem }) {
  const active = matchesPath(pathname, item.to, item.end);
  const Icon = item.icon;
  const pinned = favorites.includes(item.to);
  return (
    <li className="group/row relative">
      <NavLink
        to={usesViewDate(item.to) ? `${item.to}${linkSuffix}` : item.to}
        end={item.end}
        onClick={onNavigate}
        title={rail ? item.label : undefined}
        aria-label={rail ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex h-8 items-center gap-3 rounded-control text-sm font-medium transition-colors',
          focusRing,
          rail ? 'justify-center px-0' : 'pl-2.5 pr-8',
          active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        {active && (
          <span
            className={cn('absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_8px_rgb(var(--c-primary)/0.5)]', rail ? '-left-2' : '-left-3')}
            aria-hidden="true"
          />
        )}
        <Icon size={18} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" aria-hidden="true" />
        {!rail && <span className="truncate">{item.label}</span>}
      </NavLink>
      {!rail && (
        <button
          type="button"
          onClick={() => onToggleFavorite(item.to)}
          aria-pressed={pinned}
          aria-label={pinned ? `${item.label}: sevimlilardan olib tashlash` : `${item.label}: sevimlilarga qo'shish`}
          title={pinned ? 'Sevimlilardan olib tashlash' : "Sevimlilarga qo'shish"}
          className={cn(
            'absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[6px] transition-[opacity,color] hover:bg-surface-3 focus-visible:opacity-100',
            focusRing,
            pinned ? 'text-warning opacity-0 group-hover/row:opacity-100' : 'text-subtle opacity-0 hover:text-fg group-hover/row:opacity-100',
          )}
        >
          <Star size={13} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
