import { Activity, RefreshCw, ScrollText } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { IconButton, Page, useUrlTab, type TabItem } from '../../ui';
import { useRefreshTicker } from '../../components/situation/useLiveResource';
import { AuditLogTab } from '../../components/system/AuditLogTab';
import { SystemHealthTab } from '../../components/system/SystemHealthTab';

type SystemTab = 'holat' | 'jurnal';

const TABS: readonly TabItem<SystemTab>[] = [
  { id: 'holat', label: 'Holat', icon: Activity },
  { id: 'jurnal', label: 'Jurnal', icon: ScrollText },
];

/** Tizim: texnik holat (server, AI, oqimlar, kamera tarmog'i) va audit jurnali. */
export default function SystemPage() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const [tab] = useUrlTab(TABS);
  // Holat 30 s da bir yangilanadi (faqat shu tab ochiq bo'lsa).
  const { tick, refreshNow } = useRefreshTicker(30_000, tab === 'holat');

  return (
    <Page
      title="Tizim"
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Tizim' }]}
      tabs={TABS}
      actions={tab === 'holat' ? <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" size="sm" onClick={refreshNow} /> : undefined}
    >
      {tab === 'holat' ? (
        <SystemHealthTab tick={tick} canResync={can('systemSettings', role)} />
      ) : (
        <AuditLogTab canExport={can('exportData', role)} />
      )}
    </Page>
  );
}
