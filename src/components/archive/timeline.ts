import type { ArchiveRange } from '../../lib/archiveApi';

/** Timeline hisob-kitoblari — komponentdan ajratilgan (sinovlanadi). */

export interface ViewWindow {
  start: number; // ms
  end: number; // ms
}

/** Bugun — oxirgi (saqlanish + 1) soat, oxiri hozir; o'tgan kun — butun kun. */
export function defaultWindow(day: string, retentionHours: number, now: Date, tzOffsetMinutes = 300): ViewWindow {
  const dayStart = Date.parse(`${day}T00:00:00Z`) - tzOffsetMinutes * 60_000;
  const dayEnd = dayStart + 24 * 3_600_000;
  const nowMs = now.getTime();
  if (nowMs >= dayStart && nowMs < dayEnd) {
    const span = Math.max(1, retentionHours + 1) * 3_600_000;
    const end = Math.min(dayEnd, nowMs + 10 * 60_000);
    return { start: Math.max(dayStart, end - span), end };
  }
  return { start: dayStart, end: dayEnd };
}

export function toFraction(ms: number, view: ViewWindow): number {
  return (ms - view.start) / (view.end - view.start);
}

export function fromFraction(fraction: number, view: ViewWindow): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return view.start + clamped * (view.end - view.start);
}

/** Oraliqlar ko'rinish oynasiga qirqilgan holda (foizda). */
export function visibleRanges(ranges: readonly ArchiveRange[], view: ViewWindow): { left: number; width: number }[] {
  const out: { left: number; width: number }[] = [];
  for (const range of ranges) {
    const a = Math.max(Date.parse(range.start), view.start);
    const b = Math.min(Date.parse(range.end), view.end);
    if (b <= a) continue;
    out.push({ left: toFraction(a, view) * 100, width: ((b - a) / (view.end - view.start)) * 100 });
  }
  return out;
}

/** Vaqt yozilgan oraliq ichidami; bo'lmasa — keyingi yozuv boshlanishi (yoki null). */
export function playableFrom(ms: number, ranges: readonly ArchiveRange[]): number | null {
  const sorted = [...ranges].map((r) => [Date.parse(r.start), Date.parse(r.end)] as const).sort((a, b) => a[0] - b[0]);
  for (const [a, b] of sorted) {
    if (ms >= a && ms < b - 1000) return ms;
    if (ms < a) return a;
  }
  return null;
}

/** Soat belgilari: oyna uzunligiga qarab 15 daqiqa / 1 soat / 3 soat qadam. */
export function hourTicks(view: ViewWindow, tzOffsetMinutes = 300): { ms: number; label: string }[] {
  const span = view.end - view.start;
  const step = span <= 3 * 3_600_000 ? 15 * 60_000 : span <= 12 * 3_600_000 ? 3_600_000 : 3 * 3_600_000;
  const offset = tzOffsetMinutes * 60_000;
  const first = Math.ceil((view.start + offset) / step) * step - offset;
  const ticks: { ms: number; label: string }[] = [];
  for (let ms = first; ms <= view.end; ms += step) {
    const local = new Date(ms + offset);
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const mm = String(local.getUTCMinutes()).padStart(2, '0');
    ticks.push({ ms, label: `${hh}:${mm}` });
  }
  return ticks;
}

/** "10:42:05" — Toshkent vaqti. */
export function clockLabel(ms: number, tzOffsetMinutes = 300): string {
  const local = new Date(ms + tzOffsetMinutes * 60_000);
  return [local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}
