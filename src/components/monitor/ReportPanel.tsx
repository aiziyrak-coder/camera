import { useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { ApiError, api, buildQuery } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { resolvePreset, type FixedPreset } from '../../lib/reportPeriods';
import type { ReportAnalytics } from '../../types';

const PERIODS: { label: string; preset: FixedPreset }[] = [
  { label: 'Bugun', preset: 'today' },
  { label: 'Hafta', preset: 'last7' },
  { label: 'Oy', preset: 'month' },
];

/** O'ng panelning yuqori qismi — tanlangan davr tahlilini bir tugma bilan
 * rasmiy PDF qilib yuklab olish. Ilgari har bosish arxivga yangi yozuv
 * qo'shardi; endi PDF to'g'ridan-to'g'ri jonli tahlildan tayyorlanadi,
 * arxivga saqlash esa «Hisobotlar» sahifasida ataylab bajariladi. */
export default function ReportPanel() {
  const { token, userName } = useAuth();
  const [preset, setPreset] = useState<FixedPreset>('today');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLabel, setLastLabel] = useState<string | null>(null);

  async function handleDownload() {
    if (!token) {
      setError('Hisobot olish uchun tizimga kiring');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const range = resolvePreset(preset);
      const analytics = await api.get<ReportAnalytics>(
        `/api/reports/analytics${buildQuery({ from: range.from, to: range.to })}`,
        token,
      );
      const { exportAnalyticsPdf } = await import('../../lib/reportPdf');
      await exportAnalyticsPdf(analytics, { preparedBy: userName });
      setLastLabel(`${analytics.period.label} · ${analytics.generatedAt.slice(11)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? `PDF tayyorlab bo'lmadi: ${err.message}`
            : 'Tarmoq xatosi — hisobot olinmadi',
      );
    } finally {
      setGenerating(false);
    }
  }

  const current = PERIODS.find((p) => p.preset === preset);

  return (
    <div className="glass p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
        <FileText size={15} className="text-indigo-500" />
        Hisobot
      </h3>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.preset}
            type="button"
            onClick={() => setPreset(p.preset)}
            aria-pressed={preset === p.preset}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              preset === p.preset ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={generating}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {generating ? 'Tayyorlanmoqda...' : `${current?.label ?? ''} — PDF hisobot`}
      </button>

      {error && <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p>}

      {lastLabel && !error && <p className="mt-2 truncate text-[11px] text-slate-500">Oxirgi: {lastLabel}</p>}
    </div>
  );
}
