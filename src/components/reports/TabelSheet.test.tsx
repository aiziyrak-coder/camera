// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TabelView from './TabelView';
import { readState, writeState } from '../../lib/hisobotApi';
import { tabelPaths, type TabelReport } from '../../lib/tabelApi';

/**
 * Oylik tabel — buyurtmachi imzolaydigan hujjat, shuning uchun sinovlar
 * qog'ozga tushadigan narsalarni tekshiradi: har odamga har kun uchun
 * bitta katak, yuzi ro'yxatga olinmaganning qatori, o'ngdagi jami,
 * shartli belgilar va imzo bloki. Backend hali tayyor emas — javob
 * shartnomaga ko'ra mock qilinadi.
 */

const MONTH = '2026-09';

/** 3 kunlik qisqa oy — sinovda o'qish oson; uzunligi ahamiyatsiz. */
const DAYS = [
  { day: 1, weekday: 'Seshanba', isWorkDay: true, isFuture: false },
  { day: 2, weekday: 'Chorshanba', isWorkDay: true, isFuture: false },
  { day: 3, weekday: 'Shanba', isWorkDay: false, isFuture: false },
];

function report(patch: Partial<TabelReport> = {}): TabelReport {
  return {
    title: 'Davomat tabeli',
    scope: 'Davolash ishi, 2-kurs',
    month: MONTH,
    monthLabel: 'Sentabr 2026',
    days: DAYS,
    people: [
      {
        id: 'p1',
        fullName: 'Aliyev Vali',
        group: 'DI-2301',
        enrolled: true,
        cells: [
          { day: 1, mark: '+', title: '1-kun: 08:12 da keldi' },
          { day: 2, mark: 'K', title: '2-kun: 09:41 da keldi (kech)' },
          { day: 3, mark: 'D', title: '3-kun: dam olish kuni' },
        ],
        totals: { present: 1, late: 1, absent: 0, unknown: 0, workDays: 2 },
      },
      {
        id: 'p2',
        fullName: 'Karimova Zilola',
        group: 'DI-2301',
        enrolled: false,
        cells: [
          { day: 1, mark: '·', title: "Yuzi ro'yxatga olinmagan" },
          { day: 2, mark: '·', title: "Yuzi ro'yxatga olinmagan" },
          { day: 3, mark: '·', title: "Yuzi ro'yxatga olinmagan" },
        ],
        totals: { present: 0, late: 0, absent: 0, unknown: 2, workDays: 2 },
      },
    ],
    totals: { people: 2, present: 1, late: 1, absent: 0, unknown: 2, notEnrolled: 1 },
    legend: [
      { mark: '+', label: 'Keldi' },
      { mark: 'K', label: 'Kech keldi' },
      { mark: '–', label: 'Kelmadi' },
      { mark: 'D', label: 'Dam olish' },
      { mark: '·', label: "Ma'lumot yo'q" },
    ],
    note: null,
    ...patch,
  };
}

function renderSheet(patch: Partial<TabelReport> = {}) {
  const data = report(patch);
  const { container } = render(<TabelView data={data} section="talabalar" />);
  return { container, data };
}

