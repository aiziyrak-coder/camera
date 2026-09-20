import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Camera } from 'lucide-react';
import type { Building, CameraConfig } from '../../types';
import {
  CodeText,
  Drawer,
  EmptyState,
  IntelPanel,
  KeyValue,
  MicroLabel,
  RAG_LETTER,
  RAG_LABEL,
  RAG_TEXT,
  StatusLamp,
  TONE_SOLID,
  cn,
  focusRing,
  rag,
  type IntelStatus,
  type Tone,
} from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { MeasuredAt, ResourceBody } from './parts';
import { COVERAGE_RAG } from './systemTypes';

/** Kamera holati -> chirog'i (rang yolg'iz qolmaydi, yonida so'z turadi). */
const CAMERA_LAMP: Record<Tone, IntelStatus> = {
  success: 'ok',
  danger: 'alert',
  warning: 'warn',
  neutral: 'idle',
  info: 'idle',
  primary: 'idle',
} as Record<Tone, IntelStatus>;

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
    <IntelPanel
      title="Binolar bo'yicha kameralar"
      code="SYS-CAM"
      right={
        <span className="flex items-center gap-3">
          <ul className="hidden flex-wrap gap-x-3 gap-y-1 sm:flex" aria-label="Rang izohi">
            {LEGEND.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2', TONE_SOLID[item.tone])} aria-hidden="true" />
                <MicroLabel>{item.label}</MicroLabel>
              </li>
            ))}
          </ul>
          <MeasuredAt resource={resource} />
        </span>
      }
    >
      <ResourceBody resource={resource}>
        {() =>
          groups.length === 0 ? (
            <div className="p-3">
              <EmptyState compact bordered={false} icon={Building2} title="Binolar yo'q" description="Tashkiliy tuzilmada bino va kameralar qo'shilgach shu yerda ko'rinadi." />
            </div>
          ) : (
            <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group, index) => {
                const faol = group.cameras.filter((c) => c.status === 'faol');
                const offline = faol.filter((c) => !c.isReachable).length;
                // Aloqa ULUSHI — chegarasi bor ko'rsatkich, shuning uchun hukm bilan.
                const online = faol.length > 0 ? ((faol.length - offline) / faol.length) * 100 : null;
                const verdict = rag(online, COVERAGE_RAG);
                return (
                  <section key={group.name} className="bg-surface p-2.5" aria-label={group.name}>
                    <div className="mb-2 flex items-center gap-2">
                      <CodeText className="shrink-0 text-[11px] text-subtle">BIN-{String(index + 1).padStart(2, '0')}</CodeText>
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{group.name}</p>
                      <span className="flex shrink-0 items-baseline gap-1" title={`${RAG_LABEL[verdict]} — aloqadagi faol kameralar`}>
                        <CodeText className={cn('text-[12px] font-semibold', RAG_TEXT[verdict])}>
                          {faol.length - offline}/{faol.length}
                        </CodeText>
                        <CodeText className={cn('text-[10px] font-bold', RAG_TEXT[verdict])}>{RAG_LETTER[verdict]}</CodeText>
                        <span className="sr-only">{RAG_LABEL[verdict]} — aloqadagi faol kameralar</span>
                      </span>
                    </div>
                    {group.cameras.length === 0 ? (
                      <MicroLabel>Kamera biriktirilmagan</MicroLabel>
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
                              className={cn('m-0.5 inline-flex h-6 w-6 items-center justify-center transition-transform hover:scale-125', focusRing)}
                            >
                              <span className={cn('h-4 w-4', TONE_SOLID[s.tone])} aria-hidden="true" />
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
              { label: 'Holat', value: <StatusLamp status={CAMERA_LAMP[state.tone]} label={state.label} /> },
              { label: 'IP manzil', value: <CodeText className="text-[13px]">{`${selected.ip}:${selected.port}`}</CodeText> },
              { label: 'Bino', value: selected.building || '—' },
              { label: 'Qavat', value: <CodeText className="text-[13px]">{selected.floor ?? '—'}</CodeText> },
              { label: 'Zona', value: selected.zone || '—' },
              { label: 'Kafedra', value: selected.department || '—' },
              // "Ruxsat" (= permission) noto'g'ri tarjima edi; ilovaning qolgan qismida "Tasvir sifati".
              {
                label: 'Tasvir sifati',
                value: <CodeText className="text-[13px]">{`${selected.resolution || '—'}${selected.fps ? ` · ${selected.fps} fps` : ''}`}</CodeText>,
              },
              { label: 'Kirish kamerasi', value: selected.isEntrance ? 'Ha' : "Yo'q" },
            ]}
          />
        )}
      </Drawer>
    </IntelPanel>
  );
}
