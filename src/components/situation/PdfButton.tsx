import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadPdf } from '../../lib/pdfDownload';
import { Button, useToast } from '../../ui';

/** "PDF" tugmasi — ekrandagi filtr natijasini PDF qilib yuklab oladi. */
export default function PdfButton({
  path,
  params,
  filename,
  label = 'PDF',
}: {
  path: string;
  params: Record<string, string | number | undefined | null>;
  filename: string;
  label?: string;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await downloadPdf(path, params, filename, token);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'PDF ni yuklab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" icon={FileDown} onClick={run} disabled={busy} title="Filtr natijasini PDF qilib yuklab olish">
      {busy ? 'Tayyorlanmoqda…' : label}
    </Button>
  );
}
