import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Brain, CalendarClock, FileUp, Loader2, Moon, Plus, Presentation, Timer, Trash2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import Badge from '../../components/Badge';
import ConfirmDialog from '../../components/ConfirmDialog';
import ScheduleLessonModal from '../../components/admin/ScheduleLessonModal';
import LessonImportModal from '../../components/admin/LessonImportModal';
import { api, fetchAllPages } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { formatLessonScheduleTime, isLessonScheduleComplete } from '../../lib/lessonSchedule';
import { AXIS_COLOR, GRID_COLOR } from '../../lib/chartTheme';
import type { LessonSession } from '../../types';

type ScheduleFilter = 'all' | 'scheduled' | 'pending' | 'ai_ready';

/** O'lchanmagan qiymat — "—", "0%" emas: 0% haqiqiy natija bo'lishi mumkin. */
function percentLabel(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function average(values: (number | null)[]): number | null {
  const measured = values.filter((value): value is number => value !== null);
  if (!measured.length) return null;
  return Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length);
}

export default function TeachingPage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<LessonSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<LessonSession | null>(null);
  const [scheduling, setScheduling] = useState<LessonSession | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchAllPages<LessonSession>('/api/lesson-sessions', token)
      .then((items) => {
        if (!cancelled) {
          setSessions(items);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function handleDelete() {
    if (!deleting) return;
    await api.del(`/api/lesson-sessions/${deleting.id}`, token);
    setDeleting(null);
    setReloadKey((k) => k + 1);
  }

  const groups = useMemo(() => Array.from(new Set(sessions.map((s) => s.group))), [sessions]);

  const filtered = useMemo(() => {
    let rows = groupFilter ? sessions.filter((s) => s.group === groupFilter) : sessions;
    if (scheduleFilter === 'scheduled') {
      rows = rows.filter((s) => !!s.scheduledStartTime);
    } else if (scheduleFilter === 'pending') {
      rows = rows.filter((s) => !s.scheduledStartTime);
    } else if (scheduleFilter === 'ai_ready') {
      rows = rows.filter(isLessonScheduleComplete);
    }
    return rows;
  }, [sessions, groupFilter, scheduleFilter]);

  // O'rtachalar faqat O'LCHANGAN darslardan: o'lchovi yo'q dars "0%" emas.
  const stats = useMemo(() => {
    const attention = average(filtered.map((s) => s.attentionScore));
    const activity = average(filtered.map((s) => s.teacherActivityScore));
    const sleep = filtered.reduce((sum, s) => sum + s.sleepIncidents, 0);
    const checked = filtered.filter((s) => s.teacherOnTime !== null);
    const onTime = checked.length
      ? Math.round((checked.filter((s) => s.teacherOnTime).length / checked.length) * 100)
      : null;
    return { attention, sleep, activity, onTime };
  }, [filtered]);

  const trendData = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number; count: number }>();
    for (const s of filtered) {
      if (s.attentionScore === null) continue;
      const entry = byDate.get(s.date) ?? { date: s.date, total: 0, count: 0 };
      entry.total += s.attentionScore;
      entry.count += 1;
      byDate.set(s.date, entry);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date.slice(5), diqqat: Math.round(e.total / e.count) }));
  }, [filtered]);

  const teacherData = useMemo(() => {
    const byTeacher = new Map<string, { teacher: string; total: number; count: number }>();
    for (const s of filtered) {
      if (s.teacherActivityScore === null) continue;
      const entry = byTeacher.get(s.teacher) ?? { teacher: s.teacher, total: 0, count: 0 };
      entry.total += s.teacherActivityScore;
      entry.count += 1;
      byTeacher.set(s.teacher, entry);
    }
    return Array.from(byTeacher.values()).map((e) => ({
      teacher: e.teacher.replace(/^(Prof\.|Dots\.)\s*/, ''),
      faollik: Math.round(e.total / e.count),
    }));
  }, [filtered]);

  return (
    <section className="glass p-6">
      <PageHeader
        title="Dars monitoring paneli"
        subtitle="Talaba diqqati va o'qituvchi faolligi bo'yicha tahlil (TT 3-E bo'limi)"
        action={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => setImportOpen(true)}
              className="btn-glass flex items-center gap-1.5"
            >
              <FileUp size={14} />
              CSV import
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700"
            >
              <Plus size={14} />
              Yangi dars rejalashtirish
            </button>
            <span className="mx-1 w-px self-stretch bg-white/80" />
            <button
              onClick={() => setGroupFilter(null)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                !groupFilter ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
              }`}
            >
              Barcha guruhlar
            </button>
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  groupFilter === g ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
                }`}
              >
                {g}
              </button>
            ))}
            <span className="mx-1 w-px self-stretch bg-white/80" />
            {(
              [
                ['all', 'Barchasi'],
                ['ai_ready', 'AI tayyor'],
                ['scheduled', 'Jadval bor'],
                ['pending', 'Jadvalsiz'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScheduleFilter(key)}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  scheduleFilter === key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/60 text-slate-600 hover:bg-white/90'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Brain size={20} />} value={percentLabel(stats.attention)} label="O'rtacha diqqat" tone="indigo" />
        <StatCard icon={<Moon size={20} />} value={stats.sleep} label="Uxlash holatlari" tone="amber" />
        <StatCard icon={<Presentation size={20} />} value={percentLabel(stats.activity)} label="O'qituvchi faolligi" tone="green" />
        <StatCard icon={<Timer size={20} />} value={percentLabel(stats.onTime)} label="Vaqtida kelish" tone="indigo" />
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="glass-deep p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Diqqat balli trendi
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }}
                      formatter={(v) => [`${v}%`, 'Diqqat']}
                    />
                    <Line type="monotone" dataKey="diqqat" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-deep p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                O'qituvchilar bo'yicha faollik
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teacherData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="teacher"
                      tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }}
                      formatter={(v) => [`${v}%`, 'Faollik']}
                    />
                    <Bar dataKey="faollik" fill="#22c55e" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              Hali dars monitoring yozuvlari yo'q
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/70">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Sana</th>
                    <th className="px-4 py-3">Guruh</th>
                    <th className="px-4 py-3">Fan</th>
                    <th className="px-4 py-3">O'qituvchi</th>
                    <th className="px-4 py-3">Diqqat</th>
                    <th className="px-4 py-3">Uxlash</th>
                    <th className="px-4 py-3">Faollik</th>
                    <th className="px-4 py-3">Vaqtida</th>
                    <th className="px-4 py-3">Jadval</th>
                    <th className="px-4 py-3">AI holati</th>
                    <th className="px-4 py-3">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/60">
                  {filtered.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-white/40">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {s.date}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.group}</td>
                      <td className="px-4 py-3 text-slate-700">{s.subject}</td>
                      <td className="px-4 py-3 text-slate-700">{s.teacher}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {percentLabel(s.attentionScore)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.sleepIncidents}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {percentLabel(s.teacherActivityScore)}
                      </td>
                      <td className="px-4 py-3">
                        {s.teacherOnTime === null ? (
                          <span className="text-slate-400" title="Tekshirilmagan">
                            —
                          </span>
                        ) : (
                          <Badge tone={s.teacherOnTime ? 'green' : 'amber'}>
                            {s.teacherOnTime ? 'Ha' : "Yo'q"}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatLessonScheduleTime(s.scheduledStartTime)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isLessonScheduleComplete(s) ? 'green' : 'slate'}>
                          {isLessonScheduleComplete(s) ? 'Kuzatiladi' : 'To\'liq emas'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setScheduling(s)}
                            title={s.scheduledStartTime ? 'Jadvalni tahrirlash' : 'Jadval belgilash'}
                            className={`flex items-center gap-1 text-xs font-semibold hover:underline ${
                              s.scheduledStartTime
                                ? 'text-emerald-600'
                                : 'text-indigo-600'
                            }`}
                          >
                            <CalendarClock size={12} />
                            {s.scheduledStartTime ? 'Rejalashtirilgan' : 'Jadval'}
                          </button>
                          <button
                            onClick={() => setDeleting(s)}
                            title="O'chirish"
                            className="text-slate-400 transition-colors hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <LessonImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => setReloadKey((k) => k + 1)}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Dars monitoring yozuvini o'chirish"
        message={deleting ? `${deleting.group} / ${deleting.subject} (${deleting.date}) yozuvini o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      <ScheduleLessonModal open={addOpen} onClose={() => setAddOpen(false)} onSave={() => setReloadKey((k) => k + 1)} />
      <ScheduleLessonModal
        open={!!scheduling}
        session={scheduling}
        onClose={() => setScheduling(null)}
        onSave={() => setReloadKey((k) => k + 1)}
      />
    </section>
  );
}
