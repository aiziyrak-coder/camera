import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, FlaskConical, Inbox, RotateCcw, Settings2, ShieldOff, Video } from 'lucide-react';
import {
  Button,
  ButtonLink,
  CodeText,
  ConfirmDialog,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  EmptyState,
  ErrorState,
  IntelPanel,
  MicroLabel,
  Page,
  RAG_LABEL,
  RAG_LETTER,
  RAG_TEXT,
  SkeletonText,
  StatusLamp,
  cn,
  formatNumber,
  rag,
  useToast,
  useUrlTab,
  type DataTableColumn,
  type IntelStatus,
  type Rag,
  type RagThresholds,
  type TabItem,
} from '../../ui';
import AiModuleModal from '../../components/admin/AiModuleModal';
import ModuleCamerasModal from '../../components/admin/ModuleCamerasModal';
import { Notice, Switch } from '../../components/settings/kit';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { branding } from '../../lib/branding';
import { AI_MODULE_GROUP_LABELS } from '../../lib/aiModuleGroups';
import type { AIModule, AIModuleGroup, ModuleSuppression } from '../../types';

/**
 * AI modullar RO'YXATI (qobiliyat reyestri).
 *
 * Har modul — reyestrdagi bitta band: xizmat kodi, holat chirog'i,
 * kamera qamrovi (ulush + svetofor) va — agar modul ishlay olmasa —
 * SABABI oddiy o'zbek tilida. Rahbar ro'yxatga qarab "nima ishlayapti,
 * nima ishlamayapti va nega" degan savolga javob topadi.
 */

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

/**
 * Kamera qamrovi chegarasi. Modul HAR kamerada yoqilishi shart emas,
 * shuning uchun chegara yumshoq: hech bir kamerada yoqilmagan faol
 * modul — qizil (u umuman ishlamaydi), 10% dan past — sariq (qamrov
 * juda tor), 10% va undan yuqori — yashil.
 */
export const COVERAGE_RAG: RagThresholds = { ok: 10, warn: 0.01 };

/** Modul aniqligi uchun chegara (operator baholagan signallar ulushi). */
const PRECISION_RAG: RagThresholds = { ok: 80, warn: 60 };

/** Xizmat kodi: "M-03". Kodsiz modul — "M-??". */
export function moduleCode(code: number | null | undefined): string {
  return Number.isFinite(code as number) ? `M-${String(code).padStart(2, '0')}` : 'M-??';
}

/**
 * Reyestr hujjat raqami — tanlangan toifa va banddan kelib chiqadi,
 * vaqtga bog'liq emas:
 *
 *   aiRegisterReference('A', 7) === 'AI-A-007'
 *   aiRegisterReference('toxtatilgan', 12) === 'AI-TOXT-012'
 */
export function aiRegisterReference(tab: string, count: number): string {
  const key = tab === 'toxtatilgan' ? 'TOXT' : tab.toUpperCase().slice(0, 4);
  const num = Number.isFinite(count) ? String(Math.max(0, Math.trunc(count))).padStart(3, '0') : '000';
  return `AI-${key}-${num}`;
}

/**
 * Modul nega ishlay olmaydi — oddiy o'zbek tilida, bitta gap.
 * Ishlayotgan modul uchun `null`.
 *
 * Tartib muhim: eng chuqur to'siq birinchi aytiladi, aks holda
 * "sinovda" deb yozib, aslida kameraga biriktirilmaganini yashirardik.
 */
export function blockingReason(m: AIModule): string | null {
  if (!m.hasDetector) return "Aniqlash logikasi hali yozilmagan — modul ishga tushirilmaydi.";
  if (!m.active) return "Modul o'chirilgan — yoqilmaguncha hech qanday signal bermaydi.";
  if ((m.cameraCount ?? 0) === 0) return "Hech bir kameraga biriktirilmagan — «Kameralar» tugmasi orqali biriktiring.";
  if (m.maturity === 'sozlash_kerak') {
    return m.maturityNote || "Modulni sozlash kerak — hozirgi sozlama bilan natijaga ishonib bo'lmaydi.";
  }
  if (m.mode === 'sinov') {
    return "Sinov rejimida — signallar operator navbatiga tushmaydi, faqat namuna sifatida baholanadi.";
  }
  return null;
}

