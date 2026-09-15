import type { jsPDF as JsPdf } from 'jspdf';
import type { AttendancePopulation, ReportAnalytics, ReportInsight } from '../types';
import { findChartSvg, svgToPng } from './svgToPng';
import { UZ_WEEKDAYS_SHORT } from './uzDate';

/**
 * Rasmiy PDF hisobot — sahifadagi tahlil bilan bir xil tuzilma.
 *
 * Klientda yasaladi: server CPU'si kamera AI uchun band. jspdf faqat
 * eksport bosilganda yuklanadi (dynamic import), shrift ham.
 *
 * Shrift — Noto Sans (SIL OFL, public/fonts/). jsPDF'ning ichki helvetica
 * shrifti o'zbekcha o‘ / g‘ / ʻ belgilarini chiqara olmaydi.
 */

type Rgb = [number, number, number];

const MARGIN = 44;
const BOTTOM = 56;
const FONT = 'NotoSans';
const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const LINE: Rgb = [226, 232, 240];
const ACCENT: Rgb = [79, 70, 229];
const HEADER_BG: Rgb = [238, 242, 255];
const ZEBRA: Rgb = [248, 250, 252];

const LEVEL_COLOR: Record<ReportInsight['level'], Rgb> = {
  critical: [220, 38, 38],
  warning: [217, 119, 6],
  info: [79, 70, 229],
  ok: [5, 150, 105],
};
const LEVEL_LABEL: Record<ReportInsight['level'], string> = {
  critical: 'Shoshilinch',
  warning: 'Diqqat',
  info: "Ma'lumot",
  ok: 'Yaxshi',
};

interface Column {
  title: string;
  width: number; // kenglik ulushi, jami 1
  align?: 'left' | 'right';
}

