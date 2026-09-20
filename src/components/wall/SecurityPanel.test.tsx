import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityPanel } from './SecurityPanel';

const empty = new Set<string>();

describe('SecurityPanel — kameralar satri', () => {
  it('onlayn soni faol sonidan katta bo\'lsa manfiy son chiqmaydi', () => {
    render(<SecurityPanel events={[]} camerasOnline={12} camerasTotal={10} freshIds={empty} />);
    expect(screen.queryByText(/-2 tasi javob bermayapti/)).toBeNull();
    expect(screen.getByText(/hammasi ishlayapti/)).toBeInTheDocument();
  });

  it("faol kamera yo'q bo'lsa 'hammasi ishlayapti' deyilmaydi", () => {
    render(<SecurityPanel events={[]} camerasOnline={0} camerasTotal={0} freshIds={empty} />);
    expect(screen.getByText("Faol kamera yo'q")).toBeInTheDocument();
  });

  it('javob bermayotgan kameralar soni yoziladi', () => {
    render(<SecurityPanel events={[]} camerasOnline={7} camerasTotal={10} freshIds={empty} />);
    expect(screen.getByText(/10 ta faol kameradan 3 tasi javob bermayapti/)).toBeInTheDocument();
  });
});
