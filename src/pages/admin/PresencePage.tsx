import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Camera as CameraIcon, Loader2, MapPin, Search, Users } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { api, buildQuery } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { toLocalDateString } from '../../lib/date';
import type { AttendanceCameras, LessonRelation, PersonDay, TeacherDaySummary } from '../../types';

type Tab = 'teachers' | 'cameras';

const RELATION_TONE: Record<LessonRelation, 'green' | 'amber' | 'red' | 'slate' | 'indigo'> = {
  oz_darsi: 'green',
  boshqa_dars: 'amber',
  darsi_boshqa_joyda: 'red',
  darsdan_tashqari: 'slate',
  jadval_yoq: 'slate',
};

const ATTENDANCE_LABEL: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  keldi: { label: 'Keldi', tone: 'green' },
  kech_keldi: { label: 'Kech keldi', tone: 'amber' },
  kelmadi: { label: 'Kelmadi', tone: 'red' },
  dam_olish: { label: 'Dam olish', tone: 'slate' },
};

function duration(minutes: number): string {
  if (minutes < 1) return '1 daq. dan kam';
  if (minutes < 60) return `${minutes} daq.`;
  return `${Math.floor(minutes / 60)} soat ${minutes % 60} daq.`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Ma'lumotni olib bo'lmadi";
}

export default function PresencePage() {
  const [tab, setTab] = useState<Tab>('teachers');

  return (
    <section className="glass p-6">
      <PageHeader
        title="O'qituvchilar kuzatuvi"
        subtitle="Kim soat nechida qaysi bino va xonada bo'lgani, bu darsiga bog'liqmi — va davomat kameralari holati"
      />

      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { key: 'teachers', label: "O'qituvchilar", icon: Users },
            { key: 'cameras', label: 'Davomat kameralari', icon: CameraIcon },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              tab === key ? 'bg-indigo-600 text-white shadow-btn' : 'bg-white/60 text-slate-600 hover:bg-white/90'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'teachers' ? <TeachersTab /> : <CamerasTab />}
    </section>
  );
}

