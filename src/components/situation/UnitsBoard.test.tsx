import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KafedraStat } from '../../lib/situationApi';
import { UnitsBoard } from './UnitsBoard';
import { unitBoardItems } from './situationUtils';

/** Ilgari bu holatlar `UnitsRanking` reytingida tekshirilardi. Ko'rinish
 *  holat taxtasiga almashdi, lekin tekshirilayotgan xulq o'sha:
 *  yuklanayotganda son aytilmaydi, eskirgan raqam ustida xato yoziladi. */

const unit = (id: string, rate: number): KafedraStat => ({
  id,
  name: `Kafedra ${id}`,
  kind: 'kafedra',
  building: null,
  unassigned: false,
  staffTotal: 10,
  enrolled: 10,
  present: 8,
  late: 1,
  absent: 2,
  dayOff: 0,
  notYet: 0,
  noData: 0,
  rate,
  lessonsToday: 0,
  teacherLateLessons: 0,
  teacherMissedLessons: 0,
});

const show = (props: Partial<Parameters<typeof UnitsBoard>[0]> & { units?: KafedraStat[] }) => {
  const { units, ...rest } = props;
  const items = unitBoardItems(units ?? []);
  return render(
    <MemoryRouter>
      <UnitsBoard
        items={items}
        loading={false}
        error={null}
        onRetry={() => {}}
        emptyTitle="Ma'lumot yo'q"
        errorTitle="Ro'yxat olinmadi"
        {...rest}
      />
    </MemoryRouter>,
  );
};

describe('UnitsBoard', () => {
  it('yuklanayotganda taxta emas, yuklanish holati ko\'rinadi', () => {
    show({ loading: true });
    expect(screen.getByText(/yuklanmoqda/i)).toBeInTheDocument();
  });

  it("eski ma'lumot ustida xato bo'lsa — jim qolinmaydi", () => {
    show({ units: [unit('a', 90), unit('b', 70)], error: 'Tarmoq xatosi' });
    expect(screen.getByText(/Yangilanmadi/)).toBeInTheDocument();
    expect(screen.getByText(/Tarmoq xatosi/)).toBeInTheDocument();
  });

  it("ma'lumot bor va xato yo'q bo'lsa ogohlantirish chiqmaydi", () => {
    show({ units: [unit('a', 90), unit('b', 70)] });
    expect(screen.queryByText(/Yangilanmadi/)).toBeNull();
    // Son endi panel ramkasida (sahifada); taxtada qatorlarning o'zi turadi.
    expect(screen.getByText('Kafedra a')).toBeInTheDocument();
    expect(screen.getByText('Kafedra b')).toBeInTheDocument();
  });

  it('svetofor hukmi rang bilan birga harf sifatida ham chiqadi', () => {
    show({ units: [unit('a', 95), unit('b', 40)] });
    // Y — talab bajarilgan, Q — chora kerak. Rangni ko'rmagan o'quvchi ham o'qiydi.
    expect(screen.getAllByTitle(/Chora kerak/).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Talab bajarilgan/).length).toBeGreaterThan(0);
  });
});
