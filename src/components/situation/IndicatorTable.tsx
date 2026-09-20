import { Link } from 'react-router-dom';
import { CodeText, Skeleton, cn, focusRing } from '../../ui';
import { RAG_TEXT, type Rag } from '../../ui/rag';
import { RagChip } from '../hisobot/board';

/**
 * Ko'rsatkichlar jadvali: nomi, raqam, hukm. Ko'z bitta ustundan
 * pastga yuradi — plitkalarni zigzag qilib o'qishdan tez.
 *
 * Hukm (svetofor) FAQAT foizlarda bo'ladi: "12 ta kechikish" yaxshimi
 * yoki yomonmi — bo'linma kattaligini bilmasdan aytib bo'lmaydi.
 */

export interface Indicator {
  /** Ikki so'zdan oshmaydigan nom. */
  label: string;
  /** Tayyor matn: "80 / 84", "92,4%", "—". */
  value: string;
  /** Ikkinchi ustun: "/ 84" kabi maxraj. */
  suffix?: string | null;
  /** Foizli ko'rsatkichlar uchun svetofor; sonlarda — `undefined`. */
  verdict?: Rag;
  /** Qiymat rangini majburlash (hukm yo'q, lekin diqqat kerak). */
  tone?: 'warning' | 'danger' | 'muted';
  /** Kecha / o'tgan hafta bilan farq — tayyor matn. */
  deltas?: string[];
  to?: string | null;
  loading?: boolean;
}

const VALUE_TONE = {
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-subtle',
} as const;

function Row({ item }: { item: Indicator }) {
  const valueTone = item.verdict ? RAG_TEXT[item.verdict] : item.tone ? VALUE_TONE[item.tone] : 'text-fg';
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg">{item.label}</span>
        {item.deltas && item.deltas.length > 0 && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {item.deltas.map((d) => (
              <CodeText key={d} className="text-[11px] text-subtle">
                {d}
              </CodeText>
            ))}
          </span>
        )}
      </span>
      {item.loading ? (
        <Skeleton className="h-5 w-16 shrink-0" />
      ) : (
        <span className="flex shrink-0 items-baseline gap-2 text-right">
          <span className={cn('intel-code text-[18px] font-semibold leading-none', valueTone)}>{item.value}</span>
          {item.suffix && <CodeText className="text-[12px] text-subtle">{item.suffix}</CodeText>}
        </span>
      )}
      <span className="w-8 shrink-0 text-end">{item.verdict ? <RagChip tone={item.verdict} /> : null}</span>
    </>
  );
  const cls = 'flex min-h-[32px] items-center gap-3 px-3 py-1.5';
  return (
    <li className="border-b border-border last:border-b-0">
      {item.to ? (
        <Link to={item.to} className={cn(cls, 'hover:bg-primary-soft', focusRing)}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export function IndicatorTable({ items }: { items: Indicator[] }) {
  return (
    <ul className="min-w-0">
      {items.map((item) => (
        <Row key={item.label} item={item} />
      ))}
    </ul>
  );
}
