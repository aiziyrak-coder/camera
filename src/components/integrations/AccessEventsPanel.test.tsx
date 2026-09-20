// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AccessEventsToolbar, type AccessEventFilters } from './AccessEventsPanel';

const EMPTY: AccessEventFilters = { search: '', deviceId: '', granted: '', matched: '', from: '', to: '' };

/**
 * QA: sana oralig'i. `min`/`max` atributlari faqat kalendardan tanlashni
 * cheklaydi — klaviaturadan yozilgan teskari oraliq serverga ketib,
 * jadvalni sababsiz bo'shatib qo'yardi.
 */
describe('AccessEventsToolbar — sana oralig\'i', () => {
  it("boshlanish sanasi tugashdan keyin bo'lsa, tugash ham tortiladi", () => {
    const onChange = vi.fn();
    render(<AccessEventsToolbar filters={{ ...EMPTY, to: '2026-09-01' }} onChange={onChange} devices={[]} />);

    fireEvent.change(screen.getByLabelText('Sanadan'), { target: { value: '2026-09-20' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-20', to: '2026-09-20' }));
  });

  it("tugash sanasi boshlanishdan oldin bo'lsa, boshlanish ham tortiladi", () => {
    const onChange = vi.fn();
    render(<AccessEventsToolbar filters={{ ...EMPTY, from: '2026-09-20' }} onChange={onChange} devices={[]} />);

    fireEvent.change(screen.getByLabelText('Sanagacha'), { target: { value: '2026-09-01' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-01', to: '2026-09-01' }));
  });

  it("to'g'ri oraliqqa tegmaydi", () => {
    const onChange = vi.fn();
    render(<AccessEventsToolbar filters={{ ...EMPTY, from: '2026-09-01' }} onChange={onChange} devices={[]} />);

    fireEvent.change(screen.getByLabelText('Sanagacha'), { target: { value: '2026-09-20' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-01', to: '2026-09-20' }));
  });
});