async function fontBase64(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Shrift yuklanmadi (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

class Writer {
  readonly doc: JsPdf;
  readonly width: number;
  readonly height: number;
  readonly contentWidth: number;
  y = MARGIN;

  constructor(doc: JsPdf) {
    this.doc = doc;
    this.width = doc.internal.pageSize.getWidth();
    this.height = doc.internal.pageSize.getHeight();
    this.contentWidth = this.width - MARGIN * 2;
  }

  ensure(space: number): void {
    if (this.y + space > this.height - BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN + 6;
    }
  }

  text(
    value: string,
    { size = 10, bold = false, color = INK, gap = 4, x = MARGIN, width = this.contentWidth }: {
      size?: number;
      bold?: boolean;
      color?: Rgb;
      gap?: number;
      x?: number;
      width?: number;
    } = {},
  ): void {
    const { doc } = this;
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineHeight = size * 1.4;
    for (const line of doc.splitTextToSize(value, width) as string[]) {
      this.ensure(lineHeight);
      doc.text(line, x, this.y + size);
      this.y += lineHeight;
    }
    this.y += gap;
  }

  heading(title: string, subtitle?: string): void {
    this.ensure(56);
    this.y += 10;
    this.doc.setFillColor(...ACCENT);
    this.doc.rect(MARGIN, this.y + 2, 3, 16, 'F');
    this.text(title, { size: 13, bold: true, x: MARGIN + 10, gap: subtitle ? 0 : 6 });
    if (subtitle) this.text(subtitle, { size: 9, color: MUTED, x: MARGIN + 10, gap: 6 });
  }

  table(columns: Column[], rows: string[][]): void {
    const { doc } = this;
    const widths = columns.map((c) => c.width * this.contentWidth);
    const drawHeader = () => {
      this.ensure(24);
      doc.setFillColor(...HEADER_BG);
      doc.rect(MARGIN, this.y, this.contentWidth, 20, 'F');
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      let x = MARGIN;
      columns.forEach((column, i) => {
        const right = column.align === 'right';
        doc.text(column.title, right ? x + widths[i] - 6 : x + 6, this.y + 13.5, { align: right ? 'right' : 'left' });
        x += widths[i];
      });
      this.y += 20;
    };

    drawHeader();
    rows.forEach((row, index) => {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(8.5);
      const cells = row.map((cell, i) => doc.splitTextToSize(cell, widths[i] - 12) as string[]);
      const rowHeight = Math.max(...cells.map((lines) => lines.length)) * 11.5 + 8;
      if (this.y + rowHeight > this.height - BOTTOM) {
        doc.addPage();
        this.y = MARGIN + 6;
        drawHeader();
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8.5);
      }
      if (index % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(MARGIN, this.y, this.contentWidth, rowHeight, 'F');
      }
      doc.setTextColor(...INK);
      let x = MARGIN;
      cells.forEach((lines, i) => {
        const right = columns[i].align === 'right';
        lines.forEach((line, lineIndex) => {
          doc.text(line, right ? x + widths[i] - 6 : x + 6, this.y + 13 + lineIndex * 11.5, {
            align: right ? 'right' : 'left',
          });
        });
        x += widths[i];
      });
      this.y += rowHeight;
    });
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, this.y, MARGIN + this.contentWidth, this.y);
    this.y += 12;
  }

  async chart(root: ParentNode | null | undefined, key: string, caption: string): Promise<void> {
    if (!root) return;
    const svg = findChartSvg(root, key);
    if (!svg) return;
    const image = await svgToPng(svg);
    if (!image) return;
    const drawWidth = this.contentWidth;
    const drawHeight = (image.height / image.width) * drawWidth;
    this.ensure(drawHeight + 24);
    this.doc.addImage(image.dataUrl, 'PNG', MARGIN, this.y, drawWidth, drawHeight);
    this.y += drawHeight + 2;
    this.text(caption, { size: 8, color: MUTED, gap: 8 });
  }

  heatmap(matrix: number[][], max: number): void {
    const { doc } = this;
    const labelWidth = 24;
    const cell = (this.contentWidth - labelWidth) / 24;
    const blockHeight = cell * 7 + 18;
    this.ensure(blockHeight + 20);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    for (let hour = 0; hour < 24; hour += 3) {
      doc.text(String(hour).padStart(2, '0'), MARGIN + labelWidth + hour * cell + 1, this.y + 7);
    }
    const top = this.y + 10;
    matrix.forEach((row, day) => {
      doc.setTextColor(...MUTED);
      doc.text(UZ_WEEKDAYS_SHORT[day], MARGIN, top + day * cell + cell * 0.7);
      row.forEach((value, hour) => {
        const t = max > 0 && value > 0 ? 0.15 + 0.85 * (value / max) : 0;
        const color: Rgb = t
          ? [Math.round(255 - t * (255 - ACCENT[0])), Math.round(255 - t * (255 - ACCENT[1])), Math.round(255 - t * (255 - ACCENT[2]))]
          : [241, 245, 249];
        doc.setFillColor(...color);
        doc.rect(MARGIN + labelWidth + hour * cell + 0.6, top + day * cell + 0.6, cell - 1.2, cell - 1.2, 'F');
      });
    });
    this.y = top + cell * 7 + 4;
    this.text(`Rang qanchalik to'q bo'lsa, shu soatda signal shuncha ko'p (eng ko'pi: ${max} ta).`, {
      size: 8,
      color: MUTED,
      gap: 8,
    });
  }
}

function populationLine(p: AttendancePopulation): string {
  if (p.records === 0) {
    return `${p.label}: bu davrda davomat yozuvi yo'q (yuzi tasdiqlanganlar ${p.enrolled} / ${p.population}).`;
  }
  const parts = [
    `davomat ${p.rate === null ? '—' : `${p.rate}%`}`,
    `kelgan ${p.present} / ${p.records} yozuv`,
    `kech qolganlar ${p.late}${p.lateShare === null ? '' : ` (${p.lateShare}%)`}`,
  ];
  if (p.avgArrival) parts.push(`o'rtacha kelish ${p.avgArrival}`);
  return `${p.label}: ${parts.join(', ')}.`;
}

