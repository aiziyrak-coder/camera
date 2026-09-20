import { useMemo, useState } from 'react';
import { CreditCard, DoorOpen, GraduationCap, ListChecks, Plus } from 'lucide-react';
import {
  Button,
  CodeText,
  DocumentFooter,
  DocumentHeader,
  Page,
  StatusLamp,
  useUrlTab,
  type IntelStatus,
  type TabItem,
} from '../../ui';
import { RAG_LABEL, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { RagChip } from '../../components/hisobot/board';
import HemisPanel, { HemisActions } from '../../components/integrations/HemisPanel';
import DevicesPanel from '../../components/integrations/DevicesPanel';
import AccessEventsPanel, { AccessEventsToolbar, type AccessEventFilters } from '../../components/integrations/AccessEventsPanel';
import UnmatchedPanel, { UnmatchedToolbar } from '../../components/integrations/UnmatchedPanel';
import { useHemisSync } from '../../components/integrations/useHemisSync';
import { integrationsReference } from '../../components/integrations/reference';
import { branding } from '../../lib/branding';
import { useApiResource } from '../../lib/useApiResource';
import { formatDateTime, type AccessDevice } from '../../lib/integrationsApi';

type Tab = 'hemis' | 'turniket' | 'jurnal' | 'biriktirilmagan';

const TABS: readonly TabItem<Tab>[] = [
  { id: 'hemis', label: 'HEMIS', icon: GraduationCap },
  { id: 'turniket', label: 'Turniketlar', icon: DoorOpen },
  { id: 'jurnal', label: 'Kirish jurnali', icon: ListChecks },
  { id: 'biriktirilmagan', label: 'Biriktirilmagan kartalar', icon: CreditCard },
];

const TAB_SCOPE: Record<Tab, string> = {
  hemis: 'HEMIS sinxronizatsiyasi',
  turniket: 'Turniket qurilmalari',
  jurnal: 'Kirish jurnali',
  biriktirilmagan: 'Biriktirilmagan kartalar',
};

/** Hujjat tuzilgan payt — hisobot sahifasidagi bilan bir xil shaklda. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

export default function IntegrationsPage() {
  const [tab, setTab] = useUrlTab(TABS);
  const hemis = useHemisSync();
  const [addingDevice, setAddingDevice] = useState(false);
  const [devices, setDevices] = useState<AccessDevice[]>([]);
  const [eventFilters, setEventFilters] = useState<AccessEventFilters>({ search: '', deviceId: '', granted: '', matched: '', from: '', to: '' });
  const [unmatchedDays, setUnmatchedDays] = useState(7);
  // Jurnal filtri va "qurilma umuman qo'shilganmi?" savoli uchun qurilmalar
  // ro'yxati (Turniketlar tabi ochilmagan bo'lsa ham). Productionda bu
  // jadval BO'SH — shu holatni "Hodisa topilmadi" / "Hammasi biriktirilgan"
  // deb ko'rsatmaslik uchun ro'yxat boshqa tablarda ham kerak.
  const needDevices = tab === 'jurnal' || tab === 'biriktirilmagan';
  const deviceList = useApiResource<AccessDevice[]>(needDevices && devices.length === 0 ? '/api/access/devices' : null);
  const filterDevices = devices.length ? devices : (deviceList.data ?? []);
  // null — hali bilmaymiz (yuklanmoqda yoki xato): bo'sh holat matni
  // "qurilma yo'q" deb xato aytmasin.
  const deviceCount: number | null = devices.length ? devices.length : deviceList.data ? deviceList.data.length : null;

  // Hujjat raqami — bo'lim va o'sha bo'limning filtrlaridan. Vaqtdan mustaqil.
  const reference = useMemo(() => {
    const parts =
      tab === 'jurnal'
        ? [eventFilters.deviceId, eventFilters.granted, eventFilters.matched, eventFilters.from, eventFilters.to, eventFilters.search.trim()]
        : tab === 'biriktirilmagan'
          ? [String(unmatchedDays)]
          : [];
    return integrationsReference({ tab, parts });
  }, [tab, eventFilters, unmatchedDays]);
  const generatedAt = useMemo(stamp, [tab, hemis.status, deviceCount]);

  // Qurilmalar onlayn ulushi — "yaxshi/yomon" ma'nosini tashiydi,
  // shuning uchun svetofor bilan. Xom sonlar (jami, xato) neytral.
  const onlineDevices = filterDevices.length ? filterDevices.filter((d) => d.status === 'onlayn').length : devices.filter((d) => d.status === 'onlayn').length;
  const knownDevices = filterDevices.length ? filterDevices.length : devices.length;
  const onlineRate = knownDevices > 0 ? (onlineDevices / knownDevices) * 100 : null;
  const onlineTone = rag(onlineRate, RATE_RAG);

  const hemisLamp: { status: IntelStatus; label: string } = !hemis.status
    ? { status: 'idle', label: hemis.statusError ? "Noma'lum" : 'Yuklanmoqda' }
    : hemis.running
      ? { status: 'warn', label: 'Sinxronlanmoqda' }
      : hemis.status.configured
        ? { status: 'ok', label: 'Sozlangan' }
        : { status: 'alert', label: 'Sozlanmagan' };

  let actions = null;
  if (tab === 'hemis') actions = <HemisActions hemis={hemis} />;
  else if (tab === 'turniket') {
    actions = (
      <Button variant="primary" icon={Plus} onClick={() => setAddingDevice(true)}>
        Qurilma qo'shish
      </Button>
    );
  }

  let toolbar = null;
  if (tab === 'jurnal') toolbar = <AccessEventsToolbar filters={eventFilters} onChange={setEventFilters} devices={filterDevices} />;
  else if (tab === 'biriktirilmagan') toolbar = <UnmatchedToolbar days={unmatchedDays} onChange={setUnmatchedDays} />;

  return (
    <Page
      title="Integratsiyalar"
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Integratsiyalar' }]}
      actions={actions}
      tabs={TABS}
      toolbar={toolbar}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {/* 1. Hujjat blanki: qaysi bo'lim, qaysi raqam, qanday holat. */}
        <DocumentHeader
          org={branding.orgFullName}
          title="Tashqi tizimlar va turniketlar"
          reference={reference}
          generatedAt={generatedAt}
          readouts={[
            { label: 'Qamrov', value: TAB_SCOPE[tab] },
            { label: 'HEMIS ulanishi', value: <StatusLamp status={hemisLamp.status} label={hemisLamp.label} pulse={Boolean(hemis.running)} /> },
            {
              label: 'Qurilmalar',
              value: deviceCount === null && knownDevices === 0 ? '—' : `${knownDevices} ta`,
              title: "Ro'yxatga olingan turniket qurilmalari. Xom son — svetofor qo'yilmaydi.",
            },
            {
              label: 'Onlayn ulushi',
              value: (
                <span className="flex items-center gap-1.5">
                  <CodeText className={`font-semibold ${RAG_TEXT[onlineTone]}`}>{onlineRate === null ? '—' : `${Math.round(onlineRate)}%`}</CodeText>
                  <RagChip tone={onlineTone} />
                </span>
              ),
              title: `${onlineDevices} / ${knownDevices} onlayn — ${RAG_LABEL[onlineTone]}`,
            },
            {
              label: 'Oxirgi sinxronlash',
              value: <CodeText>{hemis.status ? formatDateTime(hemis.status.lastSuccessAt) : '—'}</CodeText>,
            },
          ]}
        />

        {tab === 'hemis' && <HemisPanel hemis={hemis} reference={reference} />}
        {tab === 'turniket' && (
          <DevicesPanel onDevicesChange={setDevices} adding={addingDevice} onAddingChange={setAddingDevice} reference={reference} />
        )}
        {tab === 'jurnal' && (
          <AccessEventsPanel filters={eventFilters} deviceCount={deviceCount} onAddDevice={() => setTab('turniket')} reference={reference} />
        )}
        {tab === 'biriktirilmagan' && (
          <UnmatchedPanel days={unmatchedDays} deviceCount={deviceCount} onAddDevice={() => setTab('turniket')} reference={reference} />
        )}

        <DocumentFooter
          note={`Xizmat uchun. Hujjat ${reference} raqami bilan tizimda tuzilgan; HEMIS va qurilma kalitlari faqat serverda saqlanadi.`}
        />
      </div>
    </Page>
  );
}
