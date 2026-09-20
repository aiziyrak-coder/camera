import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Cpu,
  FlaskConical,
  Gauge,
  Inbox,
  RotateCcw,
  Settings2,
  ShieldOff,
  Video,
} from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  SkeletonCard,
  StatTile,
  cn,
  formatNumber,
  useToast,
  useUrlTab,
  type DataTableColumn,
  type TabItem,
} from '../../ui';
import AiModuleModal from '../../components/admin/AiModuleModal';
import ModuleCamerasModal from '../../components/admin/ModuleCamerasModal';
import { Notice, Switch } from '../../components/settings/kit';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { AI_MODULE_GROUP_LABELS } from '../../lib/aiModuleGroups';
import type { AIModule, AIModuleGroup, ModuleSuppression } from '../../types';

const GROUPS = Object.keys(AI_MODULE_GROUP_LABELS) as AIModuleGroup[];
// Hodisa bermaydigan (davomat yozadigan) mezonlar — rejimi o'zgartirilmaydi.
const ATTENDANCE_CODES = new Set([6, 7, 8, 9]);
const PROMOTION_MIN_REVIEWS = 30;

/** Tab uchun qisqa nom — to'liq nom bo'lim sarlavhasida. */
const GROUP_SHORT: Record<AIModuleGroup, string> = {
  A: 'Xavfsizlik',
  B: 'Davomat',
  C: "Tashqi ko'rinish",
  D: 'Xulq-atvor',
  E: 'Dars sifati',
  F: 'Favqulodda',
};

type TabId = AIModuleGroup | 'toxtatilgan';

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

interface ModeChange {
  module: AIModule;
  mode: AIModule['mode'];
}

