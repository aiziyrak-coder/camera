import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Bell,
  Clock,
  Download,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DatePicker,
  DateRangePicker,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  KeyValue,
  Menu,
  Modal,
  Page,
  PersonCard,
  PersonGrid,
  ProgressBar,
  ProgressRing,
  SearchInput,
  Section,
  Select,
  Skeleton,
  SkeletonTable,
  StatTile,
  StatusBadge,
  StatusDot,
  Tabs,
  Toolbar,
  rangeForPreset,
  readChartTheme,
  toneForRate,
  useToast,
  useUrlTab,
  type ChartTheme,
  type DataTableColumn,
  type DateRangeValue,
  type TabItem,
} from '../../ui';
import { todayInTashkent } from '../../lib/uzDate';

type Mode = 'ikkalasi' | 'yorug' | 'qorongi';

const MODES: TabItem<Mode>[] = [
  { id: 'ikkalasi', label: 'Yonma-yon' },
  { id: 'yorug', label: "Yorug'" },
  { id: 'qorongi', label: "Qorong'i" },
];

interface GroupRow {
  name: string;
  faculty: string;
  total: number;
  present: number;
  late: number;
}

const GROUPS: GroupRow[] = [
  { name: 'D-101', faculty: 'Davolash ishi', total: 28, present: 26, late: 2 },
  { name: 'D-102', faculty: 'Davolash ishi', total: 30, present: 21, late: 4 },
  { name: 'P-201', faculty: 'Pediatriya', total: 25, present: 17, late: 1 },
  { name: 'S-110', faculty: 'Stomatologiya', total: 22, present: 22, late: 0 },
  { name: 'F-305', faculty: 'Farmatsiya', total: 27, present: 0, late: 0 },
];

const rate = (row: GroupRow) => (row.total ? (row.present / row.total) * 100 : null);

const COLUMNS: DataTableColumn<GroupRow>[] = [
  { key: 'name', header: 'Guruh', sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'faculty', header: 'Fakultet', sortValue: (r) => r.faculty, hideOnMobile: true },
  { key: 'total', header: 'Talabalar', align: 'right', sortValue: (r) => r.total, sortFirst: 'desc' },
  { key: 'late', header: 'Kech', align: 'right', sortValue: (r) => r.late, sortFirst: 'desc' },
  {
    key: 'rate',
    header: 'Davomat',
    align: 'right',
    sortValue: rate,
    sortFirst: 'desc',
    width: '9rem',
    cell: (r) => {
      const value = rate(r);
      return (
        <div className="flex items-center justify-end gap-2">
          <ProgressBar value={value} size="xs" className="hidden w-14 lg:block" />
          <span className="w-10 text-right font-semibold">{value === null ? '—' : `${Math.round(value)}%`}</span>
        </div>
      );
    },
  },
];

const PEOPLE = [
  { name: 'Aliyeva Madina Rustamovna', subtitle: 'D-101', status: 'keldi', time: '08:02' },
  { name: 'Karimov Jasur', subtitle: 'D-101', status: 'kech_keldi', time: '08:47' },
  { name: 'Tursunov Bekzod Anvarovich', subtitle: 'D-101', status: 'kelmadi', time: null },
  { name: 'Yusupova Dilnoza', subtitle: 'D-101', status: 'kutilmoqda', time: null },
  { name: "Ergashev O'tkir", subtitle: 'D-101', status: 'sababli', time: null },
];

const CHART_DATA = [
  { day: 'Du', keldi: 91, kech: 5, kelmadi: 4 },
  { day: 'Se', keldi: 88, kech: 7, kelmadi: 5 },
  { day: 'Ch', keldi: 85, kech: 6, kelmadi: 9 },
  { day: 'Pa', keldi: 93, kech: 3, kelmadi: 4 },
  { day: 'Ju', keldi: 79, kech: 9, kelmadi: 12 },
];

/** Uslub qo'llanmasi — har bir komponent yorug' va qorong'i mavzuda.
 *  Menyuda yo'q; 2-bosqich sahifalarini ko'rib chiqish uchun (faqat super-admin). */
