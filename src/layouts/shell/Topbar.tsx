import { LogOut, Menu as MenuIcon, Minimize2, Moon, PanelLeftClose, PanelLeftOpen, Presentation, Sun } from 'lucide-react';
import { branding } from '../../lib/branding';
import type { Role } from '../../lib/auth';
import { useViewDate } from '../../lib/viewDate';
import { Avatar, Button, DatePicker, IconButton, Menu, cn, focusRing, formatUzDate, useTheme, type Crumb } from '../../ui';
import { ROLE_LABEL } from './navConfig';
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
}

function ViewDateControl({ compact }: { compact?: boolean }) {
  const { date, setDate } = useViewDate();
  return <DatePicker value={date} onChange={setDate} quick={!compact} stepper size="sm" compact={compact} ariaLabel="Ko'rilayotgan sana" className="min-w-0" />;
}

export function Topbar({ crumbs, showDate, onOpenMobileNav, mobileNavOpen, sidebarCollapsed, onToggleSidebar, presentation, bell, userName, role, onLogout }: TopbarProps) {
  const { preference, toggleTheme } = useTheme();
  const dark = preference === 'dark';

  if (presentation.active) {
    return <PresentationBar crumbs={crumbs} showDate={showDate} onExit={presentation.exit} bell={bell} />;
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:gap-3 sm:px-6">
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
        {bell.enabled && <EventsBell count={bell.count} onOpen={bell.onOpen} />}
        <IconButton icon={dark ? Sun : Moon} label={dark ? "Yorug' mavzu" : "Qorong'i mavzu"} onClick={toggleTheme} className="hidden sm:inline-flex" />
        <IconButton icon={Presentation} label="Taqdimot rejimi (devor ekrani)" onClick={presentation.toggle} className="hidden md:inline-flex" />
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
function PresentationBar({ crumbs, showDate, onExit, bell }: { crumbs: Crumb[]; showDate: boolean; onExit: () => void; bell: TopbarProps['bell'] }) {
  const { date } = useViewDate();
  const title = crumbs[crumbs.length - 1]?.label;
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface/90 px-6 backdrop-blur">
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
      {bell.enabled && <EventsBell count={bell.count} onOpen={bell.onOpen} />}
      <Button variant="secondary" size="sm" icon={Minimize2} onClick={onExit} title="Taqdimot rejimidan chiqish (Esc)">
        Chiqish
      </Button>
    </header>
  );
}
