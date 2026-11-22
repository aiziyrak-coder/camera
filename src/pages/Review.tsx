/* Tasdiqlash navbati: o'zi yuborilgan yuzlarni birma-bir ko'rib chiqish.
 * Chapda navbat, o'rtada HEMIS surati va yuborilgan 3 tomon. A — tasdiqlash, R — rad etish. */
import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCheck, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { invalidateServerPageCache, useServerPage } from '../lib/useServerPage';
import type { StudentStaffRecord } from '../types';
import { useOverview } from '../shell';
import { Alert, Badge, Button, Confirm, Empty, IconButton, Kbd, PageHead, Photo, Spinner, Tabs, cn, errorText, formatNumber, isTyping, layerOpen, useToast } from '../kit';

type PersonType = 'talaba' | 'xodim';

export default function ReviewPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { overview, reload: reloadOverview } = useOverview();
  const [type, setType] = useState<PersonType>('talaba');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);

  const list = useServerPage<StudentStaffRecord>('/api/students-staff/search', { type, biometricsStatus: 'tasdiq_kutmoqda' }, 50, { post: true });
  const items = list.items;
  const current = items.find((p) => p.id === currentId) ?? items[0] ?? null;
  const index = current ? items.findIndex((p) => p.id === current.id) : -1;

  useEffect(() => {
    setCurrentId(null);
  }, [type]);

  const refresh = useCallback(() => {
    invalidateServerPageCache('/api/students-staff');
    list.reload();
    reloadOverview();
  }, [list, reloadOverview]);

  const decide = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (!current || busy) return;
      setBusy(decision);
      const next = items[index + 1] ?? items[index - 1] ?? null;
      try {
        await api.post(`/api/students-staff/${current.id}/biometrics/${decision}`, {}, token);
        toast(decision === 'approve' ? `${current.fullName} — tasdiqlandi` : `${current.fullName} — rad etildi`);
        setCurrentId(next?.id ?? null);
        refresh();
      } catch (err) {
        toast(errorText(err), 'bad');
      } finally {
        setBusy(null);
      }
    },
    [current, busy, items, index, token, toast, refresh],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || layerOpen() || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a') decide('approve');
      else if (k === 'r') decide('reject');
      else if ((k === 'arrowdown' || k === 'arrowright' || k === 'j') && items[index + 1]) setCurrentId(items[index + 1].id);
      else if ((k === 'arrowup' || k === 'arrowleft' || k === 'k') && index > 0) setCurrentId(items[index - 1].id);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, items, index]);

  const counts = { talaba: overview?.talaba.awaitingApproval ?? null, xodim: overview?.xodim.awaitingApproval ?? null };
  const total = list.total;

  return (
    <div className="flex h-full flex-col">
      <PageHead
        title="Tasdiqlash"
        text="Odamlar o‘zi yuborgan yuzlar. Kameralar ularni faqat tasdiqlangandan keyin taniydi."
        actions={
          total > 0 && (
            <Button icon={CheckCheck} onClick={() => setApproveAllOpen(true)}>
              Hammasini tasdiqlash
            </Button>
          )
        }
      >
        <Tabs
          value={type}
          onChange={setType}
          options={[
            { value: 'talaba', label: 'Talabalar', count: counts.talaba },
            { value: 'xodim', label: 'Xodimlar', count: counts.xodim },
          ]}
        />
      </PageHead>

      {list.error ? (
        <div className="p-6">
          <Alert>{list.error}</Alert>
        </div>
      ) : list.loading && items.length === 0 ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty icon={Inbox} title="Navbat bo‘sh" text="Tasdiq kutayotgan yuz yo‘q. Yangi yuborilganlari shu yerda paydo bo‘ladi." />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Navbat */}
          <aside className="hidden w-[300px] shrink-0 flex-col border-r border-line md:flex">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="label-xs">Navbat</span>
              <span className="tnum text-[12px] text-faint">{formatNumber(total)}</span>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {items.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentId(p.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-line/70 px-4 py-2.5 text-left',
                      i === index ? 'bg-sunk' : 'hover:bg-side',
                    )}
                  >
                    <Photo src={p.biometricPhotoUrl} name={p.fullName} className="h-9 w-9 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.fullName}</span>
                      <span className="block truncate text-[11.5px] text-faint">{p.group || p.reportedGroup || p.groupOrPosition || p.faculty}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {list.totalPages > 1 && (
              <div className="flex h-10 shrink-0 items-center justify-between border-t border-line px-2">
                <IconButton icon={ChevronLeft} label="Oldingi sahifa" size="sm" disabled={list.page <= 1} onClick={() => { list.setPage(list.page - 1); setCurrentId(null); }} />
                <span className="tnum text-[12px] text-faint">
                  {list.page} / {list.totalPages}
                </span>
                <IconButton icon={ChevronRight} label="Keyingi sahifa" size="sm" disabled={list.page >= list.totalPages} onClick={() => { list.setPage(list.page + 1); setCurrentId(null); }} />
              </div>
            )}
          </aside>

          {/* Ko'rib chiqish */}
          {current && (
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
                <div className="mx-auto max-w-[880px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="label-xs">
                        {index + 1} / {formatNumber(total)}
                      </p>
                      <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.01em] text-ink">{current.fullName}</h2>
                      <p className="mt-1 text-[13px] text-soft">
                        {[current.faculty, current.course ? `${current.course}-kurs` : null, current.group || current.reportedGroup || (current.type === 'xodim' ? current.groupOrPosition : null)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton icon={ChevronLeft} label="Oldingi" disabled={index <= 0} onClick={() => setCurrentId(items[index - 1]?.id ?? null)} />
                      <IconButton icon={ChevronRight} label="Keyingi" disabled={index >= items.length - 1} onClick={() => setCurrentId(items[index + 1]?.id ?? null)} />
                    </div>
                  </div>

                  {current.reviewReason && (
                    <Alert tone="warn" className="mt-4">
                      {current.reviewReason}
                    </Alert>
                  )}

                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Shot label="HEMIS surati" sub="Solishtirish uchun" src={current.hemisPhotoUrl} name={current.fullName} muted />
                    <Shot label="Old" src={current.biometricPhotoUrl} name={current.fullName} />
                    <Shot label="Chap" src={current.biometricPhotoLeftUrl} name={current.fullName} />
                    <Shot label="O‘ng" src={current.biometricPhotoRightUrl} name={current.fullName} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {current.selfRegistered && <Badge>O‘zi ro‘yxatdan o‘tgan</Badge>}
                    {current.hasPinfl && <Badge tone="ok">JSHSHIR bor</Badge>}
                    {!current.hemisPhotoUrl && <Badge tone="warn">HEMIS surati yo‘q</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-side px-6 py-3 lg:px-10">
                <p className="mr-auto hidden text-[12px] text-faint sm:block">
                  <Kbd>A</Kbd> tasdiqlash · <Kbd>R</Kbd> rad etish · <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> navbat bo‘ylab
                </p>
                <Button icon={X} size="lg" className="h-10 text-[14px]" loading={busy === 'reject'} disabled={busy !== null} onClick={() => decide('reject')}>
                  Rad etish
                </Button>
                <Button
                  variant="primary"
                  icon={Check}
                  size="lg"
                  className="h-10 text-[14px]"
                  loading={busy === 'approve'}
                  disabled={busy !== null}
                  onClick={() => decide('approve')}
                >
                  Tasdiqlash
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {approveAllOpen && (
        <Confirm
          title="Hammasi tasdiqlansinmi?"
          confirmLabel={`${formatNumber(total)} tasini tasdiqlash`}
          text={`${type === 'talaba' ? 'Talabalar' : 'Xodimlar'} navbatidagi yuzlar tasdiqlanadi. Shaxsi shubhali (boshqa odamga o‘xshash, HEMIS suratiga mos kelmagan) yuzlar tasdiqlanmaydi — ularni bittalab ko‘rib chiqing.`}
          onConfirm={async () => {
            const res = await api.post<{ approved: number; skippedAngles: number; skippedIdentity?: number }>(
              `/api/students-staff/biometrics/approve-all?type=${type}`,
              {},
              token,
            );
            const left = [
              res.skippedIdentity ? `${formatNumber(res.skippedIdentity)} tasini bittalab tekshiring` : '',
              res.skippedAngles ? `${formatNumber(res.skippedAngles)} tasida 3 tomon yo‘q` : '',
            ].filter(Boolean);
            toast(`${formatNumber(res.approved)} ta yuz tasdiqlandi${left.length ? ` · ${left.join(', ')}` : ''}`);
            refresh();
          }}
          onClose={() => setApproveAllOpen(false)}
        />
      )}
    </div>
  );
}

function Shot({ label, sub, src, name, muted }: { label: string; sub?: string; src?: string | null; name: string; muted?: boolean }) {
  return (
    <figure className={cn('overflow-hidden rounded-xl border', muted ? 'border-dashed border-line bg-side' : 'border-line')}>
      {src ? (
        <Photo src={src} name={name} className="aspect-[4/5] w-full" />
      ) : (
        <div className="flex aspect-[4/5] w-full items-center justify-center text-[12px] text-faint">Rasm yo‘q</div>
      )}
      <figcaption className="flex items-center justify-between border-t border-line px-3 py-2">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {sub && <span className="text-[11px] text-faint">{sub}</span>}
      </figcaption>
    </figure>
  );
}