export default function StyleGuidePage() {
  const [mode] = useUrlTab(MODES);
  return (
    <Page
      title="UI komponentlar"
      subtitle="Dizayn tizimi (src/ui) — barcha sahifalar shu komponentlardan quriladi."
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'UI komponentlar' }]}
      tabs={MODES}
      actions={<Badge tone="info">Ichki sahifa</Badge>}
    >
      <div className={mode === 'ikkalasi' ? 'grid gap-5 2xl:grid-cols-2' : 'grid gap-5'}>
        {mode !== 'qorongi' && <ThemePanel theme="light" />}
        {mode !== 'yorug' && <ThemePanel theme="dark" />}
      </div>
    </Page>
  );
}

function ThemePanel({ theme }: { theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<ChartTheme | null>(null);
  useEffect(() => setChart(readChartTheme(ref.current)), []);

  return (
    <div ref={ref} data-theme={theme} className="min-w-0 rounded-card border border-border bg-bg p-4 sm:p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">{theme === 'light' ? "Yorug' mavzu" : "Qorong'i mavzu"}</p>
      <div className="flex flex-col gap-8">
        <Buttons />
        <Tiles />
        <Statuses />
        <Controls />
        <Tables />
        <Faces />
        <CardsAndText chart={chart} />
        <States />
        <Overlays />
      </div>
    </div>
  );
}

function Buttons() {
  const [loading, setLoading] = useState(false);
  return (
    <Section title="Tugmalar" description="primary — sahifada bitta asosiy harakat; secondary — standart.">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Plus}>
          Qo'shish
        </Button>
        <Button icon={Download}>Eksport</Button>
        <Button variant="soft">Yumshoq</Button>
        <Button variant="ghost">Bekor qilish</Button>
        <Button variant="danger" icon={Trash2}>
          O'chirish
        </Button>
        <Button
          loading={loading}
          icon={RefreshCw}
          onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 1500);
          }}
        >
          Yangilash
        </Button>
        <Button disabled>O'chirilgan</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary">
          Kichik
        </Button>
        <Button size="lg" variant="primary">
          Katta
        </Button>
        <IconButton icon={Pencil} label="Tahrirlash" />
        <IconButton icon={Settings} label="Sozlamalar" variant="secondary" />
        <IconButton icon={Bell} label="Hodisalar" badge={12} />
        <IconButton icon={Trash2} label="O'chirish" variant="danger" />
        <Menu
          align="start"
          items={[
            { label: 'Tahrirlash', icon: Pencil },
            { label: 'Eksport', icon: Download, hint: 'Excel' },
            'separator',
            { label: "O'chirish", icon: Trash2, danger: true },
          ]}
          trigger={(props) => (
            <Button {...props} iconRight={Settings}>
              Menyu
            </Button>
          )}
        />
      </div>
    </Section>
  );
}

function Tiles() {
  return (
    <Section title="Ko'rsatkichlar" description="StatTile, ProgressRing, ProgressBar — foizlar toneForRate bo'yicha rangda.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label="Bugun keldi" value="1 184" unit="ta" icon={UserCheck} tone="success" hint="1 320 talabadan" progress={89.7} delta={{ value: 2.4, better: 'up', display: '+2,4%' }} />
        <StatTile label="Kech qolganlar" value="63" icon={Clock} tone="warning" delta={{ value: 8, better: 'down' }} hint="kechagiga nisbatan" />
        <StatTile label="Kelmadi" value="73" icon={UserX} tone="danger" to="#" hint="Ro'yxatni ochish" />
        <StatTile label="Yuklanmoqda" value="" loading icon={Users} />
      </div>
      <Card className="mt-3">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing value={92} sublabel="davomat" size={72} />
          <ProgressRing value={76} size={72} />
          <ProgressRing value={48} size={72} />
          <ProgressRing value={null} size={72} sublabel="ma'lumot yo'q" />
          <div className="min-w-[12rem] flex-1 space-y-3">
            <ProgressBar value={88} showValue label="Davolash ishi" />
            <ProgressBar
              label="Bugungi holat"
              size="md"
              segments={[
                { value: 1184, tone: 'success', label: 'Keldi' },
                { value: 63, tone: 'warning', label: 'Kech' },
                { value: 73, tone: 'danger', label: 'Kelmadi' },
              ]}
            />
          </div>
        </div>
      </Card>
    </Section>
  );
}

