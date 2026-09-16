import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CriteriaCards from './CriteriaCards';
import type { ReportCriterion } from '../../types';

/** Hisobotning eng katta xavfi — bo'sh raqamni "hammasi joyida" deb
 *  ko'rsatish. Shu sabab bu testlar raqamlar bilan birga IZOHNI ham
 *  himoya qiladi. */
const davomat: ReportCriterion = {
  key: 'davomat',
  title: 'Davomat',
  subtitle: 'Kelgan, kechikkan va kelmagan kun-yozuvlari',
  total: 3,
  unit: 'kun-yozuv',
  detail: 'people',
  moduleCodes: [],
  buckets: [
    { key: 'keldi', label: 'Keldi', count: 1, tone: 'green' },
    { key: 'kech_keldi', label: 'Kechikdi', count: 1, tone: 'amber' },
    { key: 'kelmadi', label: 'Kelmadi', count: 1, tone: 'red' },
  ],
};

const pausedCriterion: ReportCriterion = {
  ...davomat,
  key: 'davomat-talaba',
  total: 0,
  note: "Bu populyatsiya uchun davomat moduli o'chirilgan — raqamlar yangilanmaydi.",
  buckets: davomat.buckets.map((bucket) => ({ ...bucket, count: 0 })),
};

describe('CriteriaCards', () => {
  it('har chelakning raqami ko’rinadi', () => {
    render(<CriteriaCards criteria={[davomat]} loading={false} onOpen={() => {}} />);
    expect(screen.getByText('Davomat')).toBeInTheDocument();
    expect(screen.getByText('Kelmadi')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(3);
  });

  it('chelakni bosish o’sha ro’yxatni ochadi', () => {
    const onOpen = vi.fn();
    render(<CriteriaCards criteria={[davomat]} loading={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Kelmadi'));
    expect(onOpen).toHaveBeenCalledWith(davomat, 'kelmadi');
  });

  it('nol raqam sababsiz qolmaydi', () => {
    render(<CriteriaCards criteria={[pausedCriterion]} loading={false} onOpen={() => {}} />);
    expect(screen.getByText(/davomat moduli o‘chirilgan|davomat moduli o'chirilgan/)).toBeInTheDocument();
  });

  it('batafsili yo’q kriteriyada chelaklar bosilmaydi', () => {
    const onOpen = vi.fn();
    render(
      <CriteriaCards
        criteria={[{ ...davomat, key: 'dars', detail: 'none' }]}
        loading={false}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByText('Keldi'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
