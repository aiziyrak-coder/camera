import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import Modal from '../Modal';
import { webhookUrl } from '../../lib/integrationsApi';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Eski brauzer yoki HTTP (clipboard API faqat xavfsiz kontekstda).
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 break-all rounded-xl border border-white/80 bg-white/70 px-3 py-2 font-mono text-xs ${secret ? 'text-indigo-800' : 'text-slate-800'}`}>
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="btn-glass flex shrink-0 items-center gap-1"
          aria-label={`${label} — nusxa olish`}
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          {copied ? 'Olindi' : 'Nusxa'}
        </button>
      </div>
    </div>
  );
}

/** API kalit faqat shu oynada, bir marta ko'rsatiladi — serverda faqat xeshi saqlanadi. */
export default function ApiKeyDialog({
  open,
  deviceName,
  apiKey,
  webhookPath,
  onClose,
}: {
  open: boolean;
  deviceName: string;
  apiKey: string;
  webhookPath: string;
  onClose: () => void;
}) {
  const url = webhookUrl(webhookPath);
  return (
    <Modal open={open} onClose={onClose} title="Webhook API kaliti" maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <KeyRound size={16} className="mt-0.5 shrink-0" />
          <p>
            <b>{deviceName}</b> uchun kalit. Uni hozir nusxalab, qurilma yoki oraliq dastur sozlamasiga kiriting —{' '}
            <b>bu oyna yopilgach kalit qayta ko'rsatilmaydi</b>. Yo'qotilsa, “Kalitni almashtirish” orqali yangisi
            beriladi (eskisi darhol ishlamay qoladi).
          </p>
        </div>
        <CopyRow label="Webhook manzili (POST)" value={url} />
        <CopyRow label="X-Api-Key sarlavhasi" value={apiKey} secret />
        <div className="rounded-xl bg-white/50 px-3 py-2.5 text-xs text-slate-600">
          <p className="mb-1 font-semibold">So'rov namunasi:</p>
          <pre className="overflow-x-auto whitespace-pre font-mono text-[11px]">{`POST ${url}
X-Api-Key: <kalit>
Content-Type: application/json

{"events": [{"id": "123", "time": "2026-09-19T08:05:00+05:00",
             "cardNo": "0012345", "direction": "kirish", "granted": true}]}`}</pre>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-glass !bg-indigo-600 !text-white hover:!bg-indigo-700">
            Saqladim, yopish
          </button>
        </div>
      </div>
    </Modal>
  );
}
