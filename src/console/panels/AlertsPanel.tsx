import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, buildQuery, isAbortError, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { isBackendConfigured } from '../../lib/config';
import { usePermissions } from '../../lib/permissions';
import { SEVERITY_LABEL, SEVERITY_STRIPE } from '../../lib/eventLabels';
import { lazyPage } from '../../lib/lazyPage';
import { eventQueryParams } from '../../components/events/eventQuery';
import type { Overview } from '../../lib/situationApi';
import type { AIEvent } from '../../types';
import { cn } from '../../ui';
import Panel, { BigNumber } from '../Panel';
import { rowIn } from '../motion';
import { topAlerts } from './alerts';
import EmbeddedPage from './EmbeddedPage';

/**
 * HODISALAR paneli.
 *
 * Yig'ilgan holatda — hukm: nechta ochiq, nechtasining muddati o'tgan va
 * eng muhim uchtasi. Yoyilganda — hodisalar sahifasining O'ZI (navbat,
 * filtrlar, ko'rib chiqish amallari): konsol uchun ikkinchi nusxa
 * yozilmaydi, shuning uchun u yerdagi xulq — tayinlash, ommaviy qaror,
 * jonli yangilanish — shundayligicha ishlaydi.
 */

const EventsPage = lazyPage(() => import('../../pages/admin/EventsPage'));

/** Yig'ilgan paneldagi qatorlar soni — ekran o'lchamiga sig'adigani. */
const PREVIEW_LIMIT = 3;
/** Serverdan olinadigan namuna: uchtasini tanlash uchun yetarli, ortiqchasi emas. */
const SAMPLE_SIZE = 20;

export default function AlertsPanel({
  overview,
  failed,
  pulse,
  live,
  expanded,
  onExpand,
  area,
}: {
  overview: Overview | null;
  /** Konsolning umumiy so'rovi xato berdimi — "yuklanmoqda" cheksiz turmasin. */
  failed?: boolean;
  /** Jonli xabar kelganda oshadi — ro'yxat shunda yangilanadi. */
  pulse: number;
  live: boolean;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}) {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const allowed = can('reviewEvents', role);

  const [items, setItems] = useState<AIEvent[] | null>(null);
  const [listFailed, setListFailed] = useState(false);

  useEffect(() => {
    if (!allowed || !isBackendConfigured) return;
    const controller = new AbortController();
    const query = buildQuery({
      ...eventQueryParams({ queue: true, severity: '', statusFilter: '', quick: '', moduleCode: '', building: '', from: '', to: '', search: '' }),
      sort: 'severity',
      page: 1,
      pageSize: SAMPLE_SIZE,
    });
    api
      .get<ApiPage<AIEvent>>(`/api/events${query}`, token, { signal: controller.signal })
      .then((res) => {
        setItems(res.items);
        setListFailed(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setListFailed(true);
      });
    return () => controller.abort();
  }, [allowed, token, pulse]);

  const open = overview?.events.open ?? null;
  const overdue = overview?.events.overdue ?? null;
  const rows = items ? topAlerts(items, PREVIEW_LIMIT) : [];

  return (
    <Panel
      id="alerts"
      title="Hodisalar"
      live={live}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={
        overdue !== null && overdue > 0 ? (
          <span className="flex items-center gap-1.5 text-danger">
            {/* Puls faqat HAQIQATAN muddati o'tgan hodisa bo'lsa. */}
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            <span className="intel-code text-[11px] font-semibold">{overdue}</span>
          </span>
        ) : null
      }
      full={allowed ? <EmbeddedPage path="/hodisalar" component={EventsPage} /> : undefined}
    >
      {!allowed ? (
        <p className="px-3 py-6 text-center text-[12px] text-subtle">Huquq yo‘q</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <BigNumber
            value={open === null ? '—' : open}
            sub={
              open === null
                ? !isBackendConfigured
                  ? 'server ulanmagan'
                  : failed
                    ? 'ma’lumot olinmadi'
                    : 'yuklanmoqda…'
                : overdue && overdue > 0
                  ? `ochiq · ${overdue} ta muddati o‘tgan`
                  : 'ochiq hodisa'
            }
            tone={overdue && overdue > 0 ? 'text-danger' : undefined}
          />
          <ul className="min-h-0 flex-1 overflow-hidden px-3">
            <AnimatePresence initial={false}>
              {rows.map((event) => (
                <motion.li
                  key={event.id}
                  variants={rowIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex items-center gap-2 border-t border-white/60 py-1.5"
                >
                  <span aria-hidden="true" className={cn('h-4 w-[3px] shrink-0 rounded-[1px]', SEVERITY_STRIPE[event.severity])} />
                  <span className="min-w-0 flex-1 truncate text-[12px]">{event.moduleName}</span>
                  <span className="intel-micro shrink-0">{SEVERITY_LABEL[event.severity]}</span>
                  <span className="intel-code shrink-0 text-[11px] text-muted">{event.timestamp.slice(11, 16)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
            {rows.length === 0 && (
              <li className="pt-4 text-center text-[12px] text-subtle">
                {!isBackendConfigured ? 'Server ulanmagan' : listFailed || failed ? 'Ma’lumot olinmadi' : items ? 'Navbat bo‘sh' : 'Yuklanmoqda…'}
              </li>
            )}
          </ul>
        </div>
      )}
    </Panel>
  );
}