function Statuses() {
  return (
    <Section title="Holatlar" description="Rang + matn: faqat rangga tayanilmaydi.">
      <div className="flex flex-wrap gap-2">
        {(['keldi', 'kech_keldi', 'kelmadi', 'sababli', 'kutilmoqda', 'dam_olish', 'nomalum'] as const).map((status) => (
          <StatusBadge key={status} status={status} time={status === 'keldi' ? '08:02' : null} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(['yangi', 'jarayonda', 'tasdiqlangan', 'rad_etilgan', 'hal_qilindi'] as const).map((status) => (
          <StatusBadge key={status} kind="event" status={status} />
        ))}
        <StatusBadge kind="severity" status="yuqori" />
        <StatusBadge kind="severity" status="o'rta" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="primary" variant="solid">
          Solid
        </Badge>
        <Badge tone="info" variant="outline">
          Outline
        </Badge>
        <Badge icon={GraduationCap} size="md">
          3-kurs
        </Badge>
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <StatusDot tone="success" pulse /> Jonli
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Avatar name="Aliyeva Madina" size="xs" />
        <Avatar name="Karimov Jasur" size="sm" />
        <Avatar name="Tursunov Bekzod" size="md" status="success" />
        <Avatar name="Yusupova Dilnoza" size="lg" status="warning" />
        <Avatar name="Ergashev O'tkir" size="xl" shape="square" />
      </div>
    </Section>
  );
}

function Controls() {
  const [search, setSearch] = useState('');
  const [faculty, setFaculty] = useState('');
  const [date, setDate] = useState(todayInTashkent());
  const [range, setRange] = useState<DateRangeValue>(() => rangeForPreset('week'));
  const [tab, setTab] = useState('bugun');
  const [name, setName] = useState('');
  return (
    <Section title="Filtrlar va maydonlar" description="Toolbar — tablar/sarlavha ostida, har sahifada bir xil.">
      <Toolbar
        activeCount={(search ? 1 : 0) + (faculty ? 1 : 0)}
        onReset={() => {
          setSearch('');
          setFaculty('');
        }}
        end={<Button icon={Download}>Eksport</Button>}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="F.I.Sh. yoki guruh" />
        <Select
          value={faculty}
          onChange={setFaculty}
          placeholder="Barcha fakultetlar"
          highlightActive
          ariaLabel="Fakultet"
          options={[
            { value: '1', label: 'Davolash ishi' },
            { value: '2', label: 'Pediatriya' },
            { value: '3', label: 'Stomatologiya' },
          ]}
        />
        <Select value="3" onChange={() => {}} label="Kurs" options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}-kurs` }))} />
      </Toolbar>
      <div className="mt-3 flex flex-col gap-3">
        <DatePicker value={date} onChange={setDate} />
        <DateRangePicker value={range} onChange={setRange} />
        <Tabs
          variant="segmented"
          tabs={[
            { id: 'bugun', label: 'Bugun' },
            { id: 'hafta', label: 'Hafta', count: 5 },
            { id: 'oy', label: 'Oy' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Tabs
          tabs={[
            { id: 'bugun', label: 'Umumiy', icon: Users },
            { id: 'hafta', label: 'Kechikkanlar', count: 63 },
            { id: 'oy', label: 'Kelmaganlar', count: 73 },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Guruh nomi" hint="Masalan: D-101" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="D-101" />
          </Field>
          <Field label="Xato holati" error="Bu maydon to'ldirilishi shart">
            <Input value="" onChange={() => {}} />
          </Field>
        </div>
      </div>
    </Section>
  );
}

function Tables() {
  const [loading, setLoading] = useState(false);
  return (
    <Section
      title="Jadval"
      description="Saralash (sarlavhani bosing), qator bosish (Enter ham), telefonda — kartalar."
      actions={
        <Button size="sm" onClick={() => setLoading((v) => !v)}>
          {loading ? "Ma'lumotni ko'rsatish" : 'Yuklanish holati'}
        </Button>
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={GROUPS}
        rowKey={(r) => r.name}
        loading={loading}
        onRowClick={() => {}}
        rowTone={(r) => toneForRate(rate(r))}
        defaultSort={{ key: 'rate', dir: 'desc' }}
        ariaLabel="Guruhlar davomati"
      />
      <div className="mt-3">
        <DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.name} emptyTitle="Guruh topilmadi" emptyDescription="Filtrlarni o'zgartirib ko'ring." />
      </div>
    </Section>
  );
}

function Faces() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Section title="Yuzlar setkasi" description="PersonCard + PersonGrid — guruh sahifasi uchun.">
      <PersonGrid>
        {PEOPLE.map((person) => (
          <PersonCard
            key={person.name}
            name={person.name}
            subtitle={person.subtitle}
            status={person.status}
            time={person.time}
            selected={selected === person.name}
            onClick={() => setSelected(person.name)}
          />
        ))}
      </PersonGrid>
    </Section>
  );
}

function CardsAndText({ chart }: { chart: ChartTheme | null }) {
  return (
    <Section title="Karta, grafik, KeyValue">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Haftalik davomat" subtitle="Foizda, kunlar kesimida" actions={<Button size="sm" variant="ghost">Batafsil</Button>} />
          <div className="h-48">
            {chart && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CHART_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={chart.grid} />
                  <XAxis dataKey="day" tick={chart.axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={chart.axisTick} axisLine={false} tickLine={false} />
                  <Tooltip {...chart.tooltip} />
                  <Bar dataKey="keldi" name="Keldi" stackId="a" fill={chart.attendance.keldi} />
                  <Bar dataKey="kech" name="Kech" stackId="a" fill={chart.attendance.kechKeldi} />
                  <Bar dataKey="kelmadi" name="Kelmadi" stackId="a" fill={chart.attendance.kelmadi} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Guruh ma'lumoti" icon={GraduationCap} />
          <KeyValue
            items={[
              { label: 'Fakultet', value: 'Davolash ishi' },
              { label: 'Kurs', value: '1-kurs' },
              { label: 'Kurator', value: 'Hasanova N.', hint: '+998 90 123 45 67' },
              { label: 'Talabalar', value: <span className="tabular-nums">28</span> },
            ]}
          />
        </Card>
      </div>
    </Section>
  );
}

function States() {
  return (
    <Section title="Holatlar: bo'sh, xato, yuklanish">
      <div className="grid gap-3">
        <EmptyState title="Bugun dars yo'q" description="Tanlangan sanada bu guruh uchun jadvalda dars topilmadi." action={<Button size="sm">Boshqa sana</Button>} compact />
        <ErrorState message="Server 503 qaytardi — birozdan keyin qayta urinib ko'ring." onRetry={() => {}} />
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </Card>
        <SkeletonTable rows={2} columns={4} />
      </div>
    </Section>
  );
}

function Overlays() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <Section title="Oynalar va xabarlar" description="Drawer — tafsilot; Modal — forma; ConfirmDialog — xavfli harakat.">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDrawer(true)}>Drawer</Button>
        <Button onClick={() => setModal(true)}>Modal</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          ConfirmDialog
        </Button>
        <Button variant="ghost" onClick={() => toast.success('Saqlandi')}>
          Toast
        </Button>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Karimov Jasur" subtitle="D-101 · Davolash ishi" footer={<Button onClick={() => setDrawer(false)}>Yopish</Button>}>
        <KeyValue
          items={[
            { label: 'Bugun', value: <StatusBadge status="kech_keldi" time="08:47" /> },
            { label: 'Oylik davomat', value: '91%' },
            { label: 'Oxirgi ko\'rilgan', value: '1-bino, 2-qavat' },
          ]}
        />
      </Drawer>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Yangi guruh"
        description="Guruh nomi va fakultetini kiriting."
        footer={
          <>
            <Button onClick={() => setModal(false)}>Bekor qilish</Button>
            <Button variant="primary" onClick={() => setModal(false)}>
              Saqlash
            </Button>
          </>
        }
      >
        <Field label="Guruh nomi">
          <Input placeholder="D-101" />
        </Field>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Guruhni o'chirish?"
        message="Bu amalni qaytarib bo'lmaydi."
        confirmLabel="O'chirish"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          setConfirm(false);
        }}
      />
    </Section>
  );
}
