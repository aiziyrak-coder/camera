import { Link } from 'react-router-dom';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import type { AIModule } from '../../types';
import { Badge, Card, CardHeader, EmptyState, cn, focusRing, formatPercent, type Tone } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { ResourceBody } from './parts';

function maturity(module: AIModule): { label: string; tone: Tone } {
  if (module.maturity === 'sozlash_kerak') return { label: 'Sozlash kerak', tone: 'danger' };
  if (module.maturity === 'sinov' || module.mode === 'sinov') return { label: 'Sinov', tone: 'warning' };
  return { label: 'Ishchi', tone: 'success' };
}

/** AI modullar holati: faollari, yetukligi va o'lchangan aniqligi. */
export function AiModulesCard({ resource }: { resource: LiveResource<AIModule[]> }) {
  const modules = resource.data ?? [];
  const active = modules.filter((m) => m.active);
  return (
    <Card>
      <CardHeader
        title="AI modullar"
        subtitle={resource.data ? `${active.length} / ${modules.length} faol` : 'Faol modullar'}
        icon={BrainCircuit}
        actions={
          <Link to="/sozlamalar/ai" className={cn('inline-flex items-center gap-0.5 rounded-control text-[13px] font-medium text-primary hover:underline', focusRing)}>
            Sozlash <ChevronRight size={14} aria-hidden="true" />
          </Link>
        }
      />
      <ResourceBody resource={resource} lines={5}>
        {() =>
          active.length === 0 ? (
            <EmptyState compact bordered={false} icon={BrainCircuit} title="Faol AI modul yo'q" description="AI sozlamalarida kerakli modullarni yoqing." />
          ) : (
            <ul className="-mx-1 max-h-80 divide-y divide-border overflow-y-auto px-1">
              {active.map((module) => {
                const m = maturity(module);
                return (
                  <li key={module.id} className="flex items-center gap-3 py-2">
                    <span className="w-7 shrink-0 text-xs tabular-nums text-subtle">#{module.code}</span>
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg" title={module.name}>
                      {module.name}
                    </p>
                    <Badge tone={m.tone} dot title={module.maturityNote}>
                      {m.label}
                    </Badge>
                    <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-fg" title="Operator ko'rib chiqqan signallar asosidagi aniqlik">
                      {formatPercent(module.measuredPrecision ?? null)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </ResourceBody>
    </Card>
  );
}
