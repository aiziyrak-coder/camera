import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, UserSearch } from 'lucide-react';
import { DataTable, IconButton, Select, Toolbar, formatNumber, useToast, type DataTableColumn } from '../../ui';
import { Notice } from '../settings/kit';
import { useAuth } from '../../lib/auth';
import { formatDateTime, integrationsApi, peopleSearchLink, type UnmatchedCredential } from '../../lib/integrationsApi';
import { copyText } from './clipboard';

const UNMATCHED_DAY_OPTIONS = [1, 7, 30, 90];

/** Davr tanlovi — sahifaning `toolbar` joyida. */
export function UnmatchedToolbar({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <Toolbar>
      <Select
        label="Davr:"
        value={String(days)}
        onChange={(v) => onChange(Number(v))}
        options={UNMATCHED_DAY_OPTIONS.map((d) => ({ value: String(d), label: `Oxirgi ${d} kun` }))}
      />
    </Toolbar>
  );
}

function credentialValue(item: UnmatchedCredential): string {
  return item.cardNumber ?? item.employeeNo ?? '';
}

/** Turniketda ko'ringan, lekin hech kimga biriktirilmagan karta/xodim
 *  raqamlari. Admin raqamni nusxalab, reestrda kerakli odamning
 *  kartasiga yozadi — shundan keyin raqam bu ro'yxatdan chiqadi. */
export default function UnmatchedPanel({ days = 7 }: { days?: number }) {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<UnmatchedCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await integrationsApi.unmatched(days, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [days, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<UnmatchedCredential>[] = [
    {
      key: 'card',
      header: 'Karta raqami',
      sortValue: (i) => i.cardNumber,
      cell: (i) => <span className="font-mono text-xs text-fg">{i.cardNumber ?? '—'}</span>,
    },
    {
      key: 'employeeNo',
      header: 'Xodim raqami',
      sortValue: (i) => i.employeeNo,
      cell: (i) => <span className="font-mono text-xs text-fg">{i.employeeNo ?? '—'}</span>,
    },
    {
      key: 'count',
      header: "O'tishlar",
      align: 'right',
      sortValue: (i) => i.count,
      sortFirst: 'desc',
      cell: (i) => (
        <span className="text-[13px]">
          {formatNumber(i.count)}
          {i.deniedCount > 0 && <span className="ml-1 text-danger">({formatNumber(i.deniedCount)} rad)</span>}
        </span>
      ),
    },
    {
      key: 'lastSeen',
      header: 'Oxirgi marta',
      sortValue: (i) => i.lastSeen,
      sortFirst: 'desc',
      cell: (i) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{formatDateTime(i.lastSeen)}</span>,
    },
    {
      key: 'device',
      header: 'Qurilma',
      hideOnMobile: true,
      cell: (i) => <span className="text-[13px]">{i.lastDeviceName ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: 'Amallar',
      align: 'right',
      cell: (i) => {
        const value = credentialValue(i);
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
            <IconButton
              icon={Copy}
              label="Raqamni nusxalash"
              size="sm"
              onClick={async () => {
                if (await copyText(value)) toast.info(`${value} nusxalandi`);
              }}
            />
            <IconButton icon={UserSearch} label="Reestrda qidirish" size="sm" onClick={() => navigate(peopleSearchLink(value))} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        Raqamni nusxalang va reestrda egasining “Karta raqami” maydoniga kiriting — shundan keyin u bu ro'yxatdan chiqadi.
      </Notice>
      <DataTable
        columns={columns}
        rows={items ?? []}
        rowKey={(i) => `${i.cardNumber}|${i.employeeNo}`}
        defaultSort={{ key: 'lastSeen', dir: 'desc' }}
        loading={items === null || (loading && items.length === 0)}
        error={error}
        onRetry={() => void load()}
        emptyTitle="Hammasi biriktirilgan"
        emptyDescription="Bu davrda noma'lum karta yoki xodim raqami ko'rinmadi."
        ariaLabel="Biriktirilmagan kartalar"
        maxHeight="none"
        footer={items && items.length > 0 ? <span className="text-[13px] tabular-nums text-muted">Jami: {formatNumber(items.length)} ta</span> : undefined}
      />
    </div>
  );
}
