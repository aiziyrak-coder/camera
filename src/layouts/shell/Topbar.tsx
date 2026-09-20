import { LogOut, Menu as MenuIcon, Minimize2, MonitorUp, Moon, PanelLeftClose, PanelLeftOpen, Presentation, Search, Sun, WifiOff } from 'lucide-react';
import { branding } from '../../lib/branding';
import type { Role } from '../../lib/auth';
import type { LiveStatus } from '../../lib/realtime';
import { useViewDate } from '../../lib/viewDate';
import { Avatar, Button, DatePicker, IconButton, Menu, cn, focusRing, formatUzDate, useTheme, type Crumb } from '../../ui';
import { ROLE_LABEL, openWallScreen } from './navConfig';
import { BrandMark } from './Sidebar';
import { Breadcrumbs, EventsBell, LiveClock, SystemStatus } from './TopbarWidgets';

interface TopbarProps {
  crumbs: Crumb[];
  showDate: boolean;
  onOpenMobileNav: () => void;
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  presentation: { active: boolean; toggle: () => void; exit: () => void };
  bell: { enabled: boolean; count: number; onOpen: () => void };
  userName: string | null;
  role: Role | null;
  onLogout: () => void;
  /** Global qidiruvni (Ctrl/⌘+K) ochish. */
  onOpenSearch?: () => void;
  /** Devor ekrani (/markaz-ekran) ko'rsatilsinmi (huquq bo'yicha). */
  wallScreen?: boolean;
  /** Jonli (WebSocket) ulanish holati — uzilganini AYTISH shart. */
  live?: LiveStatus;
}

/** Jonli yangilanish to'xtaganini ko'rsatuvchi yorliq.
 *
 *  Bunisiz ekran jonli ko'rinardi, lekin emas edi: ulanish uzilganda
 *  ro'yxat shunchaki yangilanishdan to'xtardi va operator eski holatga
 *  qarab "tinch" deb o'ylab o'tirardi. Devor ekrani kun bo'yi ochiq
 *  turadi — aynan u yerda bu eng xavfli. */
export function LiveIndicator({ status, compact = false }: { status: LiveStatus; compact?: boolean }) {
  if (status === 'live' || status === 'off') return null;
  const retrying = status === 'connecting';
  const text = retrying ? 'Jonli yangilanish uzildi — qayta ulanmoqda' : "Jonli yangilanish to'xtadi — sahifani yangilang";
  return (
    <span
      role="status"
      title={text}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
        retrying ? 'border-warning/40 bg-warning-soft text-warning' : 'border-danger/40 bg-danger-soft text-danger',
      )}
    >
      <WifiOff size={13} aria-hidden="true" className={retrying ? 'animate-pulse' : undefined} />
      <span className={compact ? 'sr-only' : 'hidden lg:inline'}>{retrying ? 'Qayta ulanmoqda…' : "Jonli yangilanish to'xtadi"}</span>
      {compact && <span className="sr-only">{text}</span>}
    </span>
  );
}


const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Qidirish (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          'hidden h-8 w-52 items-center gap-2 rounded-control border border-border bg-surface-2/70 px-2.5 text-[13px] text-subtle transition-colors hover:border-border-strong hover:bg-surface hover:text-muted lg:inline-flex xl:w-64',
          focusRing,
        )}
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 text-left">Qidirish…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-px font-sans text-[10.5px] font-medium text-muted">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <IconButton icon={Search} label="Qidirish" onClick={onOpen} className="lg:hidden" />
    </>
  );
}

function ViewDateControl({ compact }: { compact?: boolean }) {
  const { date, setDate } = useViewDate();
  return <DatePicker value={date} onChange={setDate} quick={!compact} stepper size="sm" compact={compact} ariaLabel="Ko'rilayotgan sana" className="min-w-0" />;
}

