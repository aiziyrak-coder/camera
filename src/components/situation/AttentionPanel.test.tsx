import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttentionPanel, countAttentionIssues, type AttentionPanelProps } from './AttentionPanel';

const base: AttentionPanelProps = {
  loading: false,
  events: null,
  cameras: null,
  groups: [],
  groupLink: null,
  teacherLessons: [],
  teacherLink: null,
};

const show = (props: Partial<AttentionPanelProps>) =>
  render(
    <MemoryRouter>
      <AttentionPanel {...base} {...props} />
    </MemoryRouter>,
  );

/** "Diqqat talab" bo'sh bo'lishining ikki sababi bor: muammo yo'q, yoki
 *  manba serverdan kelmadi. Ikkinchisida "Hammasi joyida" deyish —
 *  rahbariyat uchun yolg'on tinchlik. */
describe('AttentionPanel — manba kelmaganda', () => {
  it("hamma manba kelgan va muammo yo'q — 'Hammasi joyida'", () => {
    show({});
    expect(screen.getByText('Hammasi joyida')).toBeInTheDocument();
  });

  it("manba kelmaganda 'Hammasi joyida' deyilmaydi, sabab yoziladi", () => {
    show({ unavailable: ['Guruhlar'] });
    expect(screen.queryByText('Hammasi joyida')).toBeNull();
    expect(screen.getByText(/Guruhlar ma'lumoti kelmadi/)).toBeInTheDocument();
  });

  it("muammo bor bo'lsa ham ro'yxat to'liq emasligi aytiladi", () => {
    show({
      cameras: { offline: 3, active: 107, link: null },
      unavailable: ['Hodisalar'],
    });
    expect(screen.getByText(/3 ta kamera aloqada emas/)).toBeInTheDocument();
    expect(screen.getByText(/Hodisalar ma'lumoti kelmadi/)).toBeInTheDocument();
  });
});

/** Sarlavhadagi raqam ro'yxatdagi qatorlar soniga teng bo'lishi kerak:
 *  rahbar "3 ta" deb o'qib, pastda 4 ta qator ko'rsa raqamga ishonmaydi. */
describe('AttentionPanel — sarlavhadagi son', () => {
  it('muhim hodisa va muddati o\'tgan hodisa alohida sanaladi', () => {
    const props = {
      events: { highOpen: 2, overdue: 1, top: [], link: () => '/hodisalar' },
      cameras: { offline: 1, active: 10, link: null },
      groups: [],
      teacherLessons: [],
    };
    show(props);
    // 1 (muhim) + 1 (muddati o'tgan) + 1 (kamera) = 3 ta qator.
    // Son endi panel ramkasida (sahifada) chiqadi — bu yerda uni
    // hisoblovchi yagona funksiya tekshiriladi.
    expect(countAttentionIssues(props)).toBe(3);
    expect(screen.getByText(/2 ta juda muhim hodisa hal qilinmagan/)).toBeInTheDocument();
    expect(screen.getByText(/1 ta hodisaning muddati o'tgan/)).toBeInTheDocument();
    expect(screen.getByText(/1 ta kamera aloqada emas/)).toBeInTheDocument();
  });

  it('davomati past guruhlar alohida bo\'limda ko\'rsatiladi', () => {
    show({
      groups: [
        {
          name: '101-guruh',
          faculty: null,
          facultyId: null,
          curator: null,
          course: 1,
          total: 20,
          enrolled: 20,
          present: 10,
          late: 0,
          absent: 8,
          dayOff: 0,
          notYet: 2,
          noData: 0,
          rate: 50,
        },
      ],
    });
    expect(screen.getByText(/Past guruhlar/i)).toBeInTheDocument();
    expect(screen.getByText('101-guruh')).toBeInTheDocument();
  });
});