describe('Oylik tabel — jadval', () => {
  it('har odamga har kun uchun bitta katak chizadi', () => {
    const { container, data } = renderSheet();
    const cells = container.querySelectorAll('[data-tabel-cell]');
    expect(cells.length).toBe(data.people.length * data.days.length);
    expect(container.querySelectorAll('[data-tabel-row]').length).toBe(2);
  });

  it('kun ustunida hafta kuni harfi va sana turadi', () => {
    const { container } = renderSheet();
    const header = container.querySelector('thead th[data-day="1"]') as HTMLElement;
    expect(header.getAttribute('title')).toContain('1-kun, Seshanba');
    expect(header.textContent).toContain('1');
    // 2026-09-01 — seshanba: qisqartma "Se".
    expect(header.textContent).toContain('Se');
  });

  it('dam olish kuni alohida belgilanadi', () => {
    const { container } = renderSheet();
    expect(container.querySelectorAll('td[data-tabel-cell][data-rest]').length).toBe(2);
  });

  it('katakda belgi ko\'rinadi va izohi title/aria bilan beriladi', () => {
    const { container } = renderSheet();
    const cell = container.querySelector('[data-tabel-cell][data-day="2"]') as HTMLElement;
    expect(cell.textContent).toBe('K');
    expect(cell.getAttribute('title')).toBe('2-kun: 09:41 da keldi (kech)');
    expect(cell.getAttribute('aria-label')).toContain('Aliyev Vali');
    // Sichqonchasiz ham o'qish uchun: katak fokus oladi.
    expect(cell.getAttribute('tabindex')).toBe('0');
  });

  it("yuzi ro'yxatga olinmagan odam ham qatorga tushadi — hammasi «·»", () => {
    const { container } = renderSheet();
    const rows = container.querySelectorAll('[data-tabel-row]');
    const row = rows[1];
    expect(within(row as HTMLElement).getByText(/Karimova Zilola/)).toBeTruthy();
    const marks = [...row.querySelectorAll('[data-tabel-cell]')].map((cell) => cell.textContent);
    expect(marks).toEqual(['·', '·', '·']);
    expect(row.querySelector('[data-tabel-cell]')?.getAttribute('title')).toContain("Yuzi ro'yxatga olinmagan");
  });

  it("server katak bermagan kun ham «·» bo'ladi (bo'sh qolmaydi)", () => {
    const { container } = renderSheet({
      people: [
        {
          id: 'p3',
          fullName: 'Toshev Olim',
          group: 'DI-2302',
          enrolled: true,
          cells: [{ day: 1, mark: '+', title: '1-kun: keldi' }],
          totals: { present: 1, late: 0, absent: 0, unknown: 1, workDays: 2 },
        },
      ],
    });
    const marks = [...container.querySelectorAll('[data-tabel-cell]')].map((cell) => cell.textContent);
    expect(marks).toEqual(['+', '·', '·']);
  });

  it("o'ngdagi jami ustunlari har qator uchun chiqadi", () => {
    const { container } = renderSheet();
    ['Keldi', 'Kech', 'Kelmadi', 'Aniqlanmadi', 'Ish kuni'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${label}$`) })).toBeTruthy();
    });
    const first = container.querySelectorAll('[data-tabel-row]')[0];
    expect(first.querySelector('[data-total="present"]')?.textContent).toBe('1');
    expect(first.querySelector('[data-total="late"]')?.textContent).toBe('1');
    expect(first.querySelector('[data-total="absent"]')?.textContent).toBe('0');
    expect(first.querySelector('[data-total="workDays"]')?.textContent).toBe('2');
  });

  it('tepada tanlov, oy va odamlar soni so\'z bilan yoziladi', () => {
    renderSheet();
    expect(screen.getAllByText(/Davolash ishi, 2-kurs/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sentabr 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 talaba/)).toBeTruthy();
  });

  it('serverdagi izoh (note) ko\'rsatiladi', () => {
    renderSheet({ note: '15-sentabrdan keyin kamera almashtirilgan.' });
    expect(screen.getByText(/15-sentabrdan keyin/)).toBeTruthy();
  });
});

describe('Oylik tabel — chop etish elementlari', () => {
  it('qog\'oz sarlavhasi, shartli belgilar va imzo bloki bor', () => {
    const { container } = renderSheet();
    // Chop etish uchun alohida sarlavha (ekranda .print-only yashirin).
    const head = container.querySelector('.tabel-print-head');
    expect(head).toBeTruthy();
    expect(head?.classList.contains('print-only')).toBe(true);
    expect(head?.textContent).toContain('Davomat tabeli');
    expect(head?.textContent).toContain('Davolash ishi, 2-kurs');
    expect(head?.textContent).toContain('Sentabr 2026');

    // Belgilar lug'ati DOIM chiqadi — qog'ozda ham.
    const legend = container.querySelector('.tabel-legend');
    expect(legend).toBeTruthy();
    expect(legend?.classList.contains('print-hide')).toBe(false);
    expect(legend?.textContent).toContain('Kech keldi');
    expect(legend?.textContent).toContain('Dam olish');

    // Imzo bloki: ikki imzo va sana.
    const sign = container.querySelector('.tabel-sign');
    expect(sign?.classList.contains('print-only')).toBe(true);
    expect(sign?.textContent).toContain("Mas'ul shaxs");
    expect(sign?.textContent).toContain("Bo'linma rahbari");
    expect(sign?.textContent).toContain('Sana:');
    expect(sign?.querySelectorAll('.tabel-sign-line').length).toBe(2);

    // Varaq landscape bet qoidasiga ulanadi.
    expect(container.querySelector('.tabel-print')).toBeTruthy();
  });

  it('server legend bermasa ham belgilar tushuntiriladi', () => {
    const { container } = renderSheet({ legend: [] });
    const legend = container.querySelector('.tabel-legend');
    expect(legend?.textContent).toContain('Keldi');
    expect(legend?.textContent).toContain("Ma'lumot yo'q");
  });
});

describe('Oylik tabel — halol holatlar', () => {
  it("odam yo'q bo'lsa nima qilishni aytadi", () => {
    renderSheet({ people: [], totals: { people: 0, present: 0, late: 0, absent: 0, unknown: 0, notEnrolled: 0 } });
    expect(screen.getByText("Bu tanlovda odam yo'q")).toBeTruthy();
    expect(screen.getByText(/Filtrlarni kengaytiring/)).toBeTruthy();
  });

  it("oyda ish kuni bo'lmasa bo'sh jadval emas, izoh chiqadi", () => {
    renderSheet({ days: [] });
    expect(screen.getByText('Bu oy uchun tabel tuzilmagan')).toBeTruthy();
    expect(screen.getByText(/Boshqa oyni tanlang/)).toBeTruthy();
  });

  it("oyda birorta qayd bo'lmasa jadval ustida sabab yoziladi", () => {
    renderSheet({ totals: { people: 2, present: 0, late: 0, absent: 0, unknown: 6, notEnrolled: 0 } });
    expect(screen.getByRole('status').textContent).toContain('hali birorta davomat qayd etilmagan');
  });
});

describe('Oylik tabel — URL va Excel manzili', () => {
  it('oy URL holatiga yoziladi va qaytib o\'qiladi', () => {
    const next = writeState(new URLSearchParams('bolim=talabalar'), { view: 'tabel', month: '2026-03' });
    expect(next.get('korinish')).toBe('tabel');
    expect(next.get('oy')).toBe('2026-03');
    const state = readState(next, '2026-09-19');
    expect(state.view).toBe('tabel');
    expect(state.month).toBe('2026-03');
  });

  it("bo'lim almashganda oy va ko'rinish saqlanadi", () => {
    const next = writeState(new URLSearchParams('korinish=tabel&oy=2026-03&fakultet=f1'), { section: 'talabalar' });
    expect(next.get('korinish')).toBe('tabel');
    expect(next.get('oy')).toBe('2026-03');
    // Bo'limga xos filtr esa tozalanadi.
    expect(next.get('fakultet')).toBeNull();
  });

  it('Excel havolasi barcha filtrlarni olib ketadi', () => {
    const state = {
      ...readState(new URLSearchParams('bolim=talabalar&korinish=tabel&oy=2026-03'), '2026-09-19'),
      faculty: 'f1',
      course: '2',
      group: '101-guruh',
      q: 'Ali',
    };
    const url = tabelPaths.excel(state);
    expect(url).toContain('/api/hisobot/tabel.xlsx');
    expect(url).toContain('kind=talaba');
    expect(url).toContain('oy=2026-03');
    expect(url).toContain('faculty=f1');
    expect(url).toContain('course=2');
    expect(url).toContain('group=101-guruh');
    expect(url).toContain('q=Ali');
  });

  it("xodimlar bo'limida bo'linma filtrlari ketadi, bo'shlari emas", () => {
    const state = {
      ...readState(new URLSearchParams('korinish=tabel&oy=2026-03'), '2026-09-19'),
      unitKind: 'kafedra',
      unit: 'u1',
      q: '   ',
    };
    const url = tabelPaths.excel(state);
    expect(url).toContain('kind=xodim');
    expect(url).toContain('unit_kind=kafedra');
    expect(url).toContain('unit=u1');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('faculty=');
  });
});

/* ------------------------------------------------------------------
 * Sahifa darajasi: oy tanlagichi URL'ni o'zgartiradimi, "Excel"
 * havolasi joriy filtrlar bilan tuziladimi.
 * ---------------------------------------------------------------- */

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 'test-token', user: null }) }));

vi.mock('../../lib/useApiResource', () => ({
  useApiResource: (path: string | null) => {
    if (!path) return { data: null, loading: false, error: null, reload: () => {} };
    if (path.startsWith('/api/hisobot/filters')) {
      return {
        data: { faculties: [{ id: 'f1', name: 'Davolash ishi', count: 10 }], groups: [], courses: [], units: [], unit_kinds: [] },
        loading: false,
        error: null,
        reload: () => {},
      };
    }
    if (path.startsWith('/api/hisobot/tabel')) {
      return { data: report(), loading: false, error: null, reload: () => {} };
    }
    return { data: null, loading: false, error: null, reload: () => {} };
  },
}));

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}

async function renderPage(search: string) {
  const { default: ReportsPage } = await import('../../pages/admin/ReportsPage');
  render(
    <MemoryRouter initialEntries={[`/hisobotlar${search}`]}>
      <ReportsPage />
      <Probe />
    </MemoryRouter>,
  );
}

describe('Hisobotlar sahifasi — tabel rejimi', () => {
  it('oy tanlagichi URL\'ni yangilaydi', async () => {
    await renderPage('?bolim=talabalar&korinish=tabel&oy=2026-09');
    fireEvent.change(screen.getByRole('combobox', { name: 'Oy' }), { target: { value: '03' } });
    expect(screen.getByTestId('url').textContent).toContain('oy=2026-03');
    expect(screen.getByTestId('url').textContent).toContain('korinish=tabel');
  });

  it('"Oldingi oy" tugmasi ham URL orqali ishlaydi', async () => {
    await renderPage('?bolim=talabalar&korinish=tabel&oy=2026-09');
    fireEvent.click(screen.getByRole('button', { name: 'Oldingi oy' }));
    expect(screen.getByTestId('url').textContent).toContain('oy=2026-08');
  });

  it('tabel rejimida erkin sana oralig\'i o\'rnida oy tanlagichi turadi', async () => {
    await renderPage('?bolim=talabalar&korinish=tabel&oy=2026-09');
    expect(screen.getByRole('combobox', { name: 'Oy' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Yil' })).toBeTruthy();
    // Qamrov filtrlari o'z joyida qoladi.
    expect(screen.getByRole('combobox', { name: /Fakultet/ })).toBeTruthy();
  });

  it('"Excel" havolasi joriy filtrlarni olib ketadi', async () => {
    await renderPage('?bolim=talabalar&korinish=tabel&oy=2026-03&fakultet=f1&kurs=2&guruh=101-guruh&q=Ali');
    const href = screen.getByRole('link', { name: /Excel/ }).getAttribute('href') ?? '';
    expect(href).toContain('/api/hisobot/tabel.xlsx');
    expect(href).toContain('kind=talaba');
    expect(href).toContain('oy=2026-03');
    expect(href).toContain('faculty=f1');
    expect(href).toContain('course=2');
    expect(href).toContain('group=101-guruh');
    expect(href).toContain('q=Ali');
  });

  it('ko\'rinish almashtirgichi va bo\'lim tablari birga turadi', async () => {
    await renderPage('?bolim=talabalar&korinish=tabel');
    expect(screen.getByRole('tab', { name: 'Oylik tabel' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Talabalar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Chop etish/ })).toBeTruthy();
  });
});
