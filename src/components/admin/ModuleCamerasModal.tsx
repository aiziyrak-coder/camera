import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Square, Video, VideoOff } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Modal, SearchInput, Skeleton, cn, type Tone } from '../../ui';
import { Checkbox, Notice } from '../settings/kit';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { AIModule, ModuleCameraAssignments } from '../../types';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  faol: { label: 'Faol', tone: 'success' },
  nofaol: { label: 'Nofaol', tone: 'neutral' },
  tamirda: { label: "Ta'mirda", tone: 'warning' },
};

/** Bitta AI modulini qaysi kameralarda ishlashini belgilash (forma — Modal). */
export default function ModuleCamerasModal({
  open,
  module,
  onClose,
  onSaved,
}: {
  open: boolean;
  module: AIModule | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<ModuleCameraAssignments | null>(null);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    if (!module || !token) return;
    setLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const res = await api.get<ModuleCameraAssignments>(`/api/cameras/by-module/${module.code}/assignments`, token);
      setData(res);
      setPending(new Map());
    } catch (err) {
      setData(null);
      setLoadError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, [module, token]);

  useEffect(() => {
    if (open && module) {
      setFilter('');
      setData(null);
      void load();
    }
  }, [open, module, load]);

  function isEnabled(cameraId: string, original: boolean): boolean {
    return pending.has(cameraId) ? pending.get(cameraId)! : original;
  }

  function toggle(cameraId: string, original: boolean) {
    const current = isEnabled(cameraId, original);
    setPending((prev) => {
      const next = new Map(prev);
      const newVal = !current;
      if (newVal === original) next.delete(cameraId);
      else next.set(cameraId, newVal);
      return next;
    });
  }

  function setAll(enabled: boolean) {
    if (!data) return;
    const next = new Map<string, boolean>();
    for (const c of data.cameras) {
      if (c.enabled !== enabled) next.set(c.cameraId, enabled);
    }
    setPending(next);
  }

  async function handleSave() {
    if (!module || pending.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const assignments = Array.from(pending.entries()).map(([cameraId, enabled]) => ({ cameraId, enabled }));
      await api.patch<ModuleCameraAssignments>(`/api/cameras/by-module/${module.code}/assignments`, { assignments }, token);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  }

  const allCameras = data?.cameras ?? [];
  const cameras = allCameras.filter((c) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return c.cameraName.toLowerCase().includes(q) || c.building.toLowerCase().includes(q) || c.zone.toLowerCase().includes(q);
  });

  const enabledCount = allCameras.filter((c) => isEnabled(c.cameraId, c.enabled)).length;

  let body;
  if (loading) {
    body = (
      <div className="divide-y divide-border rounded-control border border-border" aria-busy="true" aria-label="Yuklanmoqda">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    );
  } else if (loadError) {
    body = <ErrorState message={loadError} onRetry={() => void load()} />;
  } else if (allCameras.length === 0) {
    body = (
      <EmptyState
        icon={VideoOff}
        compact
        title="Hali kamera qo'shilmagan"
        description="Modulni biriktirish uchun avval kamera qo'shing."
        action={
          <ButtonLink to="/sozlamalar/kameralar" size="sm" onClick={onClose}>
            Kameralar sahifasi
          </ButtonLink>
        }
      />
    );
  } else {
    body = (
      <>
        <p className="text-[13px] font-medium tabular-nums text-fg">
          {enabledCount} / {allCameras.length} kamera yoqilgan
          {pending.size > 0 && <span className="text-primary"> · {pending.size} ta o‘zgarish</span>}
        </p>
        <div className="max-h-80 overflow-y-auto rounded-control border border-border">
          {cameras.length === 0 ? (
            <EmptyState compact bordered={false} title="Kamera topilmadi" description="Qidiruv so'zini o'zgartiring." />
          ) : (
            <ul className="divide-y divide-border">
              {cameras.map((c) => {
                const on = isEnabled(c.cameraId, c.enabled);
                const changed = pending.has(c.cameraId);
                const status = STATUS_META[c.status] ?? { label: c.status, tone: 'neutral' as Tone };
                return (
                  <li key={c.cameraId} className={cn('transition-colors hover:bg-surface-2', changed && 'bg-primary-soft/40')}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <Checkbox checked={on} onChange={() => toggle(c.cameraId, c.enabled)} aria-label={`${c.cameraName} — ${on ? "o'chirish" : 'yoqish'}`} />
                      <Video size={15} className="shrink-0 text-subtle" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{c.cameraName}</span>
                        <span className="block truncate text-xs text-muted">
                          {c.building} · {c.zone}
                        </span>
                      </span>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <Modal
      open={open && !!module}
      onClose={onClose}
      title={module ? `№${module.code} — ${module.name}` : ''}
      description="Qaysi kameralarda bu AI kriteriyasi ishlashi kerakligini belgilang. O‘chirilgan kamera bu modulni hisoblamaydi — tezroq aylanish va kamroq yuk."
      size="lg"
      dismissible={!saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={loading || !!loadError}>
            {pending.size ? 'Saqlash' : 'Yopish'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!loadError && allCameras.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={filter}
              onChange={setFilter}
              placeholder="Kamera, bino yoki zona bo‘yicha qidirish…"
              className="flex-1 sm:max-w-none"
            />
            <Button size="sm" variant="ghost" icon={CheckSquare} onClick={() => setAll(true)} disabled={loading}>
              Hammasini yoqish
            </Button>
            <Button size="sm" variant="ghost" icon={Square} onClick={() => setAll(false)} disabled={loading}>
              Hammasini o‘chirish
            </Button>
          </div>
        )}
        {body}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}
