/* Ro'yxatdan o'tish havolasi va QR-kod — chop etish yoki yuborish uchun. */
import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { Button, Field, Modal, QrCode, useToast } from '../kit';

export function enrollUrl(group?: string): string {
  const base = `${window.location.origin}/royxatdan-otish`;
  const g = group?.trim();
  return g ? `${base}?guruh=${encodeURIComponent(g)}` : base;
}

export function EnrollLinkModal({ onClose, group: initialGroup = '' }: { onClose: () => void; group?: string }) {
  const toast = useToast();
  const [group, setGroup] = useState(initialGroup);
  const url = enrollUrl(group);

  return (
    <Modal title="Ro‘yxatdan o‘tish havolasi" onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-soft">
        Odam telefoni bilan QR-kodni skanerlaydi, JSHSHIR bilan o‘zini topadi va yuzini kamera orqali kiritadi.
      </p>
      <Field label="Guruh (ixtiyoriy)" hint="Guruh uchun alohida QR chop etmoqchi bo‘lsangiz" className="mt-4">
        <input className="input" value={group} onChange={(e) => setGroup(e.target.value.slice(0, 60))} placeholder="Masalan: DI-2301" />
      </Field>
      <div id="enroll-print" className="mt-5 flex flex-col items-center rounded-2xl border border-line p-5 text-center">
        {group.trim() && <p className="mb-2 text-[18px] font-semibold text-ink">{group.trim()}</p>}
        <QrCode value={url} className="h-52 w-52" />
        <p className="mt-3 text-[15px] font-medium text-ink">Yuzingizni ro‘yxatdan o‘tkazing</p>
        <p className="mt-1 break-all text-[13px] text-faint">{url}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          icon={Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast('Havola nusxalandi');
            } catch {
              toast('Nusxalab bo‘lmadi', 'bad');
            }
          }}
        >
          Nusxalash
        </Button>
        <Button icon={Printer} variant="primary" onClick={() => printCard()}>
          Chop etish
        </Button>
      </div>
    </Modal>
  );
}

/** Faqat QR kartani chop etadi (alohida oynada). */
function printCard() {
  const node = document.getElementById('enroll-print');
  if (!node) return;
  const win = window.open('', '_blank', 'width=600,height=800');
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>QR</title><style>body{font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:40px;color:#151B26}div{text-align:center}svg{width:320px;height:320px}p{margin:8px 0}</style></head><body><div>${node.innerHTML}</div></body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