export function Topbar({ crumbs, showDate, onOpenMobileNav, mobileNavOpen, sidebarCollapsed, onToggleSidebar, presentation, bell, userName, role, onLogout, onOpenSearch, wallScreen, live = 'off' }: TopbarProps) {
  const { preference, toggleTheme } = useTheme();
  const dark = preference === 'dark';

  if (presentation.active) {
    return <PresentationBar crumbs={crumbs} showDate={showDate} onExit={presentation.exit} bell={bell} live={live} />;
  }

  return (
    <header data-print="hide" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:gap-3 sm:px-6">
      <IconButton
        icon={MenuIcon}
        label="Menyuni ochish"
        onClick={onOpenMobileNav}
        aria-expanded={mobileNavOpen}
        aria-controls="app-sidebar"
        className="-ml-1 lg:hidden"
      />
      <IconButton
        icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
        label={sidebarCollapsed ? 'Menyuni kengaytirish' : "Menyuni yig'ish"}
        onClick={onToggleSidebar}
        aria-expanded={!sidebarCollapsed}
        aria-controls="app-sidebar"
        className="-ml-2 hidden lg:inline-flex"
      />
      <div className="min-w-0 flex-1">
        <Breadcrumbs crumbs={crumbs} />
      </div>

      {onOpenSearch && <SearchTrigger onOpen={onOpenSearch} />}

      {showDate && (
        <>
          <div className="hidden sm:block">
            <ViewDateControl />
          </div>
          <div className="sm:hidden">
            <ViewDateControl compact />
          </div>
        </>
      )}

      <div className="hidden items-center gap-3 xl:flex">
        <LiveClock className="text-sm" />
      </div>
      <div className="hidden md:block">
        <SystemStatus showLabel={!showDate} />
      </div>

      <div className="flex items-center gap-0.5">
        <LiveIndicator status={live} />
        {bell.enabled && <EventsBell count={bell.count} onOpen={bell.onOpen} />}
        <IconButton icon={dark ? Sun : Moon} label={dark ? "Yorug' mavzu" : "Qorong'i mavzu"} onClick={toggleTheme} className="hidden sm:inline-flex" />
        {wallScreen && <IconButton icon={MonitorUp} label="Katta ekran (devor) — yangi oynada" onClick={openWallScreen} className="hidden md:inline-flex" />}
        <IconButton icon={Presentation} label="Taqdimot rejimi (joriy sahifa to'liq ekranda)" onClick={presentation.toggle} className="hidden md:inline-flex" />
      </div>

      {userName && role && (
        <Menu
          width="w-64"
          header={
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{userName}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[role]}</p>
            </div>
          }
          items={[
            { label: dark ? "Yorug' mavzu" : "Qorong'i mavzu", icon: dark ? Sun : Moon, onSelect: toggleTheme },
            { label: 'Taqdimot rejimi', icon: Presentation, onSelect: presentation.toggle },
            ...(wallScreen ? [{ label: 'Katta ekran (devor)', icon: MonitorUp, onSelect: openWallScreen }] : []),
            'separator',
            { label: 'Tizimdan chiqish', icon: LogOut, danger: true, onSelect: onLogout },
          ]}
          trigger={(props) => (
            <button {...props} type="button" aria-label={`Foydalanuvchi menyusi: ${userName}`} className={cn('rounded-full', focusRing)}>
              <Avatar name={userName} size="sm" />
            </button>
          )}
        />
      )}
    </header>
  );
}

/** Devor ekrani uchun yuqori panel: katta soat, sana, sahifa nomi, chiqish. */
function PresentationBar({ crumbs, showDate, onExit, bell, live = 'off' }: { crumbs: Crumb[]; showDate: boolean; onExit: () => void; bell: TopbarProps['bell']; live?: LiveStatus }) {
  const { date } = useViewDate();
  const title = crumbs[crumbs.length - 1]?.label;
  return (
    <header data-print="hide" className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface/90 px-6 backdrop-blur">
      <BrandMark />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-fg">{branding.orgName}</p>
        <p className="truncate text-xs text-muted">{branding.systemName}</p>
      </div>
      {title && (
        <>
          <span className="h-8 w-px bg-border" aria-hidden="true" />
          <h2 className="truncate text-lg font-semibold text-fg">{title}</h2>
        </>
      )}
      <div className="flex-1" />
      {showDate && <span className="hidden text-sm font-medium text-muted md:inline">{formatUzDate(date, { weekday: true })}</span>}
      <LiveClock seconds className="text-2xl" />
      <SystemStatus showLabel={false} />
      <LiveIndicator status={live} />
      {bell.enabled && <EventsBell count={bell.count} onOpen={bell.onOpen} />}
      <Button variant="secondary" size="sm" icon={Minimize2} onClick={onExit} title="Taqdimot rejimidan chiqish (Esc)">
        Chiqish
      </Button>
    </header>
  );
}
