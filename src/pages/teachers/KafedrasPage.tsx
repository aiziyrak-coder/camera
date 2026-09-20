import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, Building2, Clock, Trophy } from 'lucide-react';
import { Page, formatUzDate, relativeDayLabel, useUrlTab, type TabItem } from '../../ui';
import { AnalyticsTab } from '../../components/teachers/AnalyticsTab';
import { ChronicTab } from '../../components/teachers/ChronicTab';
import { DayTrackingTab } from '../../components/teachers/DayTrackingTab';
import { RankingTab } from '../../components/teachers/RankingTab';
import { UnitsTab } from '../../components/teachers/UnitsTab';
import { useLoader } from '../../components/teachers/useLoader';
import { getKafedras } from '../../lib/situationApi';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useViewDate } from '../../lib/viewDate';

type TabId = 'bolinmalar' | 'tahlil' | 'reyting' | 'surunkali' | 'kuzatuv';

const REFRESH_MS = 60_000;

/** Xodimlar va o'qituvchilar: bo'linmalar, tahlil, reyting, takror
 *  kechikkanlar va kun kuzatuvi. Kameralar tashxisi bu yerda emas —
 *  u kameralar sozlamalarida (u xodimlar haqida emas, kameralar haqida). */
export default function KafedrasPage() {
  const { date, isToday, today, withDate } = useViewDate();
  const { role } = useAuth();
  const { can } = usePermissions();
  const units = useLoader(`k:${date}`, (signal) => getKafedras(date, { signal }), { refreshMs: isToday ? REFRESH_MS : undefined });

  const tabs: TabItem<TabId>[] = [
    { id: 'bolinmalar', label: "Bo'linmalar", icon: Building2, count: units.data?.length ?? null },
    { id: 'tahlil', label: 'Davr tahlili', icon: BarChart3 },
    { id: 'reyting', label: 'Reyting', icon: Trophy },
    { id: 'surunkali', label: 'Takror kechikkanlar', icon: AlertTriangle },
    { id: 'kuzatuv', label: 'Kim qachon kelgan', icon: Clock },
  ];
  const [tab] = useUrlTab(tabs, { defaultTab: 'bolinmalar' });
  const dayLabel = relativeDayLabel(date, today) ?? formatUzDate(date, { weekday: true });
  const periodTab = tab === 'tahlil' || tab === 'reyting' || tab === 'surunkali';

  return (
    <Page
      title="Xodimlar va o'qituvchilar"
      subtitle={
        periodTab
          ? "Tanlangan davrda xodimlar qanday kelgani. Hisobga faqat yuzi ro'yxatdan o'tgan xodimlar kiradi"
          : `Har bir bo'linmada kim ishga kelgani va o'qituvchilar darsga o'z vaqtida kirgani · ${dayLabel}`
      }
      breadcrumbs={[{ label: "Xodimlar va o'qituvchilar" }]}
      tabs={tabs}
      defaultTab="bolinmalar"
    >
      {tab === 'bolinmalar' && <UnitsTab loader={units} date={date} isToday={isToday} withDate={withDate} />}
      {tab === 'tahlil' && <AnalyticsTab />}
      {tab === 'reyting' && <RankingTab />}
      {tab === 'surunkali' && <ChronicTab />}
      {tab === 'kuzatuv' && <DayTrackingTab date={date} />}
      {can('editCameraLocation', role) && (
        <p className="text-xs text-muted">
          Odamlar davomatga tushmayaptimi — kameralar shu yerdan tekshiriladi:{' '}
          <Link to="/sozlamalar/kameralar?tab=tanish" className="font-medium text-primary hover:underline">
            Sozlamalar → Kameralar → «Kameralar odamlarni tanidimi»
          </Link>
          .
        </p>
      )}
    </Page>
  );
}
