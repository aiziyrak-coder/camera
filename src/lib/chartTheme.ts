/** Barcha admin grafiklari uchun yagona uslub (recharts). Ranglar semantik:
 *  keldi/kech/kelmadi va past/o'rta/yuqori har bir sahifada bir xil ma'noda. */

export const AXIS_COLOR = '#94a3b8';
export const GRID_COLOR = 'rgba(148,163,184,0.25)';
export const ACCENT = '#6366f1';

export const AXIS_TICK = { fill: AXIS_COLOR, fontSize: 11 };

export const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: 'none',
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
};

export const ATTENDANCE_COLORS = {
  keldi: '#10b981',
  kechKeldi: '#f59e0b',
  kelmadi: '#ef4444',
} as const;

export const SEVERITY_COLORS = {
  past: '#94a3b8',
  orta: '#f59e0b',
  yuqori: '#ef4444',
} as const;

export const GOOD_COLOR = '#10b981';
export const BAD_COLOR = '#ef4444';
export const NEUTRAL_COLOR = '#94a3b8';
