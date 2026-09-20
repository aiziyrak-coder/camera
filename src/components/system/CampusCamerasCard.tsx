import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Camera } from 'lucide-react';
import type { Building, CameraConfig } from '../../types';
import { Badge, Card, CardHeader, Drawer, EmptyState, KeyValue, TONE_SOLID, cn, focusRing, type Tone } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { ResourceBody } from './parts';

export interface CampusCameras {
  buildings: Building[];
  cameras: CameraConfig[];
}

function cameraState(camera: CameraConfig): { label: string; tone: Tone } {
  if (camera.status === 'tamirda') return { label: "Ta'mirda", tone: 'warning' };
  if (camera.status === 'nofaol') return { label: 'Nofaol', tone: 'neutral' };
  return camera.isReachable ? { label: 'Onlayn', tone: 'success' } : { label: 'Aloqada emas', tone: 'danger' };
}

const LEGEND: Array<{ tone: Tone; label: string }> = [
  { tone: 'success', label: 'Onlayn' },
  { tone: 'danger', label: 'Aloqada emas' },
  { tone: 'warning', label: "Ta'mirda" },
  { tone: 'neutral', label: 'Nofaol' },
];

/** Binolar bo'yicha kameralar: har kamera — rangli katak, bosilsa tafsilot. */
export function CampusCamerasCard({ resource }: { resource: LiveResource<CampusCameras> }) {
  const [selected, setSelected] = useState<CameraConfig | null>(null);

  const groups = useMemo(() => {
    const data = resource.data;
    if (!data) return [];
    const names = data.buildings.map((b) => b.name);
    const known = new Set(names);
    const extra = [...new Set(data.cameras.map((c) => c.building).filter((b) => !known.has(b)))];
    return [...names, ...extra].map((name) => ({
      name: name || "Bino ko'rsatilmagan",
      cameras: data.cameras.filter((c) => c.building === name).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [resource.data]);

  const state = selected ? cameraState(selected) : null;

  return (
    <Card>
      <CardHeader
        title="Binolar bo'yicha kameralar"
        subtitle="Har bir katak — bitta kamera"
        icon={Building2}
        actions={
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Rang izohi">
            {LEGEND.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-sm', TONE_SOLID[item.tone])} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        }
      />
      <ResourceBody resource={resource}>
        {() =>
          groups.length === 0 ? (
            <EmptyState compact bordered={false} icon={Building2} title="Binolar yo'q" description="Tashkiliy tuzilmada bino va kameralar qo'shilgach shu yerda ko'rinadi." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => {
                const offline = group.cameras.filter((c) => c.status === 'faol' && !c.isReachable).length;
                return (
                  <section key={group.name} className="rounded-control border border-border p-3" aria-label={group.name}>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-fg">{group.name}</p>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {group.cameras.length} ta{offline > 0 && <span className="font-semibold text-danger"> · {offline} offline</span>}
                      </span>
                    </div>
                    {group.cameras.length === 0 ? (
                      <p className="text-xs text-subtle">Kamera biriktirilmagan</p>
                    ) : (
                      <div className="-m-0.5 flex flex-wrap">
                        {group.cameras.map((camera) => {
                          const s = cameraState(camera);
                          return (
                            // Bosiladigan joy 16px edi — barmoq uchun juda kichik.
                            // Katak ko'rinishi o'zgarmaydi, lekin nishon 24px bo'ldi.
                            <button
                              key={camera.id}
                              type="button"
                              onClick={() => setSelected(camera)}
                              title={`${camera.name} · ${camera.zone} · ${s.label}`}
                              aria-label={`${camera.name}, ${s.label}`}
                              className={cn('m-0.5 inline-flex h-6 w-6 items-center justify-center rounded-[6px] transition-transform hover:scale-125', focusRing)}
                            >
                              <span className={cn('h-4 w-4 rounded-[4px]', TONE_SOLID[s.tone])} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )
        }
      </ResourceBody>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected ? [selected.building, selected.zone].filter(Boolean).join(' · ') : undefined}
        footer={
          <Link to="/sozlamalar/kameralar" className={cn('inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline', focusRing)}>
            <Camera size={16} aria-hidden="true" /> Kameralar bo'limida ochish
          </Link>
        }
      >
        {selected && state && (
          <KeyValue
            items={[
              { label: 'Holat', value: <Badge tone={state.tone} dot>{state.label}</Badge> },
              { label: 'IP manzil', value: <span className="font-mono text-[13px]">{`${selected.ip}:${selected.port}`}</span> },
              { label: 'Bino', value: selected.building || '—' },
              { label: 'Qavat', value: selected.floor ?? '—' },
              { label: 'Zona', value: selected.zone || '—' },
              { label: 'Kafedra', value: selected.department || '—' },
              // "Ruxsat" (= permission) noto'g'ri tarjima edi; ilovaning qolgan qismida "Tasvir sifati".
              { label: 'Tasvir sifati', value: `${selected.resolution || '—'}${selected.fps ? ` · ${selected.fps} fps` : ''}` },
              { label: 'Kirish kamerasi', value: selected.isEntrance ? 'Ha' : "Yo'q" },
            ]}
          />
        )}
      </Drawer>
    </Card>
  );
}
