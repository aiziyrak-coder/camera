/* Dizayn tizimi — ish stoli ilovasi uslubi: oq-qora-kulrang, zich, aniq.
 * Rang faqat holat nuqtalarida (yashil / sariq / qizil). */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import { encodeQr, qrPath } from './lib/qr';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ─────────────────────────── Tugma */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-grad text-white shadow-btn hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  secondary: 'border border-line bg-white text-ink shadow-card hover:border-[#cfd5e1] hover:bg-side disabled:text-faint',
  ghost: 'text-soft hover:bg-sunk hover:text-ink disabled:text-faint',
  danger: 'bg-bad text-white hover:bg-bad/90 disabled:bg-bad/50',
  'danger-ghost': 'text-bad hover:bg-bad-tint disabled:text-faint',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  kbd?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  block = false,
  kbd,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizing =
    size === 'sm'
      ? 'h-7 gap-1.5 px-2.5 text-[12.5px]'
      : size === 'lg'
        ? 'h-11 gap-2 px-5 text-[15px]'
        : 'h-8 gap-1.5 px-3 text-[13px]';
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 15;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium transition-[background-color,border-color,color,filter] disabled:cursor-not-allowed',
        sizing,
        BUTTON_VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" aria-hidden /> : Icon && <Icon size={iconSize} aria-hidden />}
      {children}
      {kbd && (
        <span className={cn('ml-1 rounded px-1 text-[11px] font-medium', variant === 'primary' ? 'bg-white/15 text-white/70' : 'bg-sunk text-faint')}>
          {kbd}
        </span>
      )}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  size = 'md',
  ...rest
}: { icon: LucideIcon; label: string; size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-soft transition-colors hover:bg-sunk hover:text-ink disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 16} aria-hidden />
    </button>
  );
}

