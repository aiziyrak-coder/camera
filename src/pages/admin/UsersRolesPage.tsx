import { useMemo, useState } from 'react';
import { Check, KeyRound, Lock, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  IconButton,
  Page,
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

export default function UsersRolesPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const { role: myRole, token } = useAuth();
  const { matrix, toggle } = usePermissions();
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
      key: 'name',
      header: 'Foydalanuvchi',
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{u.name}</p>
            <p className="truncate font-mono text-xs text-muted">{u.login}</p>
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
              {u.phone && <span className="tabular-nums">{u.phone}</span>}
              {u.telegramLinked && (
                <Badge tone="success" size="sm">
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
      cell: (u) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{u.lastLogin}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '6rem',
      mobileLabel: 'Amallar',
      cell: (u) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
          <IconButton icon={Pencil} label={`${u.name} — tahrirlash`} size="sm" onClick={() => setEditing(u)} />
          <IconButton icon={Trash2} label={`${u.name} — o'chirish`} size="sm" variant="danger" onClick={() => setDeleting(u)} />
        </div>
      ),
    },
  ];

  const permissionKeys = PERMISSION_KEYS.filter((key) => matrix[key]);

  const permissionColumns: DataTableColumn<PermissionKey>[] = [
    {
      key: 'permission',
      header: 'Huquq / Ruxsat',
      sortValue: (key) => PERMISSION_LABELS[key],
      cell: (key) => <span className="font-medium text-fg">{PERMISSION_LABELS[key]}</span>,
    },
    {
      key: 'superAdmin',
      header: 'Super Admin',
      align: 'center',
      width: '9rem',
      cell: (key) => <PermissionMark granted={matrix[key].superAdmin} locked label={`${PERMISSION_LABELS[key]} — Super Admin`} />,
    },
    {
      key: 'admin',
      header: 'Admin',
      align: 'center',
      width: '9rem',
      cell: (key) => (
        <PermissionMark
          granted={matrix[key].admin}
          label={`${PERMISSION_LABELS[key]} — Admin`}
          onToggle={canEdit ? () => toggle(key, 'admin') : undefined}
        />
      ),
    },
    {
      key: 'cameraSteward',
      header: "Kamera mas'uli",
      align: 'center',
      width: '9rem',
      cell: (key) => (
        <PermissionMark
          granted={matrix[key].cameraSteward}
          label={`${PERMISSION_LABELS[key]} — Kamera mas'uli`}
          onToggle={canEdit ? () => toggle(key, 'cameraSteward') : undefined}
        />
      ),
    },
  ];

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
      {tab === 'foydalanuvchilar' ? (
        <DataTable
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
      ) : (
        <div className="flex flex-col gap-3">
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
          <DataTable
            columns={permissionColumns}
            rows={permissionKeys}
            rowKey={(key) => key}
            emptyTitle="Huquqlar yuklanmadi"
            emptyDescription="Server huquqlar matritsasini qaytarmadi — sahifani yangilang."
            maxHeight="none"
            ariaLabel="Huquqlar matritsasi"
          />
        </div>
      )}

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
  locked,
  label,
  onToggle,
}: {
  granted: boolean;
  locked?: boolean;
  label: string;
  onToggle?: () => void;
}) {
  if (onToggle && !locked) {
    return (
      <span className="inline-flex justify-center">
        <Switch checked={granted} onChange={onToggle} label={label} />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`${label}: ${granted ? 'ruxsat bor' : "ruxsat yo'q"}`}
      title={locked ? "Super Admin huquqlari o'zgarmaydi" : undefined}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${granted ? 'bg-success-soft text-success' : 'bg-surface-2 text-subtle'}`}
    >
      {granted ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
    </span>
  );
}