/** Holat chirog'i: bitta so'z bilan. */
function moduleLamp(m: AIModule): { status: IntelStatus; label: string } {
  if (!m.hasDetector) return { status: 'idle', label: "Aniqlash yo'q" };
  if (!m.active) return { status: 'idle', label: 'Nofaol' };
  if (m.maturity === 'sozlash_kerak') return { status: 'alert', label: 'Sozlash kerak' };
  if (m.mode === 'sinov') return { status: 'warn', label: 'Sinov rejimi' };
  return { status: 'ok', label: 'Ishchi rejim' };
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

interface ModeChange {
  module: AIModule;
  mode: AIModule['mode'];
}

/** Svetofor belgisi: harf + rang (rang yolg'iz qolmaydi). */
function Verdict({ verdict }: { verdict: Rag }) {
  return (
    <CodeText className={cn('text-[10px] font-bold', RAG_TEXT[verdict])} title={RAG_LABEL[verdict]}>
      {RAG_LETTER[verdict]}
      <span className="sr-only"> {RAG_LABEL[verdict]}</span>
    </CodeText>
  );
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
  /** Jami faol kamera — qamrov ULUSHINING maxraji. Olib bo'lmasa (huquq
   *  yo'q yoki xizmat javob bermadi) qamrov hukmsiz ko'rsatiladi: mavhum
   *  maxraj bilan svetofor yoqish — yolg'on baho bo'lardi. */
  const [totalCameras, setTotalCameras] = useState<number | null>(null);
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

  // Qamrov maxraji. Xatosi ko'rsatilmaydi — bu yordamchi ma'lumot;
  // kelmasa qamrov shunchaki hukmsiz qoladi.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .get<{ faolCameras: number }>('/api/system/camera-network', token)
      .then((res) => {
        if (alive) setTotalCameras(Number.isFinite(res.faolCameras) ? res.faolCameras : null);
      })
      .catch(() => {
        if (alive) setTotalCameras(null);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const activeCount = modules.filter((m) => m.active).length;
  const trialCount = modules.filter((m) => m.active && m.mode === 'sinov').length;
  const trialPendingTotal = modules.reduce((sum, m) => sum + (m.mode === 'sinov' ? (m.trialUnreviewed ?? 0) : 0), 0);
  const needsTuning = modules.filter((m) => m.maturity === 'sozlash_kerak').length;
  /** Ishga tushmaydigan modullar — reyestrning asosiy xulosasi. */
  const blocked = modules.filter((m) => m.active && blockingReason(m) !== null).length;

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
  const rows = byGroup.get(tab as AIModuleGroup) ?? [];
  const reference = aiRegisterReference(tab, tab === 'toxtatilgan' ? (suppressions?.length ?? 0) : rows.length);

  // Yomoni birinchi: ishga tushmaydigan modul ro'yxat boshida turadi.
  const ordered = useMemo(() => {
    const rank = (m: AIModule) => {
      const lamp = moduleLamp(m);
      if (lamp.status === 'alert') return 0;
      if (blockingReason(m) !== null && m.active) return 1;
      if (!m.active || !m.hasDetector) return 3;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b) || a.code - b.code);
  }, [rows]);

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
          <CodeText className="text-xs text-muted">{moduleCode(s.moduleCode)}</CodeText> {s.moduleName}
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
        <CodeText className="whitespace-nowrap text-[13px] text-muted">
          <span className="text-success">{formatNumber(s.confirmed)} tasdiq</span> ·{' '}
          <span className="text-danger">{formatNumber(s.rejected)} rad</span>
          {s.precision != null && <span className="ms-1 text-fg">({s.precision}%)</span>}
        </CodeText>
      ),
    },
    {
      key: 'createdAt',
      header: 'Qachon',
      sortValue: (s) => s.createdAt,
      cell: (s) => <CodeText className="whitespace-nowrap text-[13px] text-muted">{s.createdAt}</CodeText>,
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
      tabs={tabs}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <DocumentHeader
          org={branding.orgFullName}
          title="AI qobiliyatlari reyestri"
          reference={reference}
          readouts={[
            {
              label: 'Toifa',
              value: tab === 'toxtatilgan' ? "To'xtatilganlar" : `${tab} · ${GROUP_SHORT[tab as AIModuleGroup]}`,
              title: tab === 'toxtatilgan' ? undefined : AI_MODULE_GROUP_LABELS[tab as AIModuleGroup],
            },
            { label: 'Reyestrda', value: `${formatNumber(activeCount)} / ${formatNumber(modules.length)} faol` },
            { label: 'Sinovda', value: `${formatNumber(trialCount)} modul` },
            {
              label: 'Ishga tushmaydi',
              value: `${formatNumber(blocked)} modul`,
              title: "Faol, lekin to'siq sababli signal bermayotgan modullar",
            },
            {
              label: 'Kamera bazasi',
              value: totalCameras === null ? "o'lchanmagan" : `${formatNumber(totalCameras)} faol`,
              title: 'Qamrov ulushining maxraji',
            },
          ]}
        />

        {/* Qisqa hisob — sanoqlar, shuning uchun svetoforsiz. */}
        <IntelPanel title="Qisqa hisob" code="AI-000" bodyClassName="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
          <Tally label="Faol modullar" value={`${formatNumber(activeCount)} / ${formatNumber(modules.length)}`} hint="Reyestrdagi jami band" loading={firstLoad} />
          <Tally label="Sinov rejimida" value={formatNumber(trialCount)} hint="Signallar faqat namuna sifatida baholanadi" loading={firstLoad} />
          <Tally
            label="Baholanmagan namunalar"
            value={formatNumber(trialPendingTotal)}
            hint={trialPendingTotal > 0 ? 'Hodisalar sahifasida baholang' : 'Hammasi baholangan'}
            to={trialPendingTotal > 0 ? '/hodisalar?korinish=sinov' : undefined}
            loading={firstLoad}
          />
          {/* Xato bo'lganda "0" ko'rsatish yolg'on bo'lardi ("to'xtatilgan juftlik
              yo'q" deb tushuniladi) — ro'yxat yuklanmagani aytiladi. */}
          <Tally
            label="To'xtatilgan juftliklar"
            value={suppressionsError || !suppressions ? '—' : formatNumber(suppressions.length)}
            hint={
              suppressionsError
                ? "Ro'yxatni yuklab bo'lmadi"
                : needsTuning > 0
                  ? `${needsTuning} ta modulni sozlash kerak`
                  : 'Kamera × modul'
            }
            loading={suppressions === null && !suppressionsError}
          />
        </IntelPanel>

        {tab === 'toxtatilgan' ? (
          <div className="flex flex-col gap-3">
            <Notice tone="info">
              Operatorlar bir kameradagi modul signallarining ko&apos;pini rad etsa, modul o&apos;sha kamerada avtomatik
              to&apos;xtatiladi. Kamera burchagi yoki yorug&apos;ligi to&apos;g&apos;rilangach, qayta yoqing.
            </Notice>
            <IntelPanel title="Avtomatik to'xtatilganlar" code={reference} bodyClassName="min-w-0">
              <DataTable
                columns={suppressionColumns}
                rows={suppressions ?? []}
                rowKey={(s) => s.id}
                loading={suppressions === null}
                loadingRows={3}
                error={suppressionsError}
                onRetry={loadSuppressions}
                dense
                emptyTitle="To'xtatilgan juftlik yo'q"
                emptyDescription="Hozircha hech bir kamerada modul avtomatik to'xtatilmagan."
                defaultSort={{ key: 'createdAt', dir: 'desc' }}
                ariaLabel="Avtomatik to'xtatilgan kamera va modullar"
              />
            </IntelPanel>
          </div>
        ) : (
          <>
            {error && modules.length > 0 && <ErrorState message={error} onRetry={loadModules} />}

            <IntelPanel
              title={`${tab}. ${AI_MODULE_GROUP_LABELS[tab as AIModuleGroup]}`}
              code={reference}
              right={
                !firstLoad && rows.length > 0 ? (
                  <MicroLabel>
                    {rows.filter((m) => m.active).length} / {rows.length} faol
                  </MicroLabel>
                ) : undefined
              }
              bodyClassName="min-w-0"
            >
              {firstLoad ? (
                <div className="p-3">
                  <SkeletonText lines={8} />
                </div>
              ) : error && modules.length === 0 ? (
                <ErrorState variant="block" message={error} onRetry={loadModules} />
              ) : rows.length === 0 ? (
                <EmptyState
                  bordered={false}
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
                <ul className="divide-y divide-border">
                  {ordered.map((m) => (
                    <ModuleRow
                      key={m.id}
                      module={m}
                      totalCameras={totalCameras}
                      canConfigure={canConfigure}
                      canManageCameras={canManageCameras}
                      toggling={toggling === m.id}
                      onToggle={(value) => toggleActive(m, value)}
                      onEdit={() => setEditing(m)}
                      onCameras={() => setAssigningCameras(m)}
                      onModeChange={(mode) => setModeChange({ module: m, mode })}
                    />
                  ))}
                </ul>
              )}
            </IntelPanel>
          </>
        )}

        <DocumentFooter
          note={
            <>
              Hujjat raqami <CodeText>{reference}</CodeText>. Qamrov svetofori: yashil — faol kameralarning{' '}
              <CodeText>10%</CodeText> va undan ko&apos;pida yoqilgan · sariq — <CodeText>10%</CodeText> dan kam ·
              qizil — hech bir kamerada yoqilmagan. Kamera bazasi noma&apos;lum bo&apos;lsa qamrov hukmsiz
              (<CodeText>—</CodeText>) ko&apos;rsatiladi.
            </>
          }
        />
      </div>

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

/** Chegarasi yo'q sanoq — svetoforsiz, betaraf. */
function Tally({
  label,
  value,
  hint,
  to,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <MicroLabel className="block truncate">{label}</MicroLabel>
      <CodeText className="mt-0.5 block text-[17px] font-semibold leading-tight text-fg">{loading ? '…' : value}</CodeText>
      {hint && <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted">{hint}</span>}
    </>
  );
  if (to) {
    return (
      <ButtonLink to={to} variant="ghost" className="!block min-w-0 !justify-start bg-surface !px-2.5 !py-2 text-start hover:bg-surface-2">
        {body}
      </ButtonLink>
    );
  }
  return <div className="min-w-0 bg-surface px-2.5 py-2">{body}</div>;
}

/** Reyestrdagi bitta band. */
function ModuleRow({
  module: m,
  totalCameras,
  canConfigure,
  canManageCameras,
  toggling,
  onToggle,
  onEdit,
  onCameras,
  onModeChange,
}: {
  module: AIModule;
  totalCameras: number | null;
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
  const lamp = moduleLamp(m);
  const reason = blockingReason(m);

  // Qamrov: maxraj noma'lum bo'lsa hukm chiqarilmaydi.
  const coveragePct =
    m.hasDetector && totalCameras !== null && totalCameras > 0 ? ((m.cameraCount ?? 0) / totalCameras) * 100 : null;
  const coverageVerdict: Rag = m.hasDetector && m.active ? rag(coveragePct, COVERAGE_RAG) : 'yoq';
  const precisionVerdict: Rag = rag(m.measuredPrecision ?? null, PRECISION_RAG);

  return (
    <li className={cn('px-3 py-2', !m.active && 'bg-surface-2/40')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <CodeText className="mt-0.5 w-11 shrink-0 text-[12px] font-semibold text-subtle">{moduleCode(m.code)}</CodeText>

        <div className="min-w-[14rem] flex-1">
          <h3 className="text-[14px] font-semibold leading-5 text-fg">{m.name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusLamp status={lamp.status} label={lamp.label} />
            {isAttendance && <MicroLabel>Davomat mezoni</MicroLabel>}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted" title={m.description}>
            {m.description}
          </p>
          {m.method && (
            <p className="mt-0.5 line-clamp-1 text-xs text-subtle" title={m.method}>
              {m.method}
            </p>
          )}
        </div>

        {/* O'lchovlar ustuni — hammasi monoshrift, birliklari ochiq. */}
        <dl className="grid w-full shrink-0 grid-cols-3 gap-px border border-border bg-border sm:w-[19rem]">
          <div className="bg-surface px-2 py-1.5" title={m.maturityNote || 'Operator baholagan signallar asosida'}>
            <dt><MicroLabel>Aniqlik</MicroLabel></dt>
            <dd className="mt-0.5 flex items-baseline gap-1">
              <CodeText className={cn('text-[13px] font-semibold', RAG_TEXT[precisionVerdict])}>
                {m.measuredPrecision != null ? `${m.measuredPrecision}%` : '—'}
              </CodeText>
              {m.measuredPrecision != null && <Verdict verdict={precisionVerdict} />}
            </dd>
          </div>
          {/* Sinovda ko'rsatkich "baholangan / ishchi rejim uchun kerak" bo'ladi —
              izoh ham shunga mos kelishi kerak edi (ilgari ikkala holatda ham
              "tasdiqlangan / baholangan" deyilardi, bu esa noto'g'ri). */}
          <div
            className="bg-surface px-2 py-1.5"
            title={
              m.mode === 'sinov'
                ? `Baholangan sinov signallari — ishchi rejim uchun kamida ${PROMOTION_MIN_REVIEWS} ta kerak (oxirgi 90 kun)`
                : 'Operator baholagan signallar (tasdiqlangan + rad etilgan), oxirgi 90 kun'
            }
          >
            <dt><MicroLabel>Baholangan</MicroLabel></dt>
            <dd className="mt-0.5">
              {/* Sanoq — chegarasi yo'q, hukmsiz. */}
              <CodeText className="text-[13px] font-semibold text-fg">
                {m.mode === 'sinov' ? `${formatNumber(reviewed)} / ${PROMOTION_MIN_REVIEWS}` : formatNumber(reviewed)}
              </CodeText>
            </dd>
          </div>
          <div
            className="bg-surface px-2 py-1.5"
            title={
              totalCameras === null
                ? "Jami faol kameralar soni olinmadi — qamrov ulushi hisoblanmadi"
                : 'Shu modul yoqilgan kameralar / jami faol kameralar'
            }
          >
            <dt><MicroLabel>Qamrov</MicroLabel></dt>
            <dd className="mt-0.5 flex items-baseline gap-1">
              <CodeText className={cn('text-[13px] font-semibold', RAG_TEXT[coverageVerdict])}>
                {m.hasDetector ? `${formatNumber(m.cameraCount)} / ${totalCameras === null ? '—' : formatNumber(totalCameras)}` : '—'}
              </CodeText>
              {coverageVerdict !== 'yoq' && <Verdict verdict={coverageVerdict} />}
            </dd>
          </div>
        </dl>

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
            className="mt-0.5"
          />
        )}
      </div>

      {/* To'siq sababi — oddiy o'zbek tilida, tooltipda emas, ko'rinadigan matn. */}
      {reason && (
        <p className={cn('mt-1.5 flex items-start gap-2 border-s-2 ps-2 text-[13px] leading-5', lamp.status === 'alert' ? 'border-danger text-danger' : 'border-warning text-fg')}>
          <MicroLabel className={cn('mt-0.5 shrink-0', lamp.status === 'alert' ? '!text-danger' : '!text-warning')}>Nega ishlamaydi</MicroLabel>
          <span className="min-w-0">{reason}</span>
        </p>
      )}

      {(showCameras || canConfigure || (m.mode === 'sinov' && trialPending > 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
          {m.mode === 'sinov' && trialPending > 0 && (
            <ButtonLink to={`/hodisalar?korinish=sinov&modul=${m.code}`} variant="soft" size="sm" icon={FlaskConical}>
              {trialPending} ta namunani baholash
            </ButtonLink>
          )}
          {modeEditable && m.mode === 'sinov' && (
            // Nofaol tugma sichqonchani sezmaydi — izoh o'ramdagi span'da.
            <span
              className="ms-auto"
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
            <Button size="sm" variant="ghost" icon={FlaskConical} className="ms-auto" onClick={() => onModeChange('sinov')}>
              Sinovga o&apos;tkazish
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
