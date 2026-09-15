import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpCircle, FlaskConical, RotateCcw, Settings2, ShieldOff, Video } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import ConfirmDialog from '../../components/ConfirmDialog';
import AiModuleModal from '../../components/admin/AiModuleModal';
import ModuleCamerasModal from '../../components/admin/ModuleCamerasModal';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { AI_MODULE_GROUP_LABELS } from '../../lib/aiModuleGroups';
import type { AIModule, AIModuleGroup, ModuleSuppression } from '../../types';

const GROUPS = Object.keys(AI_MODULE_GROUP_LABELS) as AIModuleGroup[];
// Hodisa bermaydigan (davomat yozadigan) mezonlar — rejimi o'zgartirilmaydi.
const ATTENDANCE_CODES = new Set([6, 7, 8, 9]);
const PROMOTION_MIN_REVIEWS = 30;

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
  const [activeGroup, setActiveGroup] = useState<AIModuleGroup>('A');
  const [editing, setEditing] = useState<AIModule | null>(null);
  const [assigningCameras, setAssigningCameras] = useState<AIModule | null>(null);
  const [modeChange, setModeChange] = useState<ModeChange | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadModules = useCallback(() => {
    if (!token) return;
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
    if (!token) return;
    api
      .get<ModuleSuppression[]>('/api/ai-modules/suppressions', token)
      .then(setSuppressions)
      .catch(() => setSuppressions([]));
  }, [token]);

  useEffect(loadModules, [loadModules]);
  useEffect(loadSuppressions, [loadSuppressions]);

  const activeCount = modules.filter((m) => m.active).length;
  const trialCount = modules.filter((m) => m.active && m.mode === 'sinov').length;

  const byGroup = useMemo(() => {
    const map = new Map<AIModuleGroup, AIModule[]>();
    for (const g of GROUPS) map.set(g, []);
    for (const m of modules) map.get(m.group)?.push(m);
    return map;
  }, [modules]);

  function handleSave(saved: AIModule) {
    setModules((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    setEditing(null);
  }

  async function applyModeChange() {
    if (!modeChange || !token) return;
    const { module, mode } = modeChange;
    try {
      const saved = await api.patch<AIModule>(
        `/api/ai-modules/${module.id}`,
        { threshold: module.threshold, sensitivity: module.sensitivity, active: module.active, mode },
        token,
      );
      handleSave(saved);
      toast.success(mode === 'ishchi' ? `${module.name} — ishchi rejimga o'tkazildi` : `${module.name} — sinov rejimiga o'tkazildi`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setModeChange(null);
    }
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

  const currentModules = byGroup.get(activeGroup) ?? [];

  return (
    <section className="glass p-4 sm:p-6">
      <PageHeader
        title="AI Modullari"
        subtitle={`Texnik topshiriq 3-bo'lim — ${modules.length} ta AI kriteriya (A-F toifalar)`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{`${activeCount} / ${modules.length} faol`}</Badge>
            {trialCount > 0 && <Badge tone="amber">{`${trialCount} tasi sinovda`}</Badge>}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={loadModules} />
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2 border-b border-white/70 text-sm">
        {GROUPS.map((g) => {
          const groupModules = byGroup.get(g) ?? [];
          const groupActive = groupModules.filter((m) => m.active).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors ${
                activeGroup === g ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold">{g}</span>
              <span className="hidden sm:inline">{AI_MODULE_GROUP_LABELS[g]}</span>
              <span className="text-xs text-slate-400">
                ({groupActive}/{groupModules.length})
              </span>
            </button>
          );
        })}
      </div>

      {loading && modules.length === 0 ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">№</th>
                <th className="px-4 py-3">Kriteriya</th>
                <th className="px-4 py-3">Holat va rejim</th>
                <th className="px-4 py-3" title="Operator tasdiqlagan / baholangan signallar, oxirgi 90 kun">
                  O&apos;lchangan aniqlik
                </th>
                <th className="px-4 py-3">Kamera</th>
                <th className="px-4 py-3">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {currentModules.map((m) => {
                const reviewed = m.reviewedEvents ?? 0;
                const trialPending = m.trialUnreviewed ?? 0;
                const modeEditable = canConfigure && m.hasDetector && !ATTENDANCE_CODES.has(m.code);
                return (
                  <tr key={m.id} className="align-top transition-colors hover:bg-white/40">
                    <td className="px-4 py-3 text-slate-400">{m.code || '—'}</td>
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-500">{m.description}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{m.method}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={m.active ? 'green' : 'slate'}>{m.active ? 'Faol' : 'Nofaol'}</Badge>
                        {!ATTENDANCE_CODES.has(m.code) && (
                          <span title={m.maturityNote}>
                            <Badge tone={m.mode === 'sinov' ? 'amber' : 'indigo'}>
                              {m.mode === 'sinov' ? 'Sinov rejimi' : 'Ishchi rejim'}
                            </Badge>
                          </span>
                        )}
                        {m.maturity === 'sozlash_kerak' && (
                          <span title={m.maturityNote}>
                            <Badge tone="red">Sozlash kerak</Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" title={m.maturityNote}>
                      {m.measuredPrecision != null ? (
                        <p className="font-semibold tabular-nums text-slate-900">{m.measuredPrecision}%</p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500">O&apos;lchanmagan</p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        {m.mode === 'sinov'
                          ? `${reviewed} / ${PROMOTION_MIN_REVIEWS} baholangan`
                          : `${reviewed} ta ko'rib chiqilgan`}
                      </p>
                      {m.mode === 'sinov' && trialPending > 0 && (
                        <Link
                          to={`/admin/events?korinish=sinov&modul=${m.code}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
                        >
                          <FlaskConical size={12} />
                          {trialPending} ta namunani baholash
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {m.hasDetector ? <span title="Faol kameralarda bu modul yoqilgan">{m.cameraCount}</span> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {canManageCameras && m.hasDetector && (
                          <button
                            type="button"
                            onClick={() => setAssigningCameras(m)}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            <Video size={12} />
                            Kameralar
                          </button>
                        )}
                        {canConfigure && (
                          <button
                            type="button"
                            onClick={() => setEditing(m)}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            <Settings2 size={12} />
                            Sozlash
                          </button>
                        )}
                        {modeEditable && m.mode === 'sinov' && (
                          <button
                            type="button"
                            onClick={() => setModeChange({ module: m, mode: 'ishchi' })}
                            disabled={!m.promotionReady}
                            title={
                              m.promotionReady
                                ? "Signallar operator navbatiga tusha boshlaydi"
                                : `Kamida ${PROMOTION_MIN_REVIEWS} ta baholangan signal va 80% aniqlik kerak`
                            }
                            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                          >
                            <ArrowUpCircle size={12} />
                            Ishchi rejimga
                          </button>
                        )}
                        {modeEditable && m.mode === 'ishchi' && (
                          <button
                            type="button"
                            onClick={() => setModeChange({ module: m, mode: 'sinov' })}
                            className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
                          >
                            <FlaskConical size={12} />
                            Sinovga o&apos;tkazish
                          </button>
                        )}
                        {!canConfigure && !canManageCameras && <span className="text-xs text-slate-300">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ShieldOff size={16} className="text-amber-600" aria-hidden="true" />
          Avtomatik to&apos;xtatilgan kamera va modullar
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Operatorlar bir kameradagi modul signallarining ko&apos;pini rad etsa, modul o&apos;sha kamerada avtomatik to&apos;xtatiladi.
          Kamera burchagi yoki yorug&apos;ligi to&apos;g&apos;rilangach, qayta yoqing.
        </p>
        {suppressions === null ? (
          <SkeletonTable rows={2} columns={5} />
        ) : suppressions.length === 0 ? (
          <EmptyState compact title="To'xtatilgan juftlik yo'q" description="Hozircha hech bir kamerada modul avtomatik to'xtatilmagan." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/70">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Kamera</th>
                  <th className="px-4 py-3">Modul</th>
                  <th className="px-4 py-3">Sabab</th>
                  <th className="px-4 py-3">Qachon</th>
                  <th className="px-4 py-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {suppressions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.cameraName}</p>
                      <p className="text-xs text-slate-500">{item.building}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      №{item.moduleCode} {item.moduleName}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-xs text-slate-600">{item.reason}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-500">{item.createdAt}</td>
                    <td className="px-4 py-3 text-right">
                      {canConfigure ? (
                        <button
                          type="button"
                          onClick={() => restore(item)}
                          disabled={restoring === item.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          Qayta yoqish
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AiModuleModal open={!!editing} onClose={() => setEditing(null)} module={editing} onSave={handleSave} />
      <ModuleCamerasModal
        open={!!assigningCameras}
        module={assigningCameras}
        onClose={() => setAssigningCameras(null)}
        onSaved={loadModules}
      />
      <ConfirmDialog
        open={!!modeChange}
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
    </section>
  );
}
