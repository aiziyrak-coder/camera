import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Clock3, MapPin, Search } from 'lucide-react';
import { Avatar, Card, EmptyState, ErrorState, Input, Page, Skeleton } from '../../ui';
import { isAbortError } from '../../lib/apiClient';
import { locationText, searchPersonLocation, type PersonLocation } from '../../lib/personLocatorApi';

function seenAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent',
  }).format(date);
}

function PersonResult({ person }: { person: PersonLocation }) {
  const location = locationText(person);
  const wall = person.cameraId
    ? `/videodevor?${new URLSearchParams({ kamera: person.cameraId, ...(person.building ? { bino: person.building } : {}), ...(person.floor != null ? { qavat: String(person.floor) } : {}) }).toString()}`
    : null;
  return (
    <Card padding="md" className="flex min-w-0 items-center gap-3">
      <Avatar name={person.fullName} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[15px] font-bold text-fg">{person.fullName}</h2>
          {person.currentlyVisible && <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-success" aria-label="So‘nggi 5 daqiqada ko‘rilgan" />}
        </div>
        <p className="truncate text-[12px] text-muted">{person.faculty || person.groupOrPosition || (person.type === 'talaba' ? 'Talaba' : 'Xodim')}</p>
        {location ? (
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-fg">
            <MapPin size={14} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </div>
        ) : <p className="mt-2 text-[12px] text-muted">Kamerada hali aniqlanmagan</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {person.lastSeenAt && <span className="flex items-center gap-1 text-[11px] font-medium text-muted"><Clock3 size={12} aria-hidden="true" />{seenAt(person.lastSeenAt)}</span>}
        {wall && <Link to={wall} className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary-soft px-2.5 text-[12px] font-semibold text-primary hover:bg-primary/15"><Camera size={13} aria-hidden="true" />Kamera</Link>}
      </div>
    </Card>
  );
}

export default function PersonLocatorPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PersonLocation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) { setItems(null); setLoading(false); setError(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(null);
      try { setItems(await searchPersonLocation(trimmed, controller.signal)); }
      catch (err) { if (!isAbortError(err)) setError((err as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  return (
    <Page title="Shaxs qidirish" subtitle="Oxirgi kamera aniqlagan joyi va vaqti" breadcrumbs={[{ label: 'Nazorat', to: '/' }, { label: 'Shaxs qidirish' }]}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Ism yoki familiyani kiriting" autoComplete="off" icon={Search} />
        {trimmed.length < 2 && <EmptyState icon={Search} title="Shaxsni qidiring" description="Kamida 2 harf kiriting" compact />}
        {loading && <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
        {error && <ErrorState message={error} onRetry={() => setQuery(`${query} `)} />}
        {!loading && !error && items?.length === 0 && <EmptyState icon={Search} title="Topilmadi" description="Ism yoki familiyani tekshirib ko‘ring" compact />}
        {!loading && !error && items && items.length > 0 && <div className="space-y-2">{items.map((person) => <PersonResult key={person.id} person={person} />)}</div>}
      </div>
    </Page>
  );
}
