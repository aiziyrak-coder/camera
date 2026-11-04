import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { HisobotState } from '../../lib/hisobotApi';
import type { LessonGrid as LessonGridData } from '../../lib/lessonGridApi';
import LessonGrid from './LessonGrid';

const GRID: LessonGridData = {
  kind: 'talaba',
  date_from: '2026-11-04',
  date_to: '2026-11-04',
  mode: 'slots',
  columns: [
    { key: '08:00', label: '1-juftlik', sub: '08:00' },
    { key: '09:30', label: '2-juftlik', sub: '09:30' },
  ],
  counts: { hammasi: 2, kelmadi: 1, kech_keldi: 0, toliq: 1, yuzsiz: 1, olchanmadi: 0 },
  status: 'hammasi',
  sort: 'guruh',
  total: 2,
  page: 1,
  page_size: 50,
  totals: { lessons: 4, attended: 3, late: 0, absent: 1, unmeasured: 0, pending: 0, rate: 75 },
  without_lessons: 0,
  rows: [
    {
      id: 'p1',
      full_name: 'Aliyev Anvar',
      unit: 'Davolash ishi · 2-kurs · DI-2301',
      enrolled: true,
      cells: {
        '08:00': { status: 'keldi', lesson_id: 'l1', subject: 'Anatomiya', room: '205', start: '08:00', end: '09:20',
          first_seen: '08:01', detail: null, camera: true },
        '09:30': { status: 'kelmadi', lesson_id: 'l2', subject: 'Fiziologiya', room: '310', start: '09:30', end: '10:50',
          first_seen: null, detail: null, camera: true },
      },
      totals: { lessons: 2, attended: 1, late: 0, absent: 1, unmeasured: 0, pending: 0, rate: 50 },
    },
    {
      id: 'p2',
      full_name: 'Botirova Nigora',
      unit: 'Davolash ishi · 2-kurs · DI-2301',
      enrolled: false,
      cells: {
        '08:00': { status: 'keldi', lesson_id: 'l1', subject: 'Anatomiya', room: '205', start: '08:00', end: '09:20',
          first_seen: '08:02', detail: null, camera: true },
        '09:30': { status: 'keldi', lesson_id: 'l2', subject: 'Fiziologiya', room: '310', start: '09:30', end: '10:50',
          first_seen: '09:31', detail: null, camera: true },
      },
      totals: { lessons: 2, attended: 2, late: 0, absent: 0, unmeasured: 0, pending: 0, rate: 100 },
    },
  ],
};

const paths: string[] = [];
vi.mock('../../lib/useApiResource', () => ({
  useApiResource: (path: string | null) => {
    if (path) paths.push(path);
    if (path?.startsWith('/api/hisobot/darslar')) return { data: GRID, loading: false, error: null, reload: () => {} };
    return { data: null, loading: Boolean(path), error: null, reload: () => {} };
  },
}));

const STATE: HisobotState = {
  section: 'talabalar', view: 'royxat', month: '2026-11', preset: 'today', from: '2026-11-04', to: '2026-11-04',
  criterion: '', faculty: '', course: '', group: 'DI-2301', unitKind: '', unit: '', q: '',
};

describe('LessonGrid', () => {
  it('har odam va har juftlik holati, aqlli filtr va odam hisoboti', () => {
    render(
      <MemoryRouter>
        <LessonGrid state={STATE} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1-juftlik')).toBeTruthy();
    const row = screen.getByText('Aliyev Anvar').closest('tr') as HTMLElement;
    expect(within(row).getByText('✓')).toBeTruthy();
    expect(within(row).getByText('✗')).toBeTruthy();
    expect(within(row).getByText('50%')).toBeTruthy();
    expect(within(row).getByTitle(/Fiziologiya/).textContent).toBe('✗');

    fireEvent.click(screen.getByRole('button', { name: /Kelmaganlar/ }));
    expect(paths.at(-1)).toContain('status=kelmadi');
    expect(paths.at(-1)).toContain('group=DI-2301');

    expect(screen.getAllByText("yuzi yo'q")).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /O'lchanmagan darsi bor/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Aliyev Anvar' }));
    expect(paths.some((p) => p.startsWith('/api/situation/people/p1?'))).toBe(true);
  });
});