export async function exportAnalyticsPdf(
  a: ReportAnalytics,
  opts: { preparedBy?: string | null; root?: ParentNode | null; title?: string } = {},
): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const [{ jsPDF }, regular, bold] = await Promise.all([
    import('jspdf'),
    fontBase64(`${base}fonts/NotoSans-Regular.ttf`),
    fontBase64(`${base}fonts/NotoSans-Bold.ttf`),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NotoSans-Regular.ttf', regular);
  doc.addFont('NotoSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', FONT, 'bold');

  const w = new Writer(doc);

  // ── Sarlavha
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, w.width, 6, 'F');
  w.y = MARGIN;
  w.text("FARG'ONA JSSTI — SITUATSION MARKAZ", { size: 9, bold: true, color: ACCENT, gap: 2 });
  w.text(opts.title ?? 'Tahliliy hisobot', { size: 20, bold: true, gap: 2 });
  w.text(`Davr: ${a.period.label}   ·   Solishtirish: ${a.previousPeriod.label}`, { size: 10, color: MUTED, gap: 1 });
  w.text(
    `Tayyorlandi: ${a.generatedAt}${opts.preparedBy ? `   ·   Tayyorlagan: ${opts.preparedBy}` : ''}`,
    { size: 10, color: MUTED, gap: 8 },
  );
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, w.y, w.width - MARGIN, w.y);
  w.y += 6;

  // ── 1. Xulosalar
  w.heading('1. Asosiy xulosalar', "Rahbariyat uchun: nimaga e'tibor berish kerak");
  for (const insight of a.insights) {
    w.ensure(44);
    doc.setFillColor(...LEVEL_COLOR[insight.level]);
    doc.circle(MARGIN + 4, w.y + 7, 3, 'F');
    w.text(`${LEVEL_LABEL[insight.level]}: ${insight.title}`, { size: 10.5, bold: true, x: MARGIN + 14, width: w.contentWidth - 14, gap: 0 });
    w.text(insight.text, { size: 9.5, color: [51, 65, 85], x: MARGIN + 14, width: w.contentWidth - 14, gap: 8 });
  }

  // ── 2. KPI
  w.heading("2. Asosiy ko'rsatkichlar", `Oldingi davr: ${a.previousPeriod.label}`);
  w.table(
    [
      { title: "Ko'rsatkich", width: 0.4 },
      { title: 'Joriy davr', width: 0.18, align: 'right' },
      { title: 'Oldingi davr', width: 0.18, align: 'right' },
      { title: "O'zgarish", width: 0.24, align: 'right' },
    ],
    a.kpis.map((k) => [k.note ? `${k.label} — ${k.note}` : k.label, k.display, k.previousDisplay ?? '—', k.deltaDisplay ?? '—']),
  );

  // ── 3. Davomat
  w.heading('3. Davomat', `${a.workingDays} ish kuni`);
  for (const [population, key] of [
    [a.attendance.staff, 'attendance-staff'],
    [a.attendance.students, 'attendance-students'],
  ] as const) {
    w.text(populationLine(population), { size: 10, bold: true, gap: 4 });
    if (population.records > 0) {
      await w.chart(opts.root, key, `${population.label}: kunlar bo'yicha keldi / kech keldi / kelmadi va davomat foizi`);
    }
    if (population.byFaculty.length > 0) {
      w.table(
        [
          { title: 'Fakultet', width: 0.44 },
          { title: 'Yozuvlar', width: 0.14, align: 'right' },
          { title: 'Kelgan', width: 0.14, align: 'right' },
          { title: 'Kech', width: 0.12, align: 'right' },
          { title: 'Davomat', width: 0.16, align: 'right' },
        ],
        population.byFaculty.map((f) => [f.name, String(f.total), String(f.present), String(f.late), f.rate === null ? '—' : `${f.rate}%`]),
      );
    }
    for (const warning of population.reliability.warnings) {
      w.text(`• ${warning}`, { size: 8.5, color: [146, 64, 14], gap: 2 });
    }
    w.y += 6;
  }
  await w.chart(opts.root, 'attendance-arrival', "Xodimlarning kelish vaqti taqsimoti (15 daqiqalik oraliqlar)");

  // ── 4. Xavfsizlik
  const s = a.security;
  w.heading('4. Xavfsizlik va AI signallar');
  w.text(
    `Jami ${s.total} ta signal: yuqori ${s.yuqori}, o'rta ${s.orta}, past ${s.past}. Tasdiqlangan ${s.confirmed}, ` +
      `rad etilgan ${s.rejected}, ko'rilmagan ${s.unreviewed}. Ish vaqtidan tashqari: ${s.night}. ` +
      `Aniqlik: ${s.precision === null ? "o'lchanmagan" : `${s.precision}%`}.`,
    { size: 10, gap: 6 },
  );
  if (s.total > 0) {
    await w.chart(opts.root, 'security-days', "Kunlar bo'yicha signallar (muhimlik darajasi bilan)");
    w.text("Hafta kunlari va soatlar bo'yicha signallar", { size: 10, bold: true, gap: 2 });
    w.heatmap(s.heatmap, s.heatmapMax);
  }
  if (s.topModules.length > 0) {
    w.table(
      [
        { title: 'Modul', width: 0.46 },
        { title: 'Signallar', width: 0.14, align: 'right' },
        { title: 'Ulushi', width: 0.12, align: 'right' },
        { title: "Ko'rilmagan", width: 0.14, align: 'right' },
        { title: 'Aniqlik', width: 0.14, align: 'right' },
      ],
      s.topModules.map((m) => [`#${m.code} ${m.name}`, String(m.count), `${m.share}%`, String(m.unreviewed), m.precision === null ? '—' : `${m.precision}%`]),
    );
  }
  if (s.topCameras.length > 0) {
    w.table(
      [
        { title: 'Kamera', width: 0.5 },
        { title: 'Bino', width: 0.24 },
        { title: 'Signallar', width: 0.13, align: 'right' },
        { title: 'Ulushi', width: 0.13, align: 'right' },
      ],
      s.topCameras.map((c) => [c.name, c.building || '—', String(c.count), `${c.share}%`]),
    );
  }

  // ── 5. Darslar
  const l = a.lessons;
  w.heading('5. Darslar');
  if (l.sessions === 0) {
    w.text("Bu davrda dars mashg'uloti qayd etilmagan.", { size: 10, color: MUTED, gap: 6 });
  } else {
    w.text(
      `${l.sessions} ta dars (AI tahlil qilgani ${l.analyzedSessions}). O'rtacha diqqat: ${l.avgAttention === null ? '—' : `${l.avgAttention}%`}. ` +
        `Uyqu holatlari: ${l.sleepIncidents}. O'qituvchi o'z vaqtida kelgan: ` +
        `${l.teacherOnTimeRate === null ? '—' : `${l.teacherOnTimeRate}% (${l.checkedSessions} ta tekshirilgan darsdan)`}.`,
      { size: 10, gap: 6 },
    );
    await w.chart(opts.root, 'lessons-attention', "Darslardagi o'rtacha diqqat, kunlar bo'yicha");
  }

  // ── 6. Tizim
  const sys = a.system;
  w.heading('6. Tizim holati', 'Hisobot tayyorlangan paytdagi holat');
  w.table(
    [
      { title: "Ko'rsatkich", width: 0.6 },
      { title: 'Qiymat', width: 0.4, align: 'right' },
    ],
    [
      ['Kameralar: jami / faol / aloqada', `${sys.camerasTotal} / ${sys.camerasActive} / ${sys.camerasLive}`],
      ['Aloqadagi kameralar ulushi', sys.liveRate === null ? '—' : `${sys.liveRate}%`],
      ...sys.coverage.map((c) => [
        `${c.label}: yuzi tasdiqlanganlar`,
        `${c.confirmed} / ${c.total}${c.percent === null ? '' : ` (${c.percent}%)`}`,
      ]),
    ],
  );

  // ── Imzo
  w.ensure(80);
  w.y += 18;
  w.text('Tasdiqlayman: ________________________________', { size: 10.5, gap: 10 });
  w.text('Sana: «____» ______________ 20___ yil', { size: 10.5, gap: 4 });

  // ── Sahifa pastki qismi
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, w.height - 36, w.width - MARGIN, w.height - 36);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Situatsion Markaz tizimi tomonidan avtomatik tayyorlandi', MARGIN, w.height - 24);
    doc.text(`${page} / ${pages}`, w.width - MARGIN, w.height - 24, { align: 'right' });
  }

  doc.save(`hisobot-${a.period.start}_${a.period.end}.pdf`);
}
