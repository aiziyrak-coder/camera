import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, ScanFace, ShieldCheck } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { fetchConsentText, type ConsentText } from '../../lib/enrollment';

interface EnrollmentConsentProps {
  /** Odam belgi qo'ydimi — sahifa uni /submit ga uzatadi. */
  onContinue: (consent: boolean) => void;
  onBack: () => void;
}

/** Yuzni skanerlashdan OLDINGI qadam: biometrik ma'lumotni qayta ishlashga
 *  rozilik. Matn serverdan olinadi (muddatlar va operator nomi server
 *  sozlamalarida) — shu sababli matnni o'qib bo'lmasa, davom etish ham
 *  mumkin emas: odam nimaga rozi bo'layotganini bilmay belgi qo'ymasligi
 *  kerak. */
export default function EnrollmentConsent({ onContinue, onBack }: EnrollmentConsentProps) {
  const [text, setText] = useState<ConsentText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchConsentText()
      .then((data) => {
        if (!cancelled) setText(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Rozilik matnini yuklab bo'lmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
        >
          <RotateCcw size={15} />
          Qayta urinish
        </button>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const canContinue = agreed || !text.required;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-indigo-500" />
        <div>
          <p className="text-sm font-bold text-slate-900">{text.title}</p>
          <p className="text-xs text-slate-500">
            Ma'lumotlar operatori: {text.controller} · Matn versiyasi: {text.version}
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        Kameralar sizni tanishi uchun yuzingiz tasviri va undan olingan raqamli shablon saqlanadi. Ular faqat davomat
        va bino xavfsizligi uchun ishlatiladi, rozilikni esa istalgan vaqtda qaytarib olishingiz mumkin.
      </p>

      <div className="rounded-xl border border-white/80 bg-white/50">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="consent-full-text"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-indigo-600"
        >
          {expanded ? "To'liq matnni yashirish" : "To'liq matnni o'qish"}
          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div id="consent-full-text" className="max-h-72 space-y-3 overflow-y-auto border-t border-white/80 px-3 py-3">
            {text.sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-bold text-slate-700">{section.title}</p>
                <p className="text-xs leading-relaxed text-slate-600">{section.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
        />
        <span className="text-xs leading-relaxed text-slate-700">
          <span className="font-bold">Roziman.</span> {text.statement}
        </span>
      </label>

      <button
        type="button"
        onClick={() => onContinue(agreed)}
        disabled={!canContinue}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ScanFace size={16} />
        Yuzni skanerlashga o'tish
      </button>
      {!canContinue && (
        <p className="-mt-2 text-center text-[11px] text-slate-400">Davom etish uchun rozilik belgisini qo'ying</p>
      )}
      <button type="button" onClick={onBack} className="text-xs font-medium text-slate-400 hover:text-slate-600">
        Orqaga
      </button>
    </div>
  );
}
