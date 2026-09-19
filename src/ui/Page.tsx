import { useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { branding } from '../lib/branding';
import { cn, focusRing } from './cn';
import { ShellContext, type Crumb } from './pageContext';
import { Tabs } from './Tabs';
import { useUrlTab, type TabItem } from './urlTab';

export interface PageProps<T extends string = string> {
  title: string;
  subtitle?: ReactNode;
  /** Yuqori paneldagi non-yo'l. Oxirgi element — joriy sahifa (odatda title). */
  breadcrumbs?: Crumb[];
  /** Sarlavha yonidagi belgi/yorliq (masalan holat badge). */
  titleAddon?: ReactNode;
  /** Sahifa harakatlari — DOIM o'ng yuqorida. */
  actions?: ReactNode;
  /** Sarlavha ostidagi tablar; tanlov URL'da `?tab=` (useUrlTab bilan o'qing). */
  tabs?: readonly TabItem<T>[];
  defaultTab?: T;
  tabParam?: string;
  /** Tablar/sarlavha ostidagi filtrlar (Toolbar). */
  toolbar?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Barcha sahifalar uchun yagona shablon: sarlavha + izoh chapda,
 *  harakatlar o'ngda, ostida tablar, keyin filtrlar va kontent.
 *  Non-yo'l yuqori panelga uzatiladi (AppShell). */
export function Page<T extends string = string>({
  title,
  subtitle,
  breadcrumbs,
  titleAddon,
  actions,
  tabs,
  defaultTab,
  tabParam = 'tab',
  toolbar,
  children,
  className,
}: PageProps<T>) {
  const { setPageMeta, inShell } = useContext(ShellContext);
  const crumbsKey = JSON.stringify(breadcrumbs ?? null);
  // Kalit bo'yicha: har renderda yangi massiv berilsa ham effekt qayta ishlamaydi.
  const crumbs = useMemo(() => (JSON.parse(crumbsKey) as Crumb[] | null) ?? undefined, [crumbsKey]);

  useEffect(() => {
    setPageMeta({ title, crumbs });
    const previous = document.title;
    document.title = `${title} · ${branding.systemName}`;
    return () => {
      setPageMeta(null);
      document.title = previous;
    };
  }, [title, crumbs, setPageMeta]);

  // Telefonda yuqori paneldagi non-yo'l yashiriladi — o'rniga "orqaga" havolasi.
  const parent = breadcrumbs ? [...breadcrumbs].reverse().find((crumb, index) => index > 0 && crumb.to) : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {parent?.to && (
        <Link
          to={parent.to}
          className={cn('mb-2 inline-flex w-fit items-center gap-1 rounded-control text-[13px] font-medium text-muted hover:text-fg', inShell && 'md:hidden', focusRing)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {parent.label}
        </Link>
      )}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
            {titleAddon}
          </div>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </header>

      {tabs && tabs.length > 0 && <PageTabs tabs={tabs} defaultTab={defaultTab} param={tabParam} />}

      {toolbar && <div className="mt-4">{toolbar}</div>}

      <div className={cn('flex min-w-0 flex-col gap-5', tabs || toolbar ? 'mt-5' : 'mt-6')}>{children}</div>
    </div>
  );
}

function PageTabs<T extends string>({ tabs, defaultTab, param }: { tabs: readonly TabItem<T>[]; defaultTab?: T; param: string }) {
  const [active, setActive] = useUrlTab(tabs, { defaultTab, param });
  return <Tabs tabs={tabs} value={active} onChange={setActive} className="mt-4" />;
}
