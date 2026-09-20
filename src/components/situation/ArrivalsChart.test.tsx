import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArrivalsChart } from './ArrivalsChart';

const rows = (hour: number, students: number) => [{ hour, students, staff: 0 }];

describe('ArrivalsChart', () => {
  /** Sutkada "24:00" degan soat yo'q — 23:00 oralig'i 00:00 da tugaydi. */
  it("eng gavjum soat 23 bo'lsa oraliq '23:00–00:00' deb yoziladi", () => {
    render(<ArrivalsChart rows={rows(23, 5)} loading={false} currentHour={null} />);
    expect(screen.getByText(/23:00–00:00/)).toBeInTheDocument();
  });

  it("odatiy soat oralig'i to'g'ri ko'rsatiladi", () => {
    render(<ArrivalsChart rows={rows(8, 40)} loading={false} currentHour={null} />);
    expect(screen.getByText(/08:00–09:00/)).toBeInTheDocument();
  });

  it("o'tgan kun uchun bo'sh holatda 'bugun' deyilmaydi", () => {
    render(<ArrivalsChart rows={[]} loading={false} currentHour={null} isToday={false} />);
    expect(screen.getByText("Bu kuni hech kim ko'rinmagan")).toBeInTheDocument();
  });

  it("bugungi bo'sh holat boshqacha yoziladi", () => {
    render(<ArrivalsChart rows={[]} loading={false} currentHour={null} isToday />);
    expect(screen.getByText("Bugun hali hech kim ko'rinmadi")).toBeInTheDocument();
  });
});
