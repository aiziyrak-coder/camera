import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, MessageSquare, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import NotificationRuleModal from '../../components/notifications/NotificationRuleModal';
import NotificationStatusCard from '../../components/notifications/NotificationStatusCard';
import NotificationLogTable from '../../components/notifications/NotificationLogTable';
import MyTelegramCard from '../../components/notifications/MyTelegramCard';
import TestMessageModal from '../../components/notifications/TestMessageModal';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useAiModules } from '../../lib/useAiModules';
import { useApiResource } from '../../lib/useApiResource';
import { useBuildings } from '../../lib/useBuildings';
import {
  describeRuleFilters,
  kindLabel,
  notificationsApi,
  type NotificationRule,
  type NotificationStatus,
} from '../../lib/notificationsApi';

export default function NotificationsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { modules } = useAiModules();
  const { buildings } = useBuildings();
  const { data: status, loading: statusLoading } = useApiResource<NotificationStatus>('/api/notifications/status');

  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);

  const loadRules = useCallback(async () => {
    if (!token) return;
    setRulesLoading(true);
    try {
      setRules(await notificationsApi.rules(token));
      setRulesError(null);
    } catch (err) {
      setRulesError(err instanceof ApiError ? err.message : "Qoidalarni yuklab bo'lmadi — ulanishni tekshiring");
    } finally {
      setRulesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const moduleName = useMemo(() => {
    const byCode = new Map(modules.map((m) => [m.code, m.name]));
    return (code: number) => byCode.get(code) ?? `#${code}`;
  }, [modules]);
  const buildingName = useMemo(() => {
    const byId = new Map(buildings.map((b) => [b.id, b.name]));
    return (id: string) => byId.get(id) ?? "o'chirilgan bino";
  }, [buildings]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(rule: NotificationRule) {
    setEditing(rule);
    setModalOpen(true);
  }

  function handleSaved(saved: NotificationRule) {
    setRules((list) => {
      const exists = list.some((r) => r.id === saved.id);
      return exists ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved];
    });
    toast.success(editing ? 'Qoida saqlandi' : "Qoida qo'shildi");
  }

  async function toggleEnabled(rule: NotificationRule) {
    setTogglingId(rule.id);
    try {
      const saved = await notificationsApi.updateRule(rule.id, { enabled: !rule.enabled }, token);
      setRules((list) => list.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Qoidani o'zgartirib bo'lmadi");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    await notificationsApi.deleteRule(deleting.id, token);
    setRules((list) => list.filter((r) => r.id !== deleting.id));
    setDeleting(null);
    toast.success("Qoida o'chirildi");
  }

  const noChannel = status && !status.telegramConfigured && !status.smsConfigured;

  return (
    <div className="space-y-4">
      <section className="glass p-6">
        <PageHeader
          title="Bildirishnomalar"
          subtitle="AI hodisalari, kamera holati va turniket signallari — Telegram va SMS orqali"
          action={
            <button
              onClick={openCreate}
              className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700"
            >
              <Plus size={14} />
              Yangi qoida
            </button>
          }
        />
        {noChannel && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700">
            Hech bir kanal sozlanmagan — qoidalar saqlanadi, lekin xabar yuborilmaydi. Server .env faylida
            TELEGRAM_BOT_TOKEN yoki Eskiz sozlamalarini kiriting.
          </p>
        )}

        {rulesError && <ErrorState message={rulesError} onRetry={loadRules} />}
        {rulesLoading && rules.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : rules.length === 0 && !rulesError ? (
          <EmptyState
            icon={<BellRing size={18} />}
            title="Hali qoida yo'q"
            description="Qoida kim, qaysi kanal orqali va qanday signallar haqida xabar olishini belgilaydi. Masalan: yuqori darajali AI hodisalari — navbatchilar Telegram guruhiga."
            action={
              <button onClick={openCreate} className="btn-glass flex items-center gap-1.5 text-xs">
                <Plus size={13} /> Birinchi qoidani qo'shish
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rules.map((rule) => {
              const filters = describeRuleFilters(rule, moduleName, buildingName);
              const ChannelIcon = rule.channel === 'telegram' ? Send : MessageSquare;
              return (
                <div key={rule.id} className={`glass-deep flex flex-col gap-2 p-4 ${rule.enabled ? '' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      <ChannelIcon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{rule.name}</p>
                      <p className="truncate font-mono text-[11px] text-slate-500" title={rule.recipients.join(', ')}>
                        {rule.channel === 'telegram' ? 'Telegram' : 'SMS'} · {rule.recipients.join(', ')}
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={togglingId === rule.id}
                        onChange={() => toggleEnabled(rule)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {rule.enabled ? 'Yoqilgan' : "O'chiq"}
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rule.kinds.map((kind) => (
                      <Badge key={kind} tone="indigo">
                        {kindLabel(kind)}
                      </Badge>
                    ))}
                  </div>
                  {filters.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-slate-500">
                      {filters.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto flex justify-end gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => openEdit(rule)}
                      aria-label={`${rule.name} ni tahrirlash`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/70 hover:text-indigo-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(rule)}
                      aria-label={`${rule.name} ni o'chirish`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NotificationStatusCard status={status} loading={statusLoading} onTest={() => setTestOpen(true)} />
        <MyTelegramCard />
      </div>

      <NotificationLogTable refreshKey={logRefresh} />

      <NotificationRuleModal open={modalOpen} rule={editing} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      <TestMessageModal
        open={testOpen}
        status={status}
        onClose={() => setTestOpen(false)}
        onSent={() => setLogRefresh((n) => n + 1)}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Qoidani o'chirish"
        message={`"${deleting?.name ?? ''}" qoidasi o'chiriladi — unga ko'ra xabarlar endi yuborilmaydi.`}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
