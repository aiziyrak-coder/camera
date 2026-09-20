import { AlertTriangle, BarChart3, Building2, Camera, Clock, Trophy } from 'lucide-react';
import { Page, formatUzDate, relativeDayLabel, useUrlTab, type TabItem } from '../../ui';
import { AnalyticsTab } from '../../components/teachers/AnalyticsTab';
import { AttendanceCamerasPanel } from '../../components/teachers/AttendanceCamerasPanel';
import { ChronicTab } from '../../components/teachers/ChronicTab';
import { DayTrackingTab } from '../../components/teachers/DayTrackingTab';
import { RankingTab } from '../../components/teachers/RankingTab';
import { UnitsTab } from '../../components/teachers/UnitsTab';
import { useLoader } from '../../components/teachers/useLoader';
import { getKafedras } from '../../lib/situationApi';
import { useViewDate } from '../../lib/viewDate';

type TabId = 'bolinmalar' | 'tahlil' | 'reyting' | 'surunkali' | 'kuzatuv' | 'kameralar';

const REFRESH_MS = 60_000;

/** Xodimlar va o'qituvchilar: bo'linmalar, tahlil, reyting, surunkali
 *  holatlar, kun kuzatuvi va davomat kameralari diagnostikasi. */
export default function KafedrasPage() {
  const { date, isToday, today, withDate } = useViewDate();
  const units = useLoader(`k:${date}`, (signal) => getKafedras(date, { signal }), { refreshMs: isToday ? REFRESH_MS : undefined });

  const tabs: TabItem<TabId>[] = [
    { id: 'bolinmalar', label: "Bo'linmalar", icon: Building2, count: units.data?.length ?? null },
    { id: 'tahlil', label: 'Davr tahlili', icon: BarChart3 },
    { id: 'reyting', label: 'Reyting', icon: Trophy },
    { id: 'surunkali', label: 'Takror kechikkanlar', icon: AlertTriangle },
    { id: 'kuzatuv', label: 'Kim qachon kelgan', icon: Clock },
    { id: 'kameralar', label: 'Kameralar ishlayaptimi', icon: Camera },
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
      {tab === 'kameralar' && <AttendanceCamerasPanel />}
    </Page>
  );
}
