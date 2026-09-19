import { Avatar, DataTable, StatusBadge, Tabs, Toolbar, type DataTableColumn, type EventStatusKey } from '../../ui';
import { relativeTime } from '../../lib/uzDate';
import ReportPager from './ReportPager';
import type { AIEvent, ReportCriterion } from '../../types';

/** 2-daraja (signallar): hodisalar jurnalidan — kadr va "nega signal"
 *  izohi bilan. Qatorni bosish hodisa panelini ochadi. */
export default function CriterionEvents({
  criterion,
  bucket,
  onBucketChange,
  events,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  error,
  onRetry,
  onPageChange,
  onOpenEvent,
  selectedId,
}: {
  criterion: ReportCriterion;
  bucket: string;
  onBucketChange: (bucket: string) => void;
  events: AIEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onOpenEvent: (event: AIEvent) => void;
  selectedId?: string | null;
}) {
  const columns: DataTableColumn<AIEvent>[] = [
    {
      key: 'time',
      header: 'Vaqt',
      cell: (event) => (
        <span className="flex min-w-0 items-center gap-3">
          {event.snapshotUrl ? (
            <img src={event.snapshotUrl} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded-control border border-border object-cover" />
          ) : (
            <span className="h-10 w-14 shrink-0 rounded-control bg-surface-3" aria-hidden="true" />
          )}
          <span className="min-w-0" title={event.timestamp}>
            <span className="block text-fg">{event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}</span>
            <span className="block text-xs tabular-nums text-muted">{event.timestamp}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'camera',
      header: 'Kamera',
      cell: (event) => (
        <span className="min-w-0">
          <span className="block truncate text-fg">{event.cameraName}</span>
          <span className="block truncate text-xs text-muted">{event.building}</span>
        </span>
      ),
    },
    {
      key: 'person',
      header: 'Kim',
      cell: (event) =>
        event.personName ? (
          <span className="flex items-center gap-2">
            <Avatar name={event.personName} size="xs" />
            {event.personName}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    { key: 'status', header: 'Holat', cell: (event) => <StatusBadge kind="event" status={event.status as EventStatusKey} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <Tabs
          variant="segmented"
          ariaLabel="Signal holati"
          tabs={criterion.buckets.map((item) => ({ id: item.key, label: item.label, count: item.count }))}
          value={bucket}
          onChange={onBucketChange}
        />
      </Toolbar>
      <DataTable
        ariaLabel={`${criterion.title}: signallar`}
        columns={columns}
        rows={events}
        rowKey={(event) => event.id}
        onRowClick={onOpenEvent}
        selectedKey={selectedId}
        loading={loading && events.length === 0}
        error={error}
        onRetry={onRetry}
        maxHeight="none"
        emptyTitle="Bu davrda signal yo'q"
        emptyDescription="Boshqa davr yoki holatni tanlab ko'ring."
        footer={events.length > 0 ? <ReportPager page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={onPageChange} /> : undefined}
      />
    </div>
  );
}