export default function AIModulesPage() {
  const { role, token } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const canConfigure = can('configureAi', role);
  const canManageCameras = can('manageCameras', role);

  const [modules, setModules] = useState<AIModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suppressions, setSuppressions] = useState<ModuleSuppression[] | null>(null);
  const [suppressionsError, setSuppressionsError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AIModule | null>(null);
  const [assigningCameras, setAssigningCameras] = useState<AIModule | null>(null);
  const [modeChange, setModeChange] = useState<ModeChange | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadModules = useCallback(() => {
    // Token yo'q bo'lsa ham yuklanish holatidan chiqamiz — aks holda sahifa
    // abadiy skelet ko'rsatib turardi (loading hech qachon false bo'lmasdi).
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<AIModule[]>('/api/ai-modules', token)
      .then((res) => {
        setModules(res);
        setError(null);
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [token]);

  const loadSuppressions = useCallback(() => {
    // Token yo'q — jadval abadiy "yuklanmoqda" bo'lib qolmasin.
    if (!token) {
      setSuppressions([]);
      return;
    }
    setSuppressions(null);
    setSuppressionsError(null);
    api
      .get<ModuleSuppression[]>('/api/ai-modules/suppressions', token)
      .then(setSuppressions)
      .catch((err: unknown) => {
        setSuppressionsError(errorText(err));
        setSuppressions([]);
      });
  }, [token]);

  useEffect(loadModules, [loadModules]);
  useEffect(loadSuppressions, [loadSuppressions]);

  const activeCount = modules.filter((m) => m.active).length;
  const trialCount = modules.filter((m) => m.active && m.mode === 'sinov').length;
  const trialPendingTotal = modules.reduce((sum, m) => sum + (m.mode === 'sinov' ? (m.trialUnreviewed ?? 0) : 0), 0);
  const needsTuning = modules.filter((m) => m.maturity === 'sozlash_kerak').length;

  const byGroup = useMemo(() => {
    const map = new Map<AIModuleGroup, AIModule[]>();
    for (const g of GROUPS) map.set(g, []);
    for (const m of modules) map.get(m.group)?.push(m);
    return map;
  }, [modules]);

  const tabs = useMemo<TabItem<TabId>[]>(
    () => [
      ...GROUPS.map((g) => ({ id: g, label: `${g} · ${GROUP_SHORT[g]}`, count: modules.length ? (byGroup.get(g)?.length ?? 0) : null })),
      { id: 'toxtatilgan', label: "To'xtatilganlar", icon: ShieldOff, count: suppressions?.length || null },
    ],
    [byGroup, modules.length, suppressions],
  );
  const [tab] = useUrlTab(tabs);

  function handleSave(saved: AIModule) {
    setModules((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    setEditing(null);
  }

  async function toggleActive(module: AIModule, active: boolean) {
    if (!token) return;
    setToggling(module.id);
    try {
      const saved = await api.patch<AIModule>(
        `/api/ai-modules/${module.id}`,
        { threshold: module.threshold, sensitivity: module.sensitivity, active },
        token,
      );
      handleSave(saved);
      toast.success(active ? `${module.name} — yoqildi` : `${module.name} — o'chirildi`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setToggling(null);
    }
  }

  async function applyModeChange() {
    if (!modeChange || !token) return;
    const { module, mode } = modeChange;
    // Xatoni USHLAMAYMIZ: ConfirmDialog uni o'z ichida ko'rsatadi va dialog
    // ochiq qoladi. Ilgari xato toast'ga chiqib, dialog baribir yopilardi —
    // server sababini (masalan "kamida 30 ta baholangan signal kerak")
    // foydalanuvchi ko'rmay qolardi.
    const saved = await api.patch<AIModule>(
      `/api/ai-modules/${module.id}`,
      { threshold: module.threshold, sensitivity: module.sensitivity, active: module.active, mode },
      token,
    );
    handleSave(saved);
    setModeChange(null);
    toast.success(mode === 'ishchi' ? `${module.name} — ishchi rejimga o'tkazildi` : `${module.name} — sinov rejimiga o'tkazildi`);
    // Rejim o'zgarishi serverda boshqa sonlarni ham qayta hisoblaydi (sinovga
    // o'tkazilganda ko'rilmagan signallar namunalarga ko'chiriladi) — bitta
    // modul javobi bu sonlarni yangilamaydi, shuning uchun ro'yxat qayta yuklanadi.
    loadModules();
  }

  async function restore(item: ModuleSuppression) {
    if (!token) return;
    setRestoring(item.id);
    try {
      await api.post(`/api/ai-modules/suppressions/${item.id}/restore`, {}, token);
      toast.success(`${item.cameraName}: «${item.moduleName}» qayta yoqildi`);
      setSuppressions((prev) => (prev ?? []).filter((s) => s.id !== item.id));
      loadModules();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRestoring(null);
    }
  }

  const firstLoad = loading && modules.length === 0;

  const suppressionColumns: DataTableColumn<ModuleSuppression>[] = [
    {
      key: 'camera',
      header: 'Kamera',
      sortValue: (s) => s.cameraName,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{s.cameraName}</p>
          <p className="truncate text-xs text-muted">{s.building}</p>
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Modul',
      sortValue: (s) => s.moduleCode,
      cell: (s) => (
        <span className="text-fg">
          <span className="font-mono text-xs text-muted">№{s.moduleCode}</span> {s.moduleName}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Sabab',
      hideOnMobile: true,
      cell: (s) => <p className="max-w-sm whitespace-normal text-[13px] text-muted">{s.reason}</p>,
    },
    {
      key: 'reviews',
      header: 'Baholash',
      hideOnMobile: true,
      sortValue: (s) => s.precision ?? -1,
      cell: (s) => (
        <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">
          <span className="text-success">{formatNumber(s.confirmed)} tasdiq</span> ·{' '}
          <span className="text-danger">{formatNumber(s.rejected)} rad</span>
          {s.precision != null && <span className="ml-1 text-fg">({s.precision}%)</span>}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Qachon',
      sortValue: (s) => s.createdAt,
      cell: (s) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{s.createdAt}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      mobileLabel: 'Amal',
      cell: (s) =>
        canConfigure ? (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <Button size="sm" icon={RotateCcw} loading={restoring === s.id} onClick={() => restore(s)}>
              Qayta yoqish
            </Button>
          </div>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
  ];

  return (
    <Page
      title="AI modullari"
      subtitle={
        modules.length
          ? `Texnik topshiriq 3-bo'lim — ${modules.length} ta AI kriteriya (A–F toifalar). Modulni yoqing, sozlang va kameralarga biriktiring.`
          : "Texnik topshiriq 3-bo'lim — AI kriteriyalar (A–F toifalar)."
      }
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'AI modullari' }]}
      titleAddon={
        modules.length > 0 && (
          <>
            <Badge tone="primary" dot>{`${activeCount} / ${modules.length} faol`}</Badge>
            {trialCount > 0 && <Badge tone="warning" dot>{`${trialCount} tasi sinovda`}</Badge>}
          </>
        )
      }
      tabs={tabs}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Faol modullar"
          value={formatNumber(activeCount)}
          unit={`/ ${formatNumber(modules.length)}`}
          icon={Cpu}
          tone="primary"
          progress={modules.length ? (activeCount / modules.length) * 100 : null}
          loading={firstLoad}
        />
        <StatTile
          label="Sinov rejimida"
          value={formatNumber(trialCount)}
          hint="Signallar faqat namuna sifatida baholanadi"
          icon={FlaskConical}
          tone="warning"
          loading={firstLoad}
        />
        <StatTile
          label="Baholanmagan namunalar"
          value={formatNumber(trialPendingTotal)}
          hint={trialPendingTotal > 0 ? 'Hodisalar sahifasida baholang' : 'Hammasi baholangan'}
          icon={Gauge}
          tone={trialPendingTotal > 0 ? 'info' : 'success'}
          to={trialPendingTotal > 0 ? '/hodisalar?korinish=sinov' : undefined}
          loading={firstLoad}
        />
        {/* Xato bo'lganda "0" ko'rsatish yolg'on bo'lardi ("to'xtatilgan juftlik
            yo'q" deb tushuniladi) — ro'yxat yuklanmagani aytiladi. */}
        <StatTile
          label="To'xtatilgan juftliklar"
          value={suppressionsError || !suppressions ? '—' : formatNumber(suppressions.length)}
          hint={
            suppressionsError
              ? "Ro'yxatni yuklab bo'lmadi"
              : needsTuning > 0
                ? `${needsTuning} ta modulni sozlash kerak`
                : 'Kamera × modul'
          }
          icon={ShieldOff}
          tone={suppressionsError ? 'neutral' : suppressions?.length ? 'danger' : 'neutral'}
          loading={suppressions === null && !suppressionsError}
        />
      </div>

      {tab === 'toxtatilgan' ? (
        <div className="flex flex-col gap-3">
          <Notice tone="info">
            Operatorlar bir kameradagi modul signallarining ko&apos;pini rad etsa, modul o&apos;sha kamerada avtomatik
            to&apos;xtatiladi. Kamera burchagi yoki yorug&apos;ligi to&apos;g&apos;rilangach, qayta yoqing.
          </Notice>
          <DataTable
            columns={suppressionColumns}
            rows={suppressions ?? []}
            rowKey={(s) => s.id}
            loading={suppressions === null}
            loadingRows={3}
            error={suppressionsError}
            onRetry={loadSuppressions}
            emptyTitle="To'xtatilgan juftlik yo'q"
            emptyDescription="Hozircha hech bir kamerada modul avtomatik to'xtatilmagan."
            defaultSort={{ key: 'createdAt', dir: 'desc' }}
            ariaLabel="Avtomatik to'xtatilgan kamera va modullar"
          />
        </div>
      ) : (
        <section aria-labelledby="ai-group-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ai-group-title" className="text-base font-semibold text-fg">
              {tab}. {AI_MODULE_GROUP_LABELS[tab]}
            </h2>
            {!firstLoad && (byGroup.get(tab)?.length ?? 0) > 0 && (
              <span className="text-[13px] tabular-nums text-muted">
                {(byGroup.get(tab) ?? []).filter((m) => m.active).length} / {byGroup.get(tab)?.length} faol
              </span>
            )}
          </div>

          {error && modules.length > 0 && <ErrorState message={error} onRetry={loadModules} />}

          {firstLoad ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} lines={4} />
              ))}
            </div>
          ) : error && modules.length === 0 ? (
            <Card padding="none">
              <ErrorState variant="block" message={error} onRetry={loadModules} />
            </Card>
          ) : (byGroup.get(tab) ?? []).length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Bu toifada modul yo'q"
              description="Boshqa toifani tanlang yoki modullar ro'yxatini qayta yuklang."
              action={
                <Button icon={RotateCcw} onClick={loadModules}>
                  Qayta yuklash
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {(byGroup.get(tab) ?? []).map((m) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  canConfigure={canConfigure}
                  canManageCameras={canManageCameras}
                  toggling={toggling === m.id}
                  onToggle={(value) => toggleActive(m, value)}
                  onEdit={() => setEditing(m)}
                  onCameras={() => setAssigningCameras(m)}
                  onModeChange={(mode) => setModeChange({ module: m, mode })}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Sozlash modali jimgina yopilardi — boshqa amallar (yoqish/rejim) kabi
          bu yerda ham saqlangani tasdiqlanadi. */}
      <AiModuleModal
        open={!!editing}
        onClose={() => setEditing(null)}
        module={editing}
        onSave={(saved) => {
          handleSave(saved);
          toast.success(`${saved.name} — sozlamalar saqlandi`);
        }}
      />
      <ModuleCamerasModal
        open={!!assigningCameras}
        module={assigningCameras}
        onClose={() => setAssigningCameras(null)}
        onSaved={() => {
          toast.success('Kameralar biriktirilishi saqlandi');
          loadModules();
        }}
      />
      <ConfirmDialog
        open={!!modeChange}
        tone="primary"
        title={modeChange?.mode === 'ishchi' ? "Ishchi rejimga o'tkazish" : "Sinov rejimiga o'tkazish"}
        message={
          modeChange
            ? modeChange.mode === 'ishchi'
              ? `«${modeChange.module.name}» signallari operator navbatiga, ogohlantirishlarga va hisobotlarga tusha boshlaydi. Davom etasizmi?`
              : `«${modeChange.module.name}» signallari operator navbatidan chiqariladi va faqat namuna sifatida baholanadi. Davom etasizmi?`
            : ''
        }
        confirmLabel={modeChange?.mode === 'ishchi' ? "Ishchi rejimga o'tkazish" : "Sinovga o'tkazish"}
        onCancel={() => setModeChange(null)}
        onConfirm={applyModeChange}
      />
    </Page>
  );
}

function ModuleCard({
  module: m,
  canConfigure,
  canManageCameras,
  toggling,
  onToggle,
  onEdit,
  onCameras,
  onModeChange,
}: {
  module: AIModule;
  canConfigure: boolean;
  canManageCameras: boolean;
  toggling: boolean;
  onToggle: (active: boolean) => void;
  onEdit: () => void;
  onCameras: () => void;
  onModeChange: (mode: AIModule['mode']) => void;
}) {
  const reviewed = m.reviewedEvents ?? 0;
  const trialPending = m.trialUnreviewed ?? 0;
  const isAttendance = ATTENDANCE_CODES.has(m.code);
  const modeEditable = canConfigure && m.hasDetector && !isAttendance;
  const showCameras = canManageCameras && m.hasDetector;

  return (
    <Card as="article" padding="none" className={cn('flex min-w-0 flex-col', !m.active && 'bg-surface-2/40')}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 min-w-[2.25rem] shrink-0 items-center justify-center rounded-control bg-surface-2 px-1.5 font-mono text-xs font-semibold text-muted">
            {m.code ? `№${m.code}` : '—'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-6 text-fg">{m.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={m.active ? 'success' : 'neutral'} dot>
                {m.active ? 'Faol' : 'Nofaol'}
              </Badge>
              {!isAttendance && (
                <Badge tone={m.mode === 'sinov' ? 'warning' : 'primary'} title={m.maturityNote}>
                  {m.mode === 'sinov' ? 'Sinov rejimi' : 'Ishchi rejim'}
                </Badge>
              )}
              {isAttendance && <Badge tone="info">Davomat</Badge>}
              {m.maturity === 'sozlash_kerak' && (
                <Badge tone="danger" title={m.maturityNote}>
                  Sozlash kerak
                </Badge>
              )}
              {!m.hasDetector && <Badge tone="neutral">Aniqlash yo&apos;q</Badge>}
            </div>
          </div>
          {canConfigure && (
            <Switch
              checked={m.active}
              onChange={onToggle}
              disabled={!m.hasDetector || toggling}
              label={
                m.hasDetector
                  ? `${m.name} — ${m.active ? "o'chirish" : 'yoqish'}`
                  : "Aniqlash logikasi yo'q — faollashtirib bo'lmaydi"
              }
              className="mt-1"
            />
          )}
        </div>

        <div className="min-w-0">
          <p className="line-clamp-4 text-[13px] leading-5 text-muted" title={m.description}>
            {m.description}
          </p>
          {m.method && (
            <p className="mt-1 line-clamp-2 text-xs text-subtle" title={m.method}>
              {m.method}
            </p>
          )}
        </div>

        <dl className="mt-auto grid grid-cols-3 divide-x divide-border rounded-control border border-border bg-surface-2/60 text-center">
          <div className="px-2 py-2" title={m.maturityNote}>
            <dt className="text-[11px] font-medium text-muted">Aniqlik</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
              {m.measuredPrecision != null ? `${m.measuredPrecision}%` : <span className="text-xs font-medium text-muted">O&apos;lchanmagan</span>}
            </dd>
          </div>
          {/* Sinovda ko'rsatkich "baholangan / ishchi rejim uchun kerak" bo'ladi —
              izoh ham shunga mos kelishi kerak edi (ilgari ikkala holatda ham
              "tasdiqlangan / baholangan" deyilardi, bu esa noto'g'ri). */}
          <div
            className="px-2 py-2"
            title={
              m.mode === 'sinov'
                ? `Baholangan sinov signallari — ishchi rejim uchun kamida ${PROMOTION_MIN_REVIEWS} ta kerak (oxirgi 90 kun)`
                : 'Operator baholagan signallar (tasdiqlangan + rad etilgan), oxirgi 90 kun'
            }
          >
            <dt className="text-[11px] font-medium text-muted">Baholangan</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
              {m.mode === 'sinov' ? `${formatNumber(reviewed)} / ${PROMOTION_MIN_REVIEWS}` : formatNumber(reviewed)}
            </dd>
          </div>
          <div className="px-2 py-2" title="Faol kameralarda bu modul yoqilgan">
            <dt className="text-[11px] font-medium text-muted">Kameralar</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-fg">{m.hasDetector ? formatNumber(m.cameraCount) : '—'}</dd>
          </div>
        </dl>

        {m.mode === 'sinov' && trialPending > 0 && (
          <ButtonLink
            to={`/hodisalar?korinish=sinov&modul=${m.code}`}
            variant="soft"
            size="sm"
            icon={FlaskConical}
            className="self-start"
          >
            {trialPending} ta namunani baholash
          </ButtonLink>
        )}
      </div>

      {(showCameras || canConfigure) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          {canConfigure && (
            <Button size="sm" icon={Settings2} onClick={onEdit}>
              Sozlash
            </Button>
          )}
          {showCameras && (
            <Button size="sm" icon={Video} onClick={onCameras}>
              Kameralar
            </Button>
          )}
          {modeEditable && m.mode === 'sinov' && (
            // Nofaol tugma sichqonchani sezmaydi — izoh o'ramdagi span'da.
            <span
              className="ml-auto"
              title={
                m.promotionReady
                  ? 'Signallar operator navbatiga tusha boshlaydi'
                  : `Kamida ${PROMOTION_MIN_REVIEWS} ta baholangan signal va 80% aniqlik kerak`
              }
            >
              <Button size="sm" variant="ghost" icon={ArrowUpCircle} onClick={() => onModeChange('ishchi')} disabled={!m.promotionReady}>
                Ishchi rejimga
              </Button>
            </span>
          )}
          {modeEditable && m.mode === 'ishchi' && (
            <Button size="sm" variant="ghost" icon={FlaskConical} className="ml-auto" onClick={() => onModeChange('sinov')}>
              Sinovga o&apos;tkazish
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
