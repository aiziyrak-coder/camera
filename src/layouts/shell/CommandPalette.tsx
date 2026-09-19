import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Building2, Cctv, Clock, CornerDownLeft, GraduationCap, Loader2, Search, SearchX, UserRound, Users, type LucideIcon } from 'lucide-react';
import { api, buildQuery, isAbortError, type Page as ApiPage } from '../../lib/apiClient';
import type { PermissionKey } from '../../lib/permissions';
import { getGroups, getKafedras, situationPaths, UNIT_KIND_LABELS, type KafedraStat } from '../../lib/situationApi';
import { highlight, loadRecent, matchText, pushRecent, rankItems, type MatchRange, type RecentItem } from '../../lib/search';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { StudentStaffRecord } from '../../types';
import { cn } from '../../ui';
import { useDialog } from '../../ui/internal/useDialog';
import type { NavSection } from './navConfig';

type Kind = 'page' | 'group' | 'unit' | 'person' | 'camera' | 'recent';

interface ResultItem {
  key: string;
  kind: Kind;
  /** Saqlash uchun (so'nggi tanlovlar). */
  recentKind: Exclude<Kind, 'recent'>;
  id: string;
  title: string;
  subtitle?: string;
  to: string;
  icon: LucideIcon;
  ranges: MatchRange[];
}

interface ResultGroup {
  kind: Kind;
  label: string;
  items: ResultItem[];
  loading?: boolean;
}

const KIND_ICON: Record<Exclude<Kind, 'recent'>, LucideIcon> = {
  page: Search,
  group: GraduationCap,
  unit: Building2,
  person: UserRound,
  camera: Cctv,
};

const GROUP_LABEL: Record<Kind, string> = {
  recent: "So'nggi",
  page: 'Sahifalar',
  group: 'Guruhlar',
  unit: "Bo'linmalar",
  person: 'Shaxslar',
  camera: 'Kameralar',
};

interface PublicCamera {
  id: string;
  name: string;
  building: string;
  zone: string;
  status: string;
}

/** Qidiruv kaliti bo'yicha tarmoqdan olingan natija (bekor qilish bilan). */
function useRemote<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; data: T | null; loading: boolean }>({ key: null, data: null, loading: false });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    if (!key) {
      setState({ key: null, data: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ key, data: prev.key === key ? prev.data : null, loading: true }));
    fetcherRef
      .current(controller.signal)
      .then((data) => !controller.signal.aborted && setState({ key, data, loading: false }))
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setState({ key, data: null, loading: false });
      });
    return () => controller.abort();
  }, [key]);
  return { data: state.key === key ? state.data : null, loading: state.loading };
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Menyu bo'limlari (huquq bo'yicha filtrlangan). */
  sections: NavSection[];
  can: (key: PermissionKey) => boolean;
}

/** Global qidiruv (Ctrl/⌘+K): sahifalar, guruhlar, bo'linmalar, shaxslar,
 *  kameralar va so'nggi tanlovlar — klaviatura bilan boshqariladi. */
export function CommandPalette({ open, onClose, sections, can }: CommandPaletteProps) {
  if (!open) return null;
  return createPortal(<PaletteDialog onClose={onClose} sections={sections} can={can} />, document.body);
}

