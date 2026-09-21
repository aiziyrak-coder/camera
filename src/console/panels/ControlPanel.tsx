import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { api, isAbortError, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { isBackendConfigured } from '../../lib/config';
import { usePermissions } from '../../lib/permissions';
import { notificationsApi } from '../../lib/notificationsApi';
import { Tabs, cn } from '../../ui';
import Panel from '../Panel';
import { EASE, reducedMotion } from '../motion';
import EmbeddedPage from './EmbeddedPage';
import { CONTROL_PAGES, visibleControlTabs, type ControlTabId, type CountKey } from './controlTabs';

/**
 * BOSHQARUV paneli.
 *
 * Yig'ilganda — ishga tushirgich: nimani boshqarish mumkin va har
 * birining yonida JONLI sanoq (o'lchanmagani — chiziqcha, to'qima
 * raqam emas). Yoyilganda — o'sha bo'limlarning haqiqiy sahifalari,
 * panel ichida tab bo'lib ochiladi: marshrut o'zgarmaydi, konsol
 * yopilmaydi.
 */

export type ControlCounts = Partial<Record<Exclude<CountKey, null>, number | null>>;

export default function ControlPanel({
  /** Konsol allaqachon olgan sonlar (qayta so'ralmaydi). */
  counts,
  expanded,
  onExpand,
  activeTab,
  onTab,
  area,
}: {
  counts: ControlCounts;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  activeTab: ControlTabId | null;
  onTab: (id: ControlTabId) => void;
  area?: string;
}) {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const tabs = useMemo(() => visibleControlTabs((key) => can(key, role), role), [can, role]);

  // Konsolda yo'q ikkita sanoq — faqat huquq bo'lsa va faqat bir marta.
  const canUsers = tabs.some((tab) => tab.id === 'foydalanuvchilar');
  const canRules = tabs.some((tab) => tab.id === 'bildirishnomalar');
  const [extra, setExtra] = useState<ControlCounts>({});

  useEffect(() => {
    if (!isBackendConfigured || (!canUsers && !canRules)) return;
    const controller = new AbortController();
    if (canUsers) {
      api
        .get<ApiPage<unknown>>('/api/users?page=1&pageSize=1', token, { signal: controller.signal })
        .then((res) => setExtra((prev) => ({ ...prev, users: res.total })))
        .catch((err: unknown) => {
          if (!isAbortError(err)) setExtra((prev) => ({ ...prev, users: null }));
        });
    }
    if (canRules) {
      notificationsApi
        .rules(token)
        .then((rules) => setExtra((prev) => ({ ...prev, notifications: rules.length })))
        .catch(() => setExtra((prev) => ({ ...prev, notifications: null })));
    }
    return () => controller.abort();
  }, [canUsers, canRules, token]);

  const all = { ...counts, ...extra };
  // Harakatni kamaytirish so'ralgan bo'lsa — qatorlar darhol joyida.
  const still = reducedMotion();
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0] ?? null;

  return (
    <Panel
      id="control"
      title="Boshqaruv"
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={<span className="intel-code text-[11px] text-muted">{tabs.length}</span>}
      full={
        current ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 px-3 pt-2">
              <Tabs
                tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                value={current.id}
                onChange={onTab}
                size="sm"
                ariaLabel="Boshqaruv bo'limlari"
              />
            </div>
            {/* Har tab o'z holatini saqlamaydi — `key` bilan almashadi:
                yopilgan bo'lim so'rov yubormaydi va xotirada qolmaydi. */}
            <div className="min-h-0 flex-1">
              <EmbeddedPage key={current.id} path={current.path} component={CONTROL_PAGES[current.id]} />
            </div>
          </div>
        ) : undefined
      }
    >
      {tabs.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-subtle">{role ? 'Huquq yo‘q' : 'Tizimga kiring'}</p>
      ) : (
        <ul className="grid h-full grid-cols-1 content-start overflow-hidden px-1.5 py-1 sm:grid-cols-2">
          {tabs.map((tab, index) => {
            const count = tab.countKey ? all[tab.countKey] : undefined;
            const Icon = tab.icon;
            return (
              <motion.li
                key={tab.id}
                initial={still ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: still ? 0 : 0.3, ease: EASE, delay: still ? 0 : Math.min(index * 0.03, 0.3) }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTab(tab.id);
                    onExpand('control');
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-white/70"
                >
                  <Icon size={14} aria-hidden="true" className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{tab.label}</span>
                  <span
                    className={cn('intel-code text-[12px]', count === undefined || count === null ? 'text-subtle' : 'font-semibold text-fg')}
                    title={count === undefined || count === null ? "O'lchanmagan" : `${count} ${tab.countLabel}`}
                  >
                    {count === undefined || count === null ? '—' : count}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
