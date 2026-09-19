import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import HemisPanel from '../../components/integrations/HemisPanel';
import DevicesPanel from '../../components/integrations/DevicesPanel';
import AccessEventsPanel from '../../components/integrations/AccessEventsPanel';
import UnmatchedPanel from '../../components/integrations/UnmatchedPanel';
import { usePersistedState } from '../../lib/usePersistedState';
import type { AccessDevice } from '../../lib/integrationsApi';

type Tab = 'hemis' | 'turniket';
type AccessView = 'jurnal' | 'biriktirilmagan';

export default function IntegrationsPage() {
  const [tab, setTab] = usePersistedState<Tab>('integrations.tab', 'hemis');
  const [view, setView] = useState<AccessView>('jurnal');
  const [devices, setDevices] = useState<AccessDevice[]>([]);

  return (
    <div className="space-y-4">
      <section className="glass p-6">
        <PageHeader
          title="Integratsiyalar"
          subtitle="HEMIS bilan talaba va xodimlar ro'yxatini sinxronlash, turniketlardan davomat"
          action={
            <SegmentedControl<Tab>
              ariaLabel="Integratsiya"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'hemis', label: 'HEMIS' },
                { value: 'turniket', label: 'Turniketlar' },
              ]}
            />
          }
        />
        {tab === 'hemis' ? (
          <HemisPanel />
        ) : (
          <div className="space-y-4">
            <DevicesPanel onDevicesChange={setDevices} />
            <SegmentedControl<AccessView>
              ariaLabel="Turniket ma'lumotlari"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'jurnal', label: 'Hodisalar jurnali' },
                { value: 'biriktirilmagan', label: 'Biriktirilmagan kartalar' },
              ]}
            />
            {view === 'jurnal' ? <AccessEventsPanel devices={devices} /> : <UnmatchedPanel />}
          </div>
        )}
      </section>
    </div>
  );
}
