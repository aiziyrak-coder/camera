import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, KeyRound, Printer, RefreshCw, UserRoundX, Users } from 'lucide-react';
import { Avatar, Badge, Button, ButtonLink, ConfirmDialog, Drawer, EmptyState, ErrorState, IconButton, ProgressBar, Skeleton, cn, focusRing, formatNumber, formatPercent, useToast } from '../../ui';
import { getEnrollmentMissing, regenerateEnrollmentCode, situationPaths, type EnrollMissing } from '../../lib/situationApi';
import { enrollTone } from '../../lib/studentAttendance';
import { EnrollPrintPortal, EnrollQrCard } from './EnrollQrCard';
import { useAsyncData } from './useAsyncData';

export interface EnrollDrawerTarget {
  name: string;
  faculty?: string | null;
}

/** "Topshirmaganlar" paneli: guruhning yuzi yo'q talabalari + chop etiladigan QR karta. */
export function GroupEnrollDrawer({ target, onClose, withDate }: { target: EnrollDrawerTarget | null; onClose: () => void; withDate: (path: string) => string }) {
  const name = target?.name ?? null;
  const res = useAsyncData<EnrollMissing>(name ? `miss|${name}` : null, (signal) => getEnrollmentMissing(name!, { signal }), { identity: name ?? '' });
  const data = res.data;
  const [printing, setPrinting] = useState(false);
  const toast = useToast();
  const donePrint = useCallback(() => setPrinting(false), []);
  const faculty = target?.faculty ?? null;

  // Kod yangilangach server javobini kutib qayta yuklamaymiz — yangi kod
  // shu yerda saqlanadi, havola esa undan qayta yig'iladi.
  const [code, setCode] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  useEffect(() => {
    setCode(null);
    setConfirmRotate(false);
  }, [name]);
  const shownCode = code ?? data?.enrollCode ?? '';
  const enrollUrl = useMemo(() => {
    if (!data) return '';
    if (!code) return data.enrollUrl;
    return data.enrollUrl.replace(/([?&]kod=)[^&]*/, `$1${encodeURIComponent(code)}`);
  }, [data, code]);

  const printCards = useMemo(
    () => (printing && data ? [{ group: data.group, url: enrollUrl, code: shownCode, faculty }] : null),
    [printing, data, enrollUrl, shownCode, faculty],
  );

  const confirmed = data ? data.total - data.missing.length : 0;
  const pct = data && data.total ? Math.round((confirmed / data.total) * 1000) / 10 : null;

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(enrollUrl);
      toast.success('Havola nusxalandi');
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  }

  async function copyCode() {
    if (!shownCode) return;
    try {
      await navigator.clipboard.writeText(shownCode);
      toast.success('Kod nusxalandi');
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  }

  /** Kodni yangilash — eski kod shu zahoti ishlamay qoladi, shuning uchun
   *  faqat tasdiqdan keyin. Ilgari bitta bosish (yoki tasodifiy ikki bosish)
   *  chop etilgan kartalarni darhol yaroqsiz qilardi. */
  async function rotate() {
    if (!name || rotating) return;
    setRotating(true);
    try {
      const next = await regenerateEnrollmentCode('guruh', name);
      setCode(next.code);
      setConfirmRotate(false);
      toast.success("Yangi kod tayyor — eski kod endi ishlamaydi");
    } catch {
      toast.error("Kodni yangilab bo'lmadi");
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
    <Drawer
      open={target !== null}
      onClose={onClose}
      size="lg"
      title={name ? `${name} — yuz topshirish` : ''}
      subtitle={target?.faculty ?? undefined}
      actions={name ? <ButtonLink to={withDate(situationPaths.group(name))} size="sm" variant="ghost" icon={ExternalLink}>Guruh</ButtonLink> : undefined}
      footer={
        data ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Printer} onClick={() => setPrinting(true)}>
              Chop etish
            </Button>
            <Button icon={Copy} onClick={copy}>
              Havolani nusxalash
            </Button>
          </div>
        ) : undefined
      }
    >
      {res.loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-96" />
        </div>
      ) : res.error && !data ? (
        <ErrorState message={res.error} onRetry={res.reload} />
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted">
                <span className="text-2xl font-semibold tabular-nums text-fg">{formatNumber(confirmed)}</span> / {formatNumber(data.total)} talaba yuz topshirgan
              </p>
              <span className="text-lg font-semibold tabular-nums text-fg">{formatPercent(pct)}</span>
            </div>
            <ProgressBar value={pct} tone={enrollTone(pct)} size="md" className="mt-2" ariaLabel="Yuz topshirish progressi" />
          </div>

          <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                <UserRoundX size={16} className="text-muted" aria-hidden="true" />
                Topshirmaganlar
                <Badge tone={data.missing.length ? 'warning' : 'success'}>{data.missing.length}</Badge>
              </h3>
              {data.missing.length === 0 ? (
                <EmptyState compact icon={Users} title="Hamma topshirgan" description="Bu guruhda davomat avtomatik yuritiladi." />
              ) : (
                <ul className="flex max-h-[28rem] flex-col divide-y divide-border overflow-y-auto rounded-control border border-border">
                  {data.missing.map((s) => (
                    <li key={s.id}>
                      <Link to={withDate(situationPaths.person(s.id))} className={cn('flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2', focusRing)}>
                        <Avatar name={s.fullName} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-fg">{s.fullName}</span>
                        <Badge tone={s.biometricsStatus === 'kutilmoqda' ? 'info' : 'neutral'} size="sm">
                          {s.biometricsStatus === 'kutilmoqda' ? 'Tasdiq kutilmoqda' : "Yuz yo'q"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <KeyRound size={16} className="text-muted" aria-hidden="true" />
                Guruh kodi
              </h3>
              <p className="text-xs text-muted">
                Kod guruhga og&apos;zaki aytiladi yoki chop etilgan kartada beriladi — kodsiz hech kim bu guruh nomidan yuz topshira olmaydi.
              </p>
              <div className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2.5">
                <span className="flex-1 select-all font-mono text-2xl font-bold tracking-[0.3em] text-fg">{shownCode || '—'}</span>
                <IconButton size="sm" icon={Copy} label="Kodni nusxalash" onClick={copyCode} />
                <IconButton size="sm" icon={RefreshCw} label="Kodni yangilash" loading={rotating} onClick={() => setConfirmRotate(true)} />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-fg">Guruh uchun QR karta</h3>
              <p className="text-xs text-muted">Chop etib, guruh xonasiga yoki sardorga bering — talabalar telefonidan o&apos;zi topshiradi.</p>
              <EnrollQrCard
                group={data.group}
                url={enrollUrl}
                code={shownCode}
                faculty={target?.faculty}
                missing={data.missing.length}
                className="p-4 [&_.enroll-card-group]:text-2xl [&_ol]:text-xs"
              />
            </div>
          </section>
        </div>
      ) : null}
      <EnrollPrintPortal cards={printCards} onDone={donePrint} />
    </Drawer>
    <ConfirmDialog
      open={confirmRotate}
      title="Guruh kodini yangilash"
      message={`«${name ?? ''}» guruhining ${shownCode || 'joriy'} kodi shu zahoti ishlamay qoladi — chop etilgan kartalar va tarqatilgan havolalar yaroqsiz bo'ladi. Yangi kod bilan kartani qayta chop etish kerak.`}
      confirmLabel="Yangi kod olish"
      onCancel={() => setConfirmRotate(false)}
      onConfirm={rotate}
    />
    </>
  );
}
