import { useState } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { Button, Card, CardHeader, Tabs } from '../../ui';
import { ApiError, api, buildQuery } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { resolvePreset, type FixedPreset } from '../../lib/reportPeriods';
import type { ReportAnalytics } from '../../types';

const PERIODS: { id: FixedPreset; label: string }[] = [
  { id: 'today', label: 'Bugun' },
  { id: 'last7', label: 'Hafta' },
  { id: 'month', label: 'Oy' },
];

/** Tanlangan davr tahlilini bir tugma bilan rasmiy PDF qilib yuklab olish.
 * PDF to'g'ridan-to'g'ri jonli tahlildan tayyorlanadi (arxivga yozilmaydi);
 * arxivga saqlash «Hisobotlar» sahifasida ataylab bajariladi. */
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

  const current = PERIODS.find((p) => p.id === preset);

  return (
    <Card>
      <CardHeader title="Hisobot" icon={FileText} subtitle="Davr tahlili — PDF" className="mb-3" />
      <Tabs
        variant="segmented"
        size="sm"
        ariaLabel="Hisobot davri"
        tabs={PERIODS}
        value={preset}
        onChange={setPreset}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
      />
      <Button variant="primary" icon={Sparkles} fullWidth loading={generating} onClick={handleDownload} className="mt-3">
        {generating ? 'Tayyorlanmoqda…' : `${current?.label ?? ''} — PDF hisobot`}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {lastLabel && !error && <p className="mt-2 truncate text-xs text-muted">Oxirgi: {lastLabel}</p>}
    </Card>
  );
}
