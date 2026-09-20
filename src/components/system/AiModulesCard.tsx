import { Link } from 'react-router-dom';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import type { AIModule } from '../../types';
import {
  CodeText,
  EmptyState,
  IntelPanel,
  MicroLabel,
  RATE_RAG,
  RAG_LETTER,
  RAG_LABEL,
  RAG_TEXT,
  StatusLamp,
  cn,
  focusRing,
  formatPercent,
  rag,
  type IntelStatus,
} from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { MeasuredAt, ResourceBody } from './parts';

function maturity(module: AIModule): { label: string; status: IntelStatus } {
  if (module.maturity === 'sozlash_kerak') return { label: 'Sozlash kerak', status: 'alert' };
  if (module.maturity === 'sinov' || module.mode === 'sinov') return { label: 'Sinov', status: 'warn' };
  return { label: 'Ishchi', status: 'ok' };
}

/** AI modullar ro'yxati: kod, nom, holat chirog'i, o'lchangan aniqlik. */
export function AiModulesCard({ resource }: { resource: LiveResource<AIModule[]> }) {
  const modules = resource.data ?? [];
  const active = modules.filter((m) => m.active);
  return (
    <IntelPanel
      title="AI modullar"
      code={resource.data ? `${active.length}/${modules.length} faol` : undefined}
      right={
        <span className="flex items-center gap-3">
          <MeasuredAt resource={resource} />
          <Link to="/sozlamalar/ai" className={cn('inline-flex items-center gap-0.5 text-[12px] font-medium text-primary hover:underline', focusRing)}>
            Sozlash <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </span>
      }
    >
      <ResourceBody resource={resource} lines={5}>
        {() =>
          active.length === 0 ? (
            <div className="p-3">
              <EmptyState compact bordered={false} icon={BrainCircuit} title="Faol AI modul yo'q" description="AI sozlamalarida kerakli modullarni yoqing." />
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {active.map((module) => {
                const m = maturity(module);
                const verdict = rag(module.measuredPrecision ?? null, RATE_RAG);
                return (
                  <li key={module.id} className="px-2.5 py-1.5">
                    <div className="flex items-center gap-3">
                      <CodeText className="w-9 shrink-0 text-[11px] text-subtle">
                        M-{String(module.code).padStart(2, '0')}
                      </CodeText>
                      <p className="min-w-0 flex-1 truncate text-[13px] text-fg" title={module.name}>
                        {module.name}
                      </p>
                      <StatusLamp className="shrink-0" status={m.status} label={m.label} />
                      <span
                        className="flex w-20 shrink-0 items-baseline justify-end gap-1"
                        // "—" nimani anglatishi aytilmasdi: aniqlik nol emas, hali o'lchanmagan.
                        title={
                          module.measuredPrecision === null || module.measuredPrecision === undefined
                            ? "Aniqlik hali o'lchanmagan — operator yetarlicha signalni ko'rib chiqishi kerak"
                            : `${RAG_LABEL[verdict]} — operator ko'rib chiqqan signallar asosidagi aniqlik`
                        }
                      >
                        <CodeText className={cn('text-[13px] font-semibold', RAG_TEXT[verdict])}>
                          {formatPercent(module.measuredPrecision ?? null)}
                        </CodeText>
                        <CodeText className={cn('text-[10px] font-bold', RAG_TEXT[verdict])}>{RAG_LETTER[verdict]}</CodeText>
                        <span className="sr-only">{RAG_LABEL[verdict]}</span>
                      </span>
                    </div>
                    {/* Qizil "Sozlash kerak" — nima qilish kerakligi faqat tooltipda edi. */}
                    {m.status === 'alert' && module.maturityNote && (
                      <p className="ms-12 mt-0.5 text-xs leading-relaxed text-danger">{module.maturityNote}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
      </ResourceBody>
      <p className="border-t border-border bg-surface-2/50 px-2.5 py-1.5">
        <MicroLabel className="!normal-case !tracking-normal !text-subtle">
          Aniqlik: yashil 90% va yuqori · sariq 75% dan · qizil 75% dan past. "—" — hali o'lchanmagan.
        </MicroLabel>
      </p>
    </IntelPanel>
  );
}