function PaletteDialog({ onClose, sections, can }: Omit<CommandPaletteProps, 'open'>) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useDialog(true, onClose, panelRef, inputRef);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent());
  const debounced = useDebouncedValue(query.trim(), 200);
  const remoteQ = debounced.length >= 2 ? debounced : '';

  const canDavomat = can('manageAttendance');
  const canPeople = can('registerPeople');
  const canCameras = can('viewLive') || can('editCameraLocation');

  const groupsRes = useRemote(canDavomat && remoteQ ? `g:${remoteQ}` : null, (signal) => getGroups({ search: remoteQ }, { signal }));
  // Bo'linmalar kam — bir marta olinib, mijozda filtrlanadi.
  const unitsRes = useRemote<KafedraStat[]>(canDavomat ? 'units' : null, (signal) => getKafedras(undefined, { signal }));
  const peopleRes = useRemote(canPeople && remoteQ ? `p:${remoteQ}` : null, (signal) =>
    api.post<ApiPage<StudentStaffRecord>>('/api/students-staff/search', { search: remoteQ, pageSize: 6 }, undefined, { signal }),
  );
  const camerasRes = useRemote(canCameras && remoteQ ? `c:${remoteQ}` : null, (signal) =>
    api.get<ApiPage<PublicCamera>>(`/api/public/cameras${buildQuery({ search: remoteQ, pageSize: 5 })}`, undefined, { signal }),
  );

  const pages = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.map((item) => ({ id: item.to, title: item.label, keywords: [section.label], section: section.label, icon: item.icon, to: item.to })),
      ),
    [sections],
  );

  const groups: ResultGroup[] = useMemo(() => {
    const q = query.trim();
    const out: ResultGroup[] = [];
    const mk = (kind: Exclude<Kind, 'recent'>, id: string, title: string, to: string, subtitle?: string, icon?: LucideIcon): ResultItem => ({
      key: `${kind}:${id}`,
      kind,
      recentKind: kind,
      id,
      title,
      subtitle,
      to,
      icon: icon ?? KIND_ICON[kind],
      ranges: q ? (matchText(q, title)?.ranges ?? []) : [],
    });

    if (!q) {
      if (recent.length) {
        out.push({
          kind: 'recent',
          label: GROUP_LABEL.recent,
          items: recent.map((r) => ({
            key: `recent:${r.kind}:${r.id}`,
            kind: 'recent' as const,
            recentKind: (r.kind in KIND_ICON ? r.kind : 'page') as Exclude<Kind, 'recent'>,
            id: r.id,
            title: r.title,
            subtitle: r.subtitle,
            to: r.to,
            icon: Clock,
            ranges: [],
          })),
        });
      }
      out.push({ kind: 'page', label: GROUP_LABEL.page, items: pages.map((p) => mk('page', p.id, p.title, p.to, p.section, p.icon)) });
      return out;
    }

    const pageHits = rankItems(q, pages, 6);
    if (pageHits.length) out.push({ kind: 'page', label: GROUP_LABEL.page, items: pageHits.map(({ item: p }) => mk('page', p.id, p.title, p.to, p.section, p.icon)) });

    if (canDavomat) {
      const units = rankItems(
        q,
        (unitsRes.data ?? []).map((u) => ({ ...u, title: u.name })),
        5,
      );
      if (units.length)
        out.push({
          kind: 'unit',
          label: GROUP_LABEL.unit,
          items: units.map(({ item: u }) => mk('unit', u.id, u.name, situationPaths.kafedra(u.id), `${UNIT_KIND_LABELS[u.kind] ?? "Bo'linma"} · ${u.staffTotal} xodim`, Building2)),
        });
    }

    if (canDavomat && q.length >= 2) {
      const list = groupsRes.data ?? [];
      const ranked = rankItems(q, list.map((g) => ({ ...g, id: g.name, title: g.name })), 6);
      out.push({
        kind: 'group',
        label: GROUP_LABEL.group,
        loading: groupsRes.loading && !groupsRes.data,
        items: ranked.map(({ item: g }) =>
          mk('group', g.name, g.name, situationPaths.group(g.name), [g.course ? `${g.course}-kurs` : null, g.faculty].filter(Boolean).join(' · ') || undefined),
        ),
      });
    }

    if (canPeople && q.length >= 2) {
      const people = peopleRes.data?.items ?? [];
      out.push({
        kind: 'person',
        label: GROUP_LABEL.person,
        loading: peopleRes.loading && !peopleRes.data,
        items: people.map((p) =>
          mk(
            'person',
            p.id,
            p.fullName,
            canDavomat ? situationPaths.person(p.id) : `/reestr?search=${encodeURIComponent(p.fullName)}`,
            [p.type === 'talaba' ? 'Talaba' : 'Xodim', p.groupOrPosition].filter(Boolean).join(' · '),
            p.type === 'talaba' ? GraduationCap : Users,
          ),
        ),
      });
    }

    if (canCameras && q.length >= 2) {
      const cams = camerasRes.data?.items ?? [];
      const to = can('editCameraLocation') ? '/sozlamalar/kameralar' : '/videodevor';
      out.push({
        kind: 'camera',
        label: GROUP_LABEL.camera,
        loading: camerasRes.loading && !camerasRes.data,
        items: cams.map((c) => mk('camera', c.id, c.name, to, [c.building, c.zone].filter(Boolean).join(' · '))),
      });
    }

    return out.filter((g) => g.items.length > 0 || g.loading);
  }, [query, recent, pages, canDavomat, canPeople, canCameras, can, unitsRes.data, groupsRes, peopleRes, camerasRes]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const anyLoading = groups.some((g) => g.loading) || (query.trim().length >= 2 && query.trim() !== debounced);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1));
  }, [flat.length, active]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = useCallback(
    (item: ResultItem) => {
      setRecent(pushRecent({ kind: item.recentKind, id: item.id, title: item.title, subtitle: item.subtitle, to: item.to }));
      onClose();
      navigate(item.to);
    },
    [navigate, onClose],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (event.key === 'Enter') {
      const item = flat[active];
      if (item) {
        event.preventDefault();
        choose(item);
      }
    }
  }

  let index = -1;
  const activeId = flat[active] ? `${listId}-${active}` : undefined;
  const q = query.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[10vh] sm:px-4 sm:pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global qidiruv"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex max-h-[min(34rem,78vh)] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-card border border-border bg-surface text-fg shadow-pop outline-none"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          {anyLoading ? <Loader2 size={18} className="shrink-0 animate-spin text-muted" aria-hidden="true" /> : <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sahifa, guruh, bo'linma, shaxs yoki kamera…"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted sm:inline">Esc</kbd>
        </div>

        <div ref={listRef} id={listId} role="listbox" aria-label="Natijalar" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {groups.length === 0 && !anyLoading && (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
                <SearchX size={18} aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-fg">“{q}” bo'yicha hech narsa topilmadi</p>
              <p className="mt-1 text-[13px] text-muted">{q.length < 2 ? "Kamida 2 ta harf yozing." : "Boshqacha yozib ko'ring — masalan, guruh raqami yoki familiya."}</p>
            </div>
          )}
          {groups.map((group) => (
            <div key={group.kind} role="group" aria-label={group.label} className="mb-1 last:mb-0">
              <p className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                {group.label}
                {group.loading && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
              </p>
              {group.loading && group.items.length === 0 && (
                <div className="space-y-1 px-2.5 py-1" aria-hidden="true">
                  <div className="skeleton-shimmer h-8 rounded-control bg-surface-2" />
                  <div className="skeleton-shimmer h-8 w-4/5 rounded-control bg-surface-2" />
                </div>
              )}
              {group.items.map((item) => {
                index += 1;
                const i = index;
                const selected = i === active;
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 text-sm transition-colors',
                      selected ? 'bg-primary-soft text-fg' : 'text-fg',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
                        selected ? 'border-primary/30 bg-surface text-primary' : 'border-border bg-surface-2 text-muted',
                      )}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <Highlighted text={item.title} ranges={item.ranges} />
                      </span>
                      {item.subtitle && <span className="block truncate text-xs text-muted">{item.subtitle}</span>}
                    </span>
                    {selected && <CornerDownLeft size={14} className="shrink-0 text-muted" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-border bg-surface-2/60 px-4 py-2 text-[11px] text-muted sm:flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> tanlash
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd> ochish
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> yopish
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface px-1 py-px font-sans text-[10.5px] font-medium text-muted">{children}</kbd>;
}

function Highlighted({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  return (
    <>
      {highlight(text, ranges).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-[3px] bg-primary/15 px-px text-primary">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
