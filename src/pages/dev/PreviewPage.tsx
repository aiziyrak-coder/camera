import TabelView from '../../components/reports/TabelView';
import WallTile from '../../components/videowall/WallTile';
import { buildCameraCodes } from '../../components/videowall/cameraCode';
import type { CameraFeed } from '../../types';
import type { TabelDay, TabelPerson, TabelReport } from '../../lib/tabelApi';

const DAYS: TabelDay[] = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const weekday = (day + 1) % 7; // 2026-09-01 — seshanba
  return { day, weekday, isWorkDay: weekday !== 0 && weekday !== 6, isFuture: day > 19 };
});

const NAMES = [
  'Aliyev Anvar Anvarovich', 'Botirova Dilnoza Baxtiyorovna', 'Nazarov Jasur Olimovich',
  'Sobirov Otabek Rustamovich', 'Karimova Maftuna Shuhratovna', 'Yusupov Sardor Alisherovich',
  'Toshmatova Nilufar Azizovna', 'Ergashev Bekzod Farhodovich',
];

const MARKS = ['+', '+', 'K', '+', '–', '+', '+', 'K'];

const PEOPLE: TabelPerson[] = NAMES.map((fullName, personIndex) => {
  const enrolled = personIndex !== 2;
  const cells = DAYS.map((d) => {
    if (!d.isWorkDay) return { day: d.day, mark: 'D', title: 'dam olish kuni' };
    if (d.isFuture) return { day: d.day, mark: '·', title: 'kun hali kelmagan' };
    if (!enrolled) return { day: d.day, mark: '·', title: "yuzi tizimga kiritilmagan" };
    return { day: d.day, mark: MARKS[(d.day + personIndex) % MARKS.length], title: '08:0' + (d.day % 9) + ' da keldi' };
  });
  return {
    id: 'p' + personIndex, fullName, group: personIndex % 2 ? 'DI-2301' : 'DI-2302', enrolled, cells,
    totals: { present: 0, late: 0, absent: 0, unknown: 0, workDays: 0 },
  };
});

const TABEL: TabelReport = {
  title: 'Davomat tabeli',
  scope: 'Davolash ishi fakulteti, 2-kurs',
  month: '2026-09',
  monthLabel: 'Sentabr 2026',
  days: DAYS,
  people: PEOPLE,
  totals: { people: PEOPLE.length, present: 0, late: 0, absent: 0, unknown: 0, notEnrolled: 1 },
  legend: [],
  note: null,
};

/**
 * FAQAT ISHLAB CHIQISH UCHUN (`import.meta.env.DEV`).
 *
 * Dizaynni brauzerda haqiqiy ko'z bilan tekshirish sahifasi: serverga
 * ham, tizimga kirishga ham bog'liq emas. Ishlab chiqarish yig'masiga
 * tushmaydi (App.tsx dagi shart).
 */

const CAMERAS: CameraFeed[] = [
  { id: 'cam-2', name: 'Bosh kirish — turniket', building: '2-bino', zone: 'Kirish', status: 'live', floor: 1, hasVideo: true },
  { id: 'cam-10', name: 'Dahliz, sharqiy qanot', building: '2-bino', zone: 'Dahliz', status: 'live', floor: 3, hasVideo: true },
  { id: 'cam-11', name: 'Kutubxona zali', building: '1-bino', zone: 'Kutubxona', status: 'live', floor: 2, hasVideo: false },
  { id: 'cam-84', name: 'Hovli, janubiy darvoza', building: '3-bino', zone: 'Perimetr', status: 'offline', floor: null },
];

const NOOP = () => {};

export default function PreviewPage() {
  const codes = buildCameraCodes(CAMERAS);
  return (
    <div className="min-h-screen bg-bg p-6">
      <h1 className="intel-micro mb-4 !text-fg">Dizayn ko&apos;rigi — kamera kataklari</h1>
      <div className="grid grid-cols-2 gap-px bg-border" style={{ aspectRatio: '16 / 7' }}>
        {CAMERAS.map((camera, index) => (
          <WallTile
            key={camera.id}
            index={index}
            cameraId={camera.id}
            camera={camera}
            code={codes.get(camera.id)}
            playback={index === 3 ? 'offline' : 'snapshot'}
            style={{}}
            startDelayMs={0}
            selected={index === 0}
            maximized={false}
            editable
            compact={false}
            onSelect={NOOP}
            onToggleMaximize={NOOP}
            onRemove={NOOP}
            onDropCamera={NOOP}
            onDropTile={NOOP}
          />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px bg-border" style={{ aspectRatio: '16 / 7' }}>
        <WallTile
          index={9}
          cameraId={null}
          camera={null}
          playback="empty"
          style={{}}
          startDelayMs={0}
          selected={false}
          maximized={false}
          editable
          compact={false}
          onSelect={NOOP}
          onToggleMaximize={NOOP}
          onRemove={NOOP}
          onDropCamera={NOOP}
          onDropTile={NOOP}
        />
        <WallTile
          index={10}
          cameraId="cam-yoq"
          camera={null}
          playback="offline"
          style={{}}
          startDelayMs={0}
          selected={false}
          maximized={false}
          editable
          compact={false}
          onSelect={NOOP}
          onToggleMaximize={NOOP}
          onRemove={NOOP}
          onDropCamera={NOOP}
          onDropTile={NOOP}
        />
      </div>

      <h1 className="intel-micro mb-4 mt-10 !text-fg">Dizayn ko&apos;rigi — oylik tabel</h1>
      <TabelView data={TABEL} section="talabalar" />
    </div>
  );
}
