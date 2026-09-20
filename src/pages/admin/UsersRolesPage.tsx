import { useMemo, useState } from 'react';
import { Check, KeyRound, Lock, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CodeText,
  ConfirmDialog,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  IconButton,
  IntelPanel,
  MicroLabel,
  Page,
  cn,
  useToast,
  useUrlTab,
  type DataTableColumn,
  type TabItem,
  type Tone,
} from '../../ui';
import AddUserModal from '../../components/admin/AddUserModal';
import EditUserModal from '../../components/admin/EditUserModal';
import { Notice, Switch, pagerFooter } from '../../components/settings/kit';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { buildReference, recordCode } from '../../components/admin/registryCodes';
import { branding } from '../../lib/branding';
import { PERMISSION_LABELS, usePermissions, type PermissionKey } from '../../lib/permissions';
import type { AdminUser } from '../../types';

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];
const PAGE_SIZE = 9;

const ROLE_TONE: Record<AdminUser['role'], Tone> = {
  'Super Admin': 'primary',
  Admin: 'info',
  "Kamera mas'uli": 'neutral',
};

type TabId = 'foydalanuvchilar' | 'huquqlar';

/** Ustun sarlavhasi — bosh harfli mikro-yorliq (blankdagi ustun nomi). */
function ColumnHead({ label, note }: { label: string; note?: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <MicroLabel className="!text-fg">{label}</MicroLabel>
      {note && <MicroLabel>{note}</MicroLabel>}
    </span>
  );
}

