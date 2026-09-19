import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button, Modal, cn } from '../../ui';
import { Notice } from '../settings/kit';
import { webhookUrl } from '../../lib/integrationsApi';
import { copyText } from './clipboard';

function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium text-fg">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            'min-w-0 flex-1 break-all rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-xs',
            secret ? 'text-primary' : 'text-fg',
          )}
        >
          {value}
        </code>
        <Button
          size="sm"
          icon={copied ? Check : Copy}
          aria-label={`${label} — nusxa olish`}
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }
          }}
        >
          {copied ? 'Olindi' : 'Nusxa'}
        </Button>
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
    <Modal
      open={open}
      onClose={onClose}
      title="Webhook API kaliti"
      description={deviceName}
      size="lg"
      dismissible={false}
      footer={
        <Button variant="primary" onClick={onClose}>
          Saqladim, yopish
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Notice tone="warning" icon={KeyRound}>
          <b>{deviceName}</b> uchun kalit. Uni hozir nusxalab, qurilma yoki oraliq dastur sozlamasiga kiriting —{' '}
          <b>bu oyna yopilgach kalit qayta ko'rsatilmaydi</b>. Yo'qotilsa, “Kalitni almashtirish” orqali yangisi beriladi
          (eskisi darhol ishlamay qoladi).
        </Notice>
        <CopyRow label="Webhook manzili (POST)" value={url} />
        <CopyRow label="X-Api-Key sarlavhasi" value={apiKey} secret />
        <div className="rounded-control border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <p className="mb-1 font-medium text-fg">So'rov namunasi:</p>
          <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] text-fg">{`POST ${url}
X-Api-Key: <kalit>
Content-Type: application/json

{"events": [{"id": "123", "time": "2026-09-19T08:05:00+05:00",
             "cardNo": "0012345", "direction": "kirish", "granted": true}]}`}</pre>
        </div>
      </div>
    </Modal>
  );
}
