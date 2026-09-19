import { useState } from 'react';
import { CreditCard, DoorOpen, GraduationCap, ListChecks, Plus } from 'lucide-react';
import { Button, Page, useUrlTab, type TabItem } from '../../ui';
import HemisPanel, { HemisActions } from '../../components/integrations/HemisPanel';
import DevicesPanel from '../../components/integrations/DevicesPanel';
import AccessEventsPanel, { AccessEventsToolbar, type AccessEventFilters } from '../../components/integrations/AccessEventsPanel';
import UnmatchedPanel, { UnmatchedToolbar } from '../../components/integrations/UnmatchedPanel';
import { useHemisSync } from '../../components/integrations/useHemisSync';
import { useApiResource } from '../../lib/useApiResource';
import type { AccessDevice } from '../../lib/integrationsApi';

type Tab = 'hemis' | 'turniket' | 'jurnal' | 'biriktirilmagan';

const TABS: readonly TabItem<Tab>[] = [
  { id: 'hemis', label: 'HEMIS', icon: GraduationCap },
  { id: 'turniket', label: 'Turniketlar', icon: DoorOpen },
  { id: 'jurnal', label: 'Kirish jurnali', icon: ListChecks },
  { id: 'biriktirilmagan', label: 'Biriktirilmagan kartalar', icon: CreditCard },
];

export default function IntegrationsPage() {
  const [tab] = useUrlTab(TABS);
  const hemis = useHemisSync();
  const [addingDevice, setAddingDevice] = useState(false);
  const [devices, setDevices] = useState<AccessDevice[]>([]);
  const [eventFilters, setEventFilters] = useState<AccessEventFilters>({ search: '', deviceId: '', granted: '', matched: '', from: '', to: '' });
  const [unmatchedDays, setUnmatchedDays] = useState(7);
  // Jurnal filtri uchun qurilmalar ro'yxati (Turniketlar tabi ochilmagan bo'lsa ham).
  const deviceList = useApiResource<AccessDevice[]>(tab === 'jurnal' && devices.length === 0 ? '/api/access/devices' : null);
  const filterDevices = devices.length ? devices : (deviceList.data ?? []);

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
      subtitle="HEMIS bilan talaba va xodimlar ro'yxatini sinxronlash, turniketlardan davomat"
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Integratsiyalar' }]}
      actions={actions}
      tabs={TABS}
      toolbar={toolbar}
    >
      {tab === 'hemis' && <HemisPanel hemis={hemis} />}
      {tab === 'turniket' && <DevicesPanel onDevicesChange={setDevices} adding={addingDevice} onAddingChange={setAddingDevice} />}
      {tab === 'jurnal' && <AccessEventsPanel filters={eventFilters} />}
      {tab === 'biriktirilmagan' && <UnmatchedPanel days={unmatchedDays} />}
    </Page>
  );
}