/** Hujjat qachon ekranga chiqarilgani. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

export default function UsersRolesPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const { role: myRole, token, userName } = useAuth();
  const { matrix, toggle, saveError, clearSaveError } = usePermissions();
  // Serverga ketayotgan huquq o'zgarishlari. PATCH /api/permissions/{key}
  // — "teskarisiga o'zgartir" buyrug'i, shuning uchun ikki marta tez
  // bosilsa ikki marta aylanib, natija boshlang'ich holatga qaytardi.
  const [pendingPermissions, setPendingPermissions] = useState<PermissionKey[]>([]);
  const {
    items: users,
    page,
    setPage,
    totalPages,
    total,
    pageSize,
    loading,
    error,
    reload,
  } = useServerPage<AdminUser>('/api/users', {}, PAGE_SIZE);

  const canEdit = myRole === 'super-admin';

  const tabs = useMemo<TabItem<TabId>[]>(
    () => [
      { id: 'foydalanuvchilar', label: 'Foydalanuvchilar', icon: Users, count: loading && users.length === 0 ? null : total },
      { id: 'huquqlar', label: 'Huquqlar matritsasi', icon: KeyRound },
    ],
    [loading, users.length, total],
  );
  const [tab] = useUrlTab(tabs);

  function refresh() {
    invalidateServerPageCache('/api/users');
    reload();
  }

  /** Server (app/routers/users.py) rad etadigan o'chirishlar — sababi bilan.
   *  Hisob egasi `userName` orqali taxmin qilinadi: aniq tekshiruv baribir
   *  serverda, bu faqat behuda bosishning oldini oladi. */
  function deleteBlockReason(user: AdminUser): string | null {
    if (userName && user.name === userName) return "O'zingizni o'chira olmaysiz";
    if (user.role === 'Super Admin' && myRole !== 'super-admin') {
      return "Super Admin hisobini faqat Super Admin o'chira oladi";
    }
    return null;
  }

  async function handleDelete() {
    if (!deleting) return;
    // Xato bo'lsa ConfirmDialog o'zi ko'rsatadi va yopilmaydi.
    await api.del(`/api/users/${deleting.id}`, token);
    toast.success(`${deleting.name} o'chirildi`);
    setDeleting(null);
    refresh();
  }

  const userColumns: DataTableColumn<AdminUser>[] = [
    {
      // Hisob kodi — hujjatda va murojaatda ismni takrorlamaslik uchun.
      key: 'code',
      header: 'Kod',
      width: '6.5rem',
      mono: true,
      cell: (u) => <CodeText className="text-[12px] text-subtle">{recordCode('FOY', u.id)}</CodeText>,
    },
    {
      key: 'name',
      header: 'Foydalanuvchi',
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{u.name}</p>
            <CodeText className="block truncate text-[11px] text-muted">{u.login}</CodeText>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      sortValue: (u) => u.role,
      cell: (u) => (
        <Badge tone={ROLE_TONE[u.role] ?? 'neutral'} dot>
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Aloqa',
      hideOnMobile: true,
      cell: (u) =>
        u.email || u.phone || u.telegramLinked ? (
          <div className="min-w-0 text-[13px]">
            {u.email && <p className="truncate text-fg">{u.email}</p>}
            <p className="flex flex-wrap items-center gap-1.5 text-muted">
              {u.phone && <CodeText className="text-[12px]">{u.phone}</CodeText>}
              {/* Yalang'och "Telegram" nishoni nimani bildirishi tushunarsiz
                  edi — bu telefon raqami emas, bog'langan Telegram hisobi. */}
              {u.telegramLinked && (
                <Badge tone="success" size="sm" title="Telegram hisobi bog'langan — bildirishnomalar shu yerga keladi">
                  Telegram
                </Badge>
              )}
            </p>
          </div>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'lastLogin',
      header: 'Oxirgi kirish',
      sortValue: (u) => u.lastLogin,
      mono: true,
      cell: (u) => <CodeText className="whitespace-nowrap text-[12px] text-muted">{u.lastLogin}</CodeText>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Amallar</span>,
      align: 'right',
      width: '6rem',
      mobileLabel: 'Amallar',
      cell: (u) => {
        const blocked = deleteBlockReason(u);
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
            <IconButton icon={Pencil} label={`${u.name} — tahrirlash`} size="sm" onClick={() => setEditing(u)} />
            {/* Server rad etadigan tugma bosiladigan holda turmasin —
                sababi tooltipda va ekran o'quvchi uchun yorliqda. */}
            <IconButton
              icon={Trash2}
              label={blocked ? `${u.name} — o'chirib bo'lmaydi: ${blocked}` : `${u.name} — o'chirish`}
              title={blocked ?? undefined}
              size="sm"
              variant="danger"
              disabled={Boolean(blocked)}
              onClick={() => setDeleting(u)}
            />
          </div>
        );
      },
    },
  ];

  const permissionKeys = PERMISSION_KEYS.filter((key) => matrix[key]);

  /** Bir kalit bo'yicha bir vaqtda bitta so'rov — tez ikki bosish
   *  serverdagi qiymatni ikki marta aylantirib qo'ymasin. */
  function togglePermission(key: PermissionKey, column: 'admin' | 'cameraSteward') {
    if (pendingPermissions.includes(key)) return;
    setPendingPermissions((prev) => [...prev, key]);
    toggle(key, column);
    // `toggle` promise qaytarmaydi (lib/permissions.tsx) — optimistik
    // qiymat darhol yangilanadi, javob esa keyin keladi. Qisqa qulf
    // qo'sh bosishni to'xtatish uchun yetarli.
    window.setTimeout(() => setPendingPermissions((prev) => prev.filter((k) => k !== key)), 600);
  }

  const permissionColumns: DataTableColumn<PermissionKey>[] = [
    {
      key: 'permission',
      header: <ColumnHead label="Huquq / ruxsat" />,
      sortValue: (key) => PERMISSION_LABELS[key],
      cell: (key, index) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <CodeText className="shrink-0 text-[11px] text-subtle">{`HQ-${String(index + 1).padStart(2, '0')}`}</CodeText>
          <span className="min-w-0 text-[13px] font-medium text-fg">{PERMISSION_LABELS[key]}</span>
        </span>
      ),
    },
    {
      key: 'superAdmin',
      header: <ColumnHead label="Super Admin" note="Qulflangan" />,
      align: 'center',
      width: '9rem',
      cell: (key) => (
        <PermissionMark
          granted={matrix[key].superAdmin}
          lockedReason="Super Admin huquqlari o'zgarmaydi — aks holda tizimga kirish yo'li yopilib qolardi"
          label={`${PERMISSION_LABELS[key]} — Super Admin`}
        />
      ),
    },
    {
      key: 'admin',
      header: <ColumnHead label="Admin" note={canEdit ? "O'zgartirsa bo'ladi" : "Faqat ko'rish"} />,
      align: 'center',
      width: '9rem',
      cell: (key) => (
        <PermissionMark
          granted={matrix[key].admin}
          label={`${PERMISSION_LABELS[key]} — Admin`}
          busy={pendingPermissions.includes(key)}
          onToggle={canEdit ? () => togglePermission(key, 'admin') : undefined}
        />
      ),
    },
    {
      key: 'cameraSteward',
      header: <ColumnHead label="Kamera mas'uli" note={canEdit ? "O'zgartirsa bo'ladi" : "Faqat ko'rish"} />,
      align: 'center',
      width: '9rem',
      cell: (key) => (
        <PermissionMark
          granted={matrix[key].cameraSteward}
          label={`${PERMISSION_LABELS[key]} — Kamera mas'uli`}
          busy={pendingPermissions.includes(key)}
          onToggle={canEdit ? () => togglePermission(key, 'cameraSteward') : undefined}
        />
      ),
    },
  ];

  // Varaq raqami — bo'lim va ro'yxat hajmidan; vaqt ishtirok etmaydi.
  const reference = buildReference('ACL', [tab], [String(total), String(permissionKeys.length), canEdit ? 'tahrir' : 'korish']);
  const generatedAt = stamp();

  return (
    <Page
      title="Foydalanuvchilar"
      subtitle="Tizimga kiruvchi xodimlar, ularning rollari va rollar huquqlari."
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Foydalanuvchilar' }]}
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
          Foydalanuvchi qo&apos;shish
        </Button>
      }
      tabs={tabs}
    >
      {/* 1. Hujjat blanki: kim kira oladi va qaysi rol nimaga haqli. */}
      <DocumentHeader
        org={branding.orgFullName}
        title={tab === 'huquqlar' ? 'Rollar huquqlari varag‘i' : 'Tizim foydalanuvchilari'}
        reference={reference}
        generatedAt={generatedAt}
        readouts={[
          { label: 'Hisoblar', value: loading && users.length === 0 ? '—' : `${total} ta` },
          { label: 'Rollar', value: '3 ta', title: "Super Admin, Admin, Kamera mas'uli" },
          { label: 'Huquqlar', value: `${permissionKeys.length} ta` },
          { label: 'Sizning huquqingiz', value: canEdit ? "O'zgartirish" : "Faqat ko'rish" },
        ]}
      />

      {tab === 'foydalanuvchilar' ? (
        <IntelPanel title="Tizim foydalanuvchilari" code={reference} right={<MicroLabel>{total} ta hisob</MicroLabel>} brackets={false}>
        <DataTable
          dense
          columns={userColumns}
          rows={users}
          rowKey={(u) => u.id}
          onRowClick={(u) => setEditing(u)}
          selectedKey={editing?.id ?? null}
          loading={loading && users.length === 0}
          loadingRows={PAGE_SIZE}
          error={users.length === 0 ? error : null}
          onRetry={reload}
          emptyTitle="Foydalanuvchi yo'q"
          emptyDescription="Tizimga kirishi kerak bo'lgan xodimni qo'shing va unga rol bering."
          emptyAction={
            <Button variant="primary" icon={UserPlus} onClick={() => setModalOpen(true)}>
              Foydalanuvchi qo&apos;shish
            </Button>
          }
          ariaLabel="Foydalanuvchilar"
          maxHeight="none"
          footer={
            error && users.length > 0 ? (
              <Notice tone="danger" action={<Button size="sm" onClick={reload}>Qayta urinish</Button>}>
                {error}
              </Notice>
            ) : (
              pagerFooter({ page, totalPages, total, pageSize, onChange: setPage })
            )
          }
        />
        </IntelPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {saveError && (
            <Notice
              tone="danger"
              action={
                <Button size="sm" onClick={clearSaveError}>
                  Yopish
                </Button>
              }
            >
              {saveError}
            </Notice>
          )}
          {canEdit ? (
            <Notice tone="info">
              Bu yerdagi sozlamalar navigatsiya menyusi va eksport tugmalarini haqiqatda cheklaydi — &quot;Admin&quot;
              sifatida kirsangiz, o&apos;chirilgan bo&apos;limlar menyuda ko&apos;rinmaydi. Super Admin huquqlari
              o&apos;zgarmaydi.
            </Notice>
          ) : (
            <Notice tone="neutral" icon={Lock}>
              Faqat Super Admin tahrirlashi mumkin. Bu sozlamalar navigatsiya menyusi va eksport tugmalarini haqiqatda
              cheklaydi.
            </Notice>
          )}
          <IntelPanel
            title="Huquqlar matritsasi"
            code={reference}
            right={<MicroLabel>{permissionKeys.length} ta qator · 3 ta rol</MicroLabel>}
            brackets={false}
          >
            <DataTable
              dense
              columns={permissionColumns}
              rows={permissionKeys}
              rowKey={(key) => key}
              emptyTitle="Huquqlar yuklanmadi"
              emptyDescription="Server huquqlar matritsasini qaytarmadi — sahifani yangilang."
              maxHeight="none"
              ariaLabel="Huquqlar matritsasi"
            />
            {/* Belgilar izohi: qulf nima uchun turganini varaqning o'zi aytadi. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-3 py-1.5">
              <MicroLabel>Belgilar</MicroLabel>
              <span className="intel-code text-[11px] text-muted">✓ — ruxsat bor</span>
              <span className="intel-code text-[11px] text-muted">✕ — ruxsat yo&apos;q</span>
              <span className="intel-code inline-flex items-center gap-1 text-[11px] text-muted">
                <Lock size={11} aria-hidden="true" /> — qulflangan (Super Admin ustuni o&apos;zgarmaydi)
              </span>
            </div>
          </IntelPanel>
        </div>
      )}

      <DocumentFooter
        note={`Xizmat uchun. Varaq ${reference} raqami bilan tizimda tuzilgan. Bu yerdagi belgilar navigatsiya menyusi va eksport tugmalarini haqiqatda cheklaydi.`}
      />

      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={(user) => {
          toast.success(`${user.name} qo'shildi`);
          refresh();
        }}
      />
      <EditUserModal
        user={editing}
        onClose={() => setEditing(null)}
        onSave={(user) => {
          toast.success(`${user.name} — o'zgarishlar saqlandi`);
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Foydalanuvchini o'chirish"
        message={
          deleting
            ? `"${deleting.name}" (${deleting.login}) foydalanuvchisini o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.`
            : ''
        }
        confirmLabel="O'chirish"
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </Page>
  );
}

function PermissionMark({
  granted,
  lockedReason,
  label,
  busy,
  onToggle,
}: {
  granted: boolean;
  /** Qulflangan bo'lsa — NEGA qulflanganining izohi (bo'sh tooltip emas). */
  lockedReason?: string;
  label: string;
  busy?: boolean;
  onToggle?: () => void;
}) {
  if (onToggle && !lockedReason) {
    return (
      <span className="inline-flex justify-center">
        <Switch checked={granted} onChange={onToggle} label={label} disabled={busy} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <span
        role="img"
        aria-label={`${label}: ${granted ? 'ruxsat bor' : "ruxsat yo'q"}${lockedReason ? `. ${lockedReason}` : ''}`}
        title={lockedReason}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center border',
          granted ? 'border-success/40 bg-success-soft text-success' : 'border-border bg-surface-2 text-subtle',
        )}
      >
        {granted ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
      </span>
      {/* Qulf belgisi ko'rinadigan sabab: ilgari faqat tooltip bor edi va
          klaviatura bilan yurgan foydalanuvchi uni umuman ko'rmasdi.
          Endi qulf yonida so'zi ham turadi — belgi yolg'iz qolmaydi. */}
      {lockedReason && (
        <span className="inline-flex items-center gap-1 text-subtle" title={lockedReason}>
          <Lock size={11} aria-hidden="true" />
          <MicroLabel>Qulf</MicroLabel>
        </span>
      )}
    </span>
  );
}
