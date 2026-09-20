import { Building2, LayoutGrid } from 'lucide-react';
import { useUrlTab, type TabItem } from '../../ui';
import VideoWall from '../../components/videowall/VideoWall';
import CampusBrowser from '../../components/monitor/CampusBrowser';

type Tab = 'devor' | 'binolar';

const TABS: readonly TabItem<Tab>[] = [
  { id: 'devor', label: 'Bir ekranda ko\'p kamera', icon: LayoutGrid },
  { id: 'binolar', label: "Bino va qavat bo'yicha", icon: Building2 },
];

/** /videodevor — ikki ko'rinish:
 *  - "Videodevor": ko'p kamerali setka (ko'rinishlar, tur, alohida oyna);
 *  - "Bino bo'yicha": kampus → bino → qavat → kamera (jonli ko'rinish, PTZ,
 *    signallar, hodisalar jurnali, hisobot).
 *  /videodevor/ekran — `standalone`: menyusiz, ikkinchi monitor uchun. */
export default function VideoWallPage({ standalone = false }: { standalone?: boolean }) {
  const [tab] = useUrlTab(TABS);
  if (standalone) return <VideoWall standalone />;
  // Har tab o'z `Page`ini chizadi (sarlavha o'ngidagi harakatlar tabga bog'liq);
  // tanlanmagan tab umuman o'rnatilmaydi — pleyerlar va so'rovlar to'xtaydi.
  return tab === 'binolar' ? <CampusBrowser tabs={TABS} defaultTab="devor" /> : <VideoWall tabs={TABS} defaultTab="devor" />;
}
