import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  name: string;
  rate: number | null;
}

const ROWS: Row[] = [
  { name: 'B-guruh', rate: 70 },
  { name: 'A-guruh', rate: 95 },
  { name: 'C-guruh', rate: null },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Guruh', sortValue: (r) => r.name },
  { key: 'rate', header: 'Davomat', sortValue: (r) => r.rate, sortFirst: 'desc', cell: (r) => (r.rate === null ? '—' : `${r.rate}%`) },
];

function bodyNames() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('DataTable', () => {
  it('sorts when a header is clicked and exposes aria-sort', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} ariaLabel="Guruhlar" />);
    expect(bodyNames()).toEqual(['B-guruh', 'A-guruh', 'C-guruh']);

    fireEvent.click(screen.getByRole('button', { name: /Davomat/ }));
    expect(bodyNames()).toEqual(['A-guruh', 'B-guruh', 'C-guruh']);
    expect(screen.getByRole('columnheader', { name: /Davomat/ })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: /Guruh/ }));
    expect(bodyNames()).toEqual(['A-guruh', 'B-guruh', 'C-guruh']);
    fireEvent.click(screen.getByRole('button', { name: /Guruh/ }));
    expect(bodyNames()).toEqual(['C-guruh', 'B-guruh', 'A-guruh']);
  });

  it('activates rows with click and keyboard', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} onRowClick={onRowClick} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    fireEvent.click(rows[1]);
    fireEvent.keyDown(rows[2], { key: 'Enter' });
    expect(onRowClick).toHaveBeenNthCalledWith(1, ROWS[0]);
    expect(onRowClick).toHaveBeenNthCalledWith(2, ROWS[1]);
  });

  it('shows empty and error states', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.name} emptyTitle="Guruh topilmadi" />);
    expect(screen.getByText('Guruh topilmadi')).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} error="Server xatosi" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server xatosi');
    fireEvent.click(screen.getByRole('button', { name: /Qayta urinish/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
