import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Presentation } from 'lucide-react';
import ChartCard from '../ui/ChartCard';
import EmptyState from '../ui/EmptyState';
import { Stat } from './AttendanceSection';
import { ACCENT, AXIS_TICK, GRID_COLOR, TOOLTIP_STYLE } from '../../lib/chartTheme';
import { formatCount } from '../../lib/uzDate';
import type { LessonsAnalytics } from '../../types';

export default function LessonsSection({ lessons }: { lessons: LessonsAnalytics }) {
  if (lessons.sessions === 0) {
    return (
      <EmptyState
        icon={<Presentation size={18} />}
        title="Bu davrda dars mashg'uloti qayd etilmagan"
        description="Dars jadvali «Dars monitoring» bo'limida kiritiladi — jadval bo'lmasa diqqat va o'qituvchi punktualligi hisoblanmaydi."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Darslar" value={formatCount(lessons.sessions)} hint={`AI tahlil qilgani: ${lessons.analyzedSessions}`} />
        <Stat label="O'rtacha diqqat" value={lessons.avgAttention === null ? '—' : `${lessons.avgAttention}%`} />
        <Stat label="Uyqu holatlari" value={formatCount(lessons.sleepIncidents)} />
        <Stat
          label="O'qituvchi o'z vaqtida"
          value={lessons.teacherOnTimeRate === null ? '—' : `${lessons.teacherOnTimeRate}%`}
          hint={lessons.checkedSessions ? `${lessons.checkedSessions} ta tekshirilgan darsdan` : 'tekshirilgan dars yo\'q'}
        />
      </div>
      {lessons.analyzedSessions > 0 && (
        <ChartCard title="Darslardagi o'rtacha diqqat" subtitle="Kunlar bo'yicha, faqat AI tahlil qilgan darslar" pdfKey="lessons-attention">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lessons.byDay} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="attention" name="Diqqat, %" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