/* ─────────────────────────── Forma */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[12.5px] font-medium text-soft">{label}</span>
      {children}
      {error ? <span className="text-[12px] text-bad">{error}</span> : hint ? <span className="text-[12px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn('input cursor-pointer appearance-none bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239A9AA3' stroke-width='2'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E\")",
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Kichik almashtirgich (Talaba / Xodim). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-lg bg-sunk p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]' : 'text-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Sahifa ichidagi tablar — tagiga chiziq bilan. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; count?: number | null }[];
  className?: string;
}) {
  return (
    <div className={cn('flex gap-5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors',
            value === o.value ? 'border-brand text-ink' : 'border-transparent text-faint hover:text-soft',
          )}
        >
          {o.label}
          {o.count != null && <span className="tnum rounded bg-sunk px-1.5 py-px text-[11.5px] font-medium text-soft">{formatNumber(o.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── Holat */

export type Tone = 'ok' | 'warn' | 'bad' | 'plain' | 'brand';

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  plain: 'bg-[#C3CAD8]',
  brand: 'bg-brand',
};

export function Dot({ tone = 'plain', pulse = false, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-1.5 w-1.5 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', DOT[tone])} />}
      <span className={cn('relative h-1.5 w-1.5 rounded-full', DOT[tone])} />
    </span>
  );
}

/** Holat yorlig'i: neytral matn + kichik rangli nuqta. */
export function Badge({ tone = 'plain', children, className, pulse }: { tone?: Tone; children: ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2 text-[12px] font-medium text-soft',
        className,
      )}
    >
      <Dot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

export function Alert({ tone = 'bad', children, className }: { tone?: 'bad' | 'warn' | 'ok' | 'info'; children: ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  const iconTone = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok', info: 'text-faint' }[tone];
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border border-line bg-side px-3 py-2.5 text-[13px] leading-snug text-ink', className)}
    >
      <Icon size={16} className={cn('mt-px shrink-0', iconTone)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Yuklanmoqda...', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-16 text-faint', className)} role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('skeleton block rounded-md', className)} aria-hidden />;
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-side text-faint">
        <Icon size={18} aria-hidden />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-soft">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Ingichka foiz chizig'i. */
export function Meter({ value, className, tone = 'ink' }: { value: number | null | undefined; className?: string; tone?: 'ink' | 'ok' | 'warn' }) {
  const pctValue = Math.max(0, Math.min(100, (value ?? 0) * 100));
  const color = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bar-brand';
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-sunk', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pctValue}%` }} />
    </div>
  );
}

/* ─────────────────────────── Bloklar */

/** Sahifa sarlavhasi — ish maydonining yuqori qatori. */
export function PageHead({ title, text, actions, children }: { title: string; text?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="glow-top shrink-0 border-b border-line px-6 pt-5">
      <div className={cn('flex flex-wrap items-start justify-between gap-3', children ? 'pb-3' : 'pb-5')}>
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {text && <p className="mt-0.5 text-[13px] text-soft">{text}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Sarlavhali blok. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

/** Bitta ko'rsatkich: nom, katta raqam, izoh. */
export function Stat({
  label,
  value,
  sub,
  meter,
  meterTone,
  icon: Icon,
  onClick,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  sub?: ReactNode;
  meter?: number | null;
  meterTone?: 'ink' | 'ok' | 'warn';
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[12.5px] text-soft">
        <span className="min-w-0">{label}</span>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand ring-1 ring-brand-line/70">
            <Icon size={14} aria-hidden />
          </span>
        )}
      </span>
      <span className="tnum mt-1 text-[27px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
      {meter !== undefined && <Meter value={meter} tone={meterTone} className="mt-3" />}
      {sub && <span className="mt-2 text-[12px] text-faint">{sub}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn('flex flex-col px-5 py-4 text-left transition-colors hover:!bg-brand-tint/40', className)}>
        {body}
      </button>
    );
  }
  return <div className={cn('flex flex-col px-5 py-4', className)}>{body}</div>;
}

/* ─────────────────────────── Odam surati */

export function Photo({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  if (src && !broken) {
    return <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} className={cn('bg-sunk object-cover', className)} />;
  }
  return (
    <div className={cn('flex items-center justify-center bg-brand-tint font-semibold text-brand/70', className)} aria-label={name}>
      <span className="text-[clamp(10px,32%,36px)]">{initials || '?'}</span>
    </div>
  );
}

/* ─────────────────────────── Oynalar */

/** Ochiq oynalar to'plami: Escape faqat eng ustidagisini yopadi. */
const openLayers: { current: () => void }[] = [];

function onEscapeKey(e: KeyboardEvent) {
  if (e.key === 'Escape') openLayers[openLayers.length - 1]?.current();
}

/** Biror oyna ochiqmi — sahifa tezkor tugmalari shunda ishlamaydi. */
export function layerOpen(): boolean {
  return openLayers.length > 0;
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const layer = ref;
    if (openLayers.length === 0) window.addEventListener('keydown', onEscapeKey);
    openLayers.push(layer);
    return () => {
      openLayers.splice(openLayers.indexOf(layer), 1);
      if (openLayers.length === 0) window.removeEventListener('keydown', onEscapeKey);
    };
  }, []);
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  return createPortal(
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-0 sm:items-start sm:p-4 sm:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('anim-pop flex max-h-[85vh] w-full flex-col rounded-t-xl bg-white shadow-lift sm:rounded-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-[440px]')}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line pl-5 pr-2.5">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          <IconButton icon={X} label="Yopish" size="sm" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-line bg-side px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** O'ng tomondan chiqadigan panel (kichik ekranlarda). */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-ink/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="anim-slide flex h-full w-full max-w-[440px] flex-col bg-white shadow-lift">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-line pl-5 pr-2.5">
          <h2 className="truncate text-[14px] font-semibold text-ink">{title}</h2>
          <IconButton icon={X} label="Yopish" size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Tasdiqlash oynasi (o'chirish va h.k.). */
export function Confirm({
  title,
  text,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Bekor qilish
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Bajarib bo‘lmadi');
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] leading-relaxed text-soft">{text}</div>
      {error && <Alert className="mt-4">{error}</Alert>}
    </Modal>
  );
}

/* ─────────────────────────── Bildirishnoma (toast) */

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'bad';
}

const ToastContext = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="anim-pop flex items-center gap-2.5 rounded-lg bg-ink px-3.5 py-2.5 text-[13px] text-white shadow-lift">
            <Dot tone={t.tone} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ─────────────────────────── QR-kod */

export function QrCode({ value, className }: { value: string; className?: string }) {
  const qr = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  const dim = qr.size + 8;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} className={className} role="img" aria-label="QR-kod" shapeRendering="crispEdges">
      <rect width={dim} height={dim} fill="#fff" />
      <path d={qrPath(qr.modules, 4)} fill="#0A0A0B" />
    </svg>
  );
}

/* ─────────────────────────── Yordamchilar */

export function errorText(err: unknown, fallback = 'Xatolik yuz berdi. Qayta urinib ko‘ring.'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/** Klaviatura yorlig'i. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Yozish maydonida emasligini tekshiradi — tezkor tugmalar uchun. */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
