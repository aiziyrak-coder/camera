/* Boshqaruv paneli: butun tizim bir qarashda. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ListChecks, QrCode as QrIcon, RefreshCw, Send } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { formatDateTime, integrationsApi, type HemisStatus } from '../lib/integrationsApi';
import { notificationsApi, type NotificationStatus } from '../lib/notificationsApi';
import { useOverview, type Coverage } from '../shell';
import { Badge, Button, Meter, PageHead, Panel, Segmented, Skeleton, Stat, cn, formatNumber } from '../kit';
import { EnrollLinkModal } from './EnrollLink';

interface ParentCoverage {
  students: number;
  telegramLinked: number;
  weekSent: number;
  weekFailed: number;
}

const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const KUNLAR = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

function todayLabel(d: Date): string {
  return `${d.getDate()}-${OYLAR[d.getMonth()]} ${d.getFullYear()}, ${KUNLAR[d.getDay()]}`;
}

export default function DashboardPage() {
  const { token, role, userName } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { overview } = useOverview();
  const [hemis, setHemis] = useState<HemisStatus | null>(null);
  const [bot, setBot] = useState<NotificationStatus | null>(null);
  const [parents, setParents] = useState<ParentCoverage | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [scope, setScope] = useState<'talaba' | 'xodim'>('talaba');

  const canHemis = can('manageIntegrations', role);
  const canBot = can('manageNotifications', role);

  useEffect(() => {
    if (canHemis) integrationsApi.hemisStatus(token).then(setHemis).catch(() => undefined);
    if (canBot) {
      notificationsApi.status(token).then(setBot).catch(() => undefined);
      api.get<ParentCoverage>('/api/notifications/ota-ona', token).then(setParents).catch(() => undefined);
    }
  }, [token, canHemis, canBot]);

  const t = overview?.talaba;
  const x = overview?.xodim;
  const all = t && x ? { total: t.total + x.total, confirmed: t.confirmed + x.confirmed, missing: t.missing + t.pending + x.missing + x.pending, awaiting: (t.awaitingApproval ?? 0) + (x.awaitingApproval ?? 0) } : null;
  const today = useMemo(() => todayLabel(new Date()), []);

  return (
    <div>
      <PageHead
        title={`Xush kelibsiz${userName ? `, ${userName}` : ''}`}
        text={today}
        actions={
          <>
            <Button icon={QrIcon} onClick={() => setLinkOpen(true)}>
              Ro‘yxatdan o‘tish havolasi
            </Button>
            <Button variant="primary" icon={ListChecks} onClick={() => navigate('/tasdiqlash')}>
              Tasdiqlash{all && all.awaiting > 0 ? ` · ${formatNumber(all.awaiting)}` : ''}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5 p-4 lg:p-6">
        {/* Asosiy ko'rsatkichlar */}
        <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4 [&>*]:bg-white">
          <Stat label="Bazadagi odamlar" value={all ? formatNumber(all.total) : <Skeleton className="h-6 w-20" />} sub={t && x ? `${formatNumber(t.total)} talaba · ${formatNumber(x.total)} xodim` : undefined} />
          <Stat
            label="Yuzi bor"
            value={all ? formatNumber(all.confirmed) : <Skeleton className="h-6 w-20" />}
            meter={all && all.total ? all.confirmed / all.total : 0}
            meterTone="ok"
            sub={all && all.total ? `${Math.round((all.confirmed / all.total) * 100)}% — kameralar taniydi` : undefined}
          />
          <Stat label="Yuzi yo‘q" value={all ? formatNumber(all.missing) : <Skeleton className="h-6 w-20" />} sub="Havola orqali kiritishi kerak" onClick={() => navigate('/yuzlar')} />
          <Stat
            label={
              <span className="flex items-center gap-1.5">
                Tasdiq kutmoqda {all && all.awaiting > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
              </span>
            }
            value={all ? formatNumber(all.awaiting) : <Skeleton className="h-6 w-20" />}
            sub={all && all.awaiting > 0 ? 'Ko‘rib chiqish →' : 'Navbat bo‘sh'}
            onClick={() => navigate('/tasdiqlash')}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          {/* Fakultetlar kesimida qamrov */}
          <Panel
            title="Qamrov — fakultetlar kesimida"
            actions={
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'talaba', label: 'Talabalar' },
                  { value: 'xodim', label: 'Xodimlar' },
                ]}
              />
            }
            bodyClassName="p-0"
          >
            <CoverageTable data={overview?.[scope]} />
          </Panel>

          <div className="flex flex-col gap-5">
            {/* Kurslar */}
            {t?.byCourse && t.byCourse.length > 0 && (
              <Panel title="Talabalar — kurslar bo‘yicha">
                <ul className="flex flex-col gap-3">
                  {t.byCourse.map((c) => (
                    <li key={c.course}>
                      <div className="flex items-baseline justify-between text-[12.5px]">
                        <span className="text-ink">{c.course}</span>
                        <span className="tnum text-soft">
                          {formatNumber(c.confirmed)} / {formatNumber(c.total)}
                          <span className="ml-2 inline-block w-9 text-right font-medium text-ink">{c.total ? Math.round((c.confirmed / c.total) * 100) : 0}%</span>
                        </span>
                      </div>
                      <Meter value={c.total ? c.confirmed / c.total : 0} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {/* Integratsiyalar */}
            {(canHemis || canBot) && (
              <Panel title="Integratsiyalar" bodyClassName="p-0">
                <ul className="divide-y divide-line">
                  {canHemis && (
                    <IntegrationRow
                      to="/hemis"
                      icon={RefreshCw}
                      title="HEMIS"
                      ok={hemis ? hemis.configured && hemis.lastRun?.status !== 'xato' : null}
                      status={hemis ? (hemis.running ? 'Yangilanmoqda' : hemis.configured ? (hemis.lastRun?.status === 'xato' ? 'Oxirgisi xato' : 'Ulangan') : 'Sozlanmagan') : null}
                      text={hemis ? `Oxirgi yangilanish: ${formatDateTime(hemis.lastSuccessAt)}` : null}
                    />
                  )}
                  {canBot && (
                    <IntegrationRow
                      to="/telegram"
                      icon={Send}
                      title="Telegram bot"
                      ok={bot ? bot.telegramConfigured : null}
                      status={bot ? (bot.telegramConfigured ? 'Ishlayapti' : 'Sozlanmagan') : null}
                      text={parents ? `${formatNumber(parents.telegramLinked)} ota-ona ulangan · 7 kunda ${formatNumber(parents.weekSent)} xabar` : null}
                    />
                  )}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {linkOpen && <EnrollLinkModal onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function CoverageTable({ data }: { data?: Coverage }) {
  if (!data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }
  const rows = [...(data.byFaculty ?? [])].sort((a, b) => b.total - a.total);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="[&>th]:h-9 [&>th]:border-b [&>th]:border-line [&>th]:px-4 [&>th]:text-[11.5px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-faint">
            <th>Fakultet</th>
            <th className="w-20 text-right">Jami</th>
            <th className="w-24 whitespace-nowrap text-right">Yuzi bor</th>
            <th className="w-20 text-right">Yo‘q</th>
            <th className="w-48">Qamrov</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ratio = r.total ? r.confirmed / r.total : 0;
            return (
              <tr key={r.faculty} className="[&>td]:h-11 [&>td]:border-b [&>td]:border-line/70 [&>td]:px-4 last:[&>td]:border-b-0">
                <td className="max-w-[280px] truncate text-ink">{r.faculty}</td>
                <td className="tnum text-right text-soft">{formatNumber(r.total)}</td>
                <td className="tnum text-right text-ink">{formatNumber(r.confirmed)}</td>
                <td className="tnum text-right text-soft">{formatNumber(r.missing + r.pending)}</td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Meter value={ratio} className="flex-1" />
                    <span className={cn('tnum w-9 text-right text-[12.5px] font-medium', ratio >= 0.9 ? 'text-ink' : 'text-soft')}>{Math.round(ratio * 100)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-side font-medium [&>td]:h-10 [&>td]:border-t [&>td]:border-line [&>td]:px-4">
            <td>Jami</td>
            <td className="tnum text-right">{formatNumber(data.total)}</td>
            <td className="tnum text-right">{formatNumber(data.confirmed)}</td>
            <td className="tnum text-right">{formatNumber(data.missing + data.pending)}</td>
            <td className="tnum text-right text-[12.5px]">{data.total ? Math.round((data.confirmed / data.total) * 100) : 0}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function IntegrationRow({
  to,
  icon: Icon,
  title,
  ok,
  status,
  text,
}: {
  to: string;
  icon: typeof Send;
  title: string;
  ok: boolean | null;
  status: string | null;
  text: string | null;
}) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-side">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-soft">
          <Icon size={15} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-ink">{title}</span>
            {status && <Badge tone={ok ? 'ok' : ok === false ? 'bad' : 'plain'}>{status}</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-faint">{text ?? '...'}</span>
        </span>
        <ArrowUpRight size={15} className="text-faint transition-colors group-hover:text-ink" aria-hidden />
      </Link>
    </li>
  );
}
