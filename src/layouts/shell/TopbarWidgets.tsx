import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { config, isBackendConfigured } from '../../lib/config';
import { IconButton, StatusDot, cn, focusRing, type Crumb, type Tone } from '../../ui';

const TASHKENT_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Toshkent vaqti bo'yicha jonli soat. */
export function LiveClock({ seconds = false, className }: { seconds?: boolean; className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), seconds ? 1000 : 10_000);
    return () => window.clearInterval(id);
  }, [seconds]);
  const text = TASHKENT_TIME.format(now);
  const shown = seconds ? text : text.slice(0, 5);
  return (
    <time className={cn('font-semibold tabular-nums text-fg', className)} dateTime={now.toISOString()} aria-label={`Hozirgi vaqt ${shown}`}>
      {shown}
    </time>
  );
}

type HealthState = 'ok' | 'degraded' | 'down' | 'offline' | 'demo' | 'checking';

const HEALTH_META: Record<HealthState, { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'Tizim faol' },
  degraded: { tone: 'warning', label: 'Qisman ishlayapti' },
  down: { tone: 'danger', label: "Server bilan aloqa yo'q" },
  offline: { tone: 'danger', label: "Internet yo'q" },
  demo: { tone: 'neutral', label: 'Demo rejim' },
  checking: { tone: 'neutral', label: 'Tekshirilmoqda…' },
};

const CHECK_LABELS: Record<string, string> = {
  database: "Ma'lumotlar bazasi",
  storage: 'Fayl ombori',
  video_gateway: 'Video shlyuz',
};

/** Tizim holati nuqtasi: backend /health har daqiqada tekshiriladi. */
export function SystemStatus({ showLabel = true }: { showLabel?: boolean }) {
  const [state, setState] = useState<HealthState>(isBackendConfigured ? 'checking' : 'demo');
  const [failing, setFailing] = useState<string[]>([]);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let cancelled = false;
    let controller: AbortController | null = null;

    async function check() {
      if (!navigator.onLine) {
        setState('offline');
        return;
      }
      controller?.abort();
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const res = await fetch(`${config.apiBaseUrl}/health`, { signal: controller.signal, cache: 'no-store' });
        // Javob: {"status":"degraded","database":"ok","storage":"ok","video_gateway":"unreachable"}
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        const checks = (typeof body.checks === 'object' && body.checks ? body.checks : body) as Record<string, unknown>;
        const bad = Object.entries(checks)
          .filter(([key, value]) => key !== 'status' && typeof value === 'string' && value !== 'ok')
          .map(([key]) => CHECK_LABELS[key] ?? key);
        setFailing(bad);
        setState(res.ok ? 'ok' : bad.length > 0 ? 'degraded' : 'down');
      } catch {
        if (!cancelled) setState(navigator.onLine ? 'down' : 'offline');
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void check();
    // Fonda turgan yorliq /health'ni chaqirmaydi; qaytib ko'ringanda
    // darhol bir marta tekshiriladi (holat eskirib qolmasin).
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void check();
    }, 60_000);
    const recheck = () => void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('online', recheck);
    window.addEventListener('offline', recheck);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(id);
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const meta = HEALTH_META[state];
  const detail = failing.length > 0 ? `${meta.label}: ${failing.join(', ')} ishlamayapti` : meta.label;

  return (
    <span
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-2.5 text-xs font-medium text-muted"
      title={detail}
      role="status"
      aria-label={detail}
    >
      <StatusDot tone={meta.tone} pulse={state === 'ok'} />
      {showLabel && <span className="whitespace-nowrap">{meta.label}</span>}
    </span>
  );
}

export function EventsBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return <IconButton icon={Bell} label={count > 0 ? `${count} ta yangi hodisa` : 'Hodisalar'} badge={count} onClick={onOpen} />;
}

/** Non-yo'l: telefonda faqat oxirgi element. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Non-yo'l" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className={cn('flex min-w-0 items-center gap-1', !last && 'hidden md:flex')}>
              {crumb.to && !last ? (
                <Link to={crumb.to} className={cn('truncate rounded text-muted transition-colors hover:text-fg', focusRing)}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={cn('truncate', last ? 'font-semibold text-fg' : 'text-muted')} aria-current={last ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
              {!last && <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