function TeachersTab() {
  const { token } = useAuth();
  const [day, setDay] = useState(() => toLocalDateString(new Date()));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<TeacherDaySummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeacherDaySummary | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .get<TeacherDaySummary[]>(`/api/presence/teachers${buildQuery({ date: day, search: search.trim() })}`, token)
        .then((data) => {
          if (cancelled) return;
          setRows(data);
          setError(null);
        })
        .catch((err) => !cancelled && setError(errorText(err)))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, day, search]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Sana</span>
          <input
            type="date"
            value={day}
            max={toLocalDateString(new Date())}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
        </label>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="O'qituvchi ismi..."
            aria-label="O'qituvchini qidirish"
            className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-300"
          />
        </div>
        {loading && <Loader2 size={18} className="mb-2 animate-spin text-indigo-500" />}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}

      {rows && rows.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          Bu kunda kameralar tanigan yoki darsi bor xodim topilmadi. Xodim kuzatuvda ko&apos;rinishi uchun yuzini
          tasdiqlagan bo&apos;lishi kerak.
        </p>
      ) : rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">F.I.Sh.</th>
                <th className="px-4 py-3">Davomat</th>
                <th className="px-4 py-3">Birinchi ko&apos;rilgan</th>
                <th className="px-4 py-3">Oxirgi ko&apos;rilgan</th>
                <th className="px-4 py-3">Binolar</th>
                <th className="px-4 py-3 text-center">Tashriflar</th>
                <th className="px-4 py-3 text-center">Darslariga kirgan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {rows.map((row) => {
                const status = row.attendanceStatus ? ATTENDANCE_LABEL[row.attendanceStatus] : null;
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer transition-colors hover:bg-white/50"
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-900">{row.fullName}</span>
                      <span className="block text-xs text-slate-500">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      {status ? <Badge tone={status.tone}>{status.label}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{row.firstSeen ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{row.lastSeen ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.buildings.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">{row.visits}</td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {row.lessonsScheduled === 0 ? (
                        <span className="text-slate-400">jadvalda yo&apos;q</span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            row.lessonsAttended < row.lessonsScheduled ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {row.lessonsAttended} / {row.lessonsScheduled}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <PersonDayModal person={selected} day={day} onClose={() => setSelected(null)} />
    </>
  );
}

function PersonDayModal({
  person,
  day,
  onClose,
}: {
  person: TeacherDaySummary | null;
  day: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<PersonDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person || !token) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get<PersonDay>(`/api/presence/people/${person.id}/day${buildQuery({ date: day })}`, token)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [person, day, token]);

  const status = data?.attendanceStatus ? ATTENDANCE_LABEL[data.attendanceStatus] : null;

  return (
    <Modal open={person !== null} onClose={onClose} title={person?.fullName} maxWidth="max-w-3xl">
      {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}
      {!data && !error && (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
      {data && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              {data.faculty} · {data.unit}
            </span>
            <span className="text-slate-300">|</span>
            <span>{data.date}</span>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {data.checkIn && <span>Kelgan: {data.checkIn}</span>}
            {data.checkOut && <span>Eshikdan oxirgi chiqish: {data.checkOut}</span>}
            <Link
              to={`/admin/attendance?person=${data.id}&month=${data.date.slice(0, 7)}`}
              className="ml-auto flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
            >
              <CalendarCheck size={13} />
              Davomat kalendari
            </Link>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-900">Jadvaldagi darslari</h4>
            {data.lessons.length === 0 ? (
              <p className="text-xs text-slate-500">Bu kun uchun jadvalda darsi yo&apos;q.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.lessons.map((lesson) => (
                  <li
                    key={`${lesson.startsAt}-${lesson.groupName}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold tabular-nums">
                        {lesson.startsAt}–{lesson.endsAt}
                      </span>{' '}
                      {lesson.subject} ({lesson.groupName}) · {lesson.camera ?? 'xona kiritilmagan'}
                      {lesson.building ? `, ${lesson.building}` : ''}
                    </span>
                    {lesson.attended ? (
                      <Badge tone={lesson.late ? 'amber' : 'green'}>
                        {lesson.late ? `Kech kirdi · ${lesson.arrivedAt}` : `Kirdi · ${lesson.arrivedAt}`}
                      </Badge>
                    ) : (
                      <Badge tone="red">Xonada ko&apos;rinmadi</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <MapPin size={15} className="text-indigo-500" />
              Kun davomida qayerda bo&apos;lgan
            </h4>
            {data.visits.length === 0 ? (
              <p className="text-xs text-slate-500">Bu kunda kameralar uni tanimagan.</p>
            ) : (
              <ol className="relative flex flex-col gap-2 border-l-2 border-indigo-100 pl-4">
                {data.visits.map((visit, index) => (
                  <li key={`${visit.firstSeen}-${index}`} className="relative rounded-xl bg-white/70 px-3 py-2">
                    <span className="absolute -left-[22px] top-3 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        <span className="font-bold tabular-nums">
                          {visit.firstSeen.slice(0, 5)}
                          {visit.lastSeen.slice(0, 5) !== visit.firstSeen.slice(0, 5) &&
                            `–${visit.lastSeen.slice(0, 5)}`}
                        </span>{' '}
                        <span className="text-slate-500">({duration(visit.durationMinutes)})</span>
                      </span>
                      <Badge tone={RELATION_TONE[visit.lesson.relation]}>{visit.lesson.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {visit.building} · {visit.camera} ({visit.zone}) · {visit.cameraRole}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CamerasTab() {
  const { token } = useAuth();
  const [data, setData] = useState<AttendanceCameras | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<AttendanceCameras>('/api/presence/cameras', token)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [token]);

  if (error) return <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>;
  if (!data)
    return (
      <div className="flex justify-center py-10 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );

  const tiles = [
    { label: 'Davomatda ishlaydigan', value: `${data.attendanceEnabled} / ${data.total}` },
    { label: 'Kirish kameralari', value: data.entrance },
    { label: 'Chiqish kameralari', value: data.exit },
    { label: 'Tarmoqda', value: data.online },
    { label: 'Tasvir bermoqda', value: data.video },
    { label: 'Bugun kimnidir tanigan', value: data.recognizingToday },
    { label: 'Bugun tanilgan odamlar', value: data.peopleRecognizedToday },
    { label: 'Yuzi saqlanganlar', value: data.enrolledFaces },
  ];
  const problems = data.cameras.filter((c) => c.attendanceEnabled && c.diagnosis);

  return (
    <>
      {(!data.staffModuleActive || !data.studentModuleActive) && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
          {!data.staffModuleActive && 'Xodimlar davomati (#6) o‘chirilgan. '}
          {!data.studentModuleActive && 'Talabalar davomati (#7) o‘chirilgan.'}
        </p>
      )}

      {problems.length > 0 && data.peopleRecognizedToday === 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="font-semibold">Bugun hali hech kim davomatga tushmadi.</p>
          <p className="mt-1">
            Har bir kamera yonidagi &quot;Tashxis&quot; ustuni sababini ko&apos;rsatadi: kamera tekshirilmayaptimi, kadrda yuz
            yo&apos;qmi, yuzlar juda kichikmi yoki o&apos;xshashlik chegaradan pastmi.
          </p>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-white/70 bg-white/50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tile.label}</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/70">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Kamera</th>
              <th className="px-4 py-3">Bino / zona</th>
              <th className="px-4 py-3">Vazifasi</th>
              <th className="px-4 py-3">Davomat</th>
              <th className="px-4 py-3">Tarmoq</th>
              <th className="px-4 py-3">Tasvir</th>
              <th className="px-4 py-3 text-center">Bugun tanigan</th>
              <th className="px-4 py-3">Oxirgi tanish</th>
              <th className="px-4 py-3" title="Bugun: tekshirilgan kadr / ko'rilgan yuz / o'rtacha yuz o'lchami / eng yuqori o'xshashlik">
                Bugun AI
              </th>
              <th className="px-4 py-3">Tashxis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {data.cameras.map((camera) => (
              <tr key={camera.id} className={camera.attendanceEnabled ? '' : 'opacity-60'}>
                <td className="px-4 py-3 font-medium text-slate-900">{camera.name}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {camera.building} · {camera.zone}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {camera.role}
                  {camera.checkIntervalSeconds ? ` · har ${camera.checkIntervalSeconds} s` : ''}
                </td>
                <td className="px-4 py-3">
                  {camera.attendanceEnabled ? (
                    <Badge tone="green">Ishlaydi</Badge>
                  ) : (
                    <span className="text-xs text-slate-500">{camera.disabledReason}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={camera.online ? 'green' : 'red'}>{camera.online ? 'Bor' : "Yo'q"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={camera.video ? 'green' : 'amber'}>{camera.video ? 'Bor' : "Yo'q"}</Badge>
                </td>
                <td className="px-4 py-3 text-center tabular-nums font-semibold text-slate-800">
                  {camera.recognizedToday}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{camera.lastRecognition ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[11px] tabular-nums text-slate-600">
                  {camera.framesCheckedToday > 0 ? (
                    <>
                      <p>
                        {camera.framesCheckedToday} kadr · {camera.facesSeenToday} yuz
                      </p>
                      <p className="text-slate-400">
                        {camera.facePxMedian ? `~${camera.facePxMedian} px` : '—'}
                        {camera.bestSimilarityToday != null ? ` · max ${camera.bestSimilarityToday.toFixed(2)}` : ''}
                        {camera.relaxedPendingToday > 0 ? ` · ${camera.relaxedPendingToday} kutilmoqda` : ''}
                      </p>
                      <p className="text-slate-400">
                        {camera.lastCycleSeconds != null
                          ? `aylanish ${Math.round(camera.lastCycleSeconds)} s (kadr ${Math.round(camera.lastGrabSeconds ?? 0)} s)`
                          : ''}
                      </p>
                    </>
                  ) : (
                    <span className="text-slate-400">{camera.lastChecked ?? '—'}</span>
                  )}
                </td>
                <td className="min-w-48 px-4 py-3 text-xs text-amber-800">{camera.diagnosis ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        "Tasvir" — kamera so&apos;nggi daqiqalarda AI uchun kadr bergani. "Bugun tanigan" — shu kamerada bugun tanilgan
        turli odamlar soni (yangilanish bilan hisoblanadi). "Bugun AI" — server qayta ishga tushgandan beri: tekshirilgan
        kadrlar, ko&apos;rilgan yuzlar, yuzning o&apos;rtacha balandligi va ro&apos;yxatdagi eng yaqin odamga eng yuqori
        o&apos;xshashlik (tanish chegarasi {data.matchThreshold}
        {data.relaxedThreshold ? `; ${data.relaxedThreshold}–${data.matchThreshold} oralig'i ikkinchi ko'rinish bilan tasdiqlanadi` : ''}).
      </p>
    </>
  );
}
