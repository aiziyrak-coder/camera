/* Yangi dizayn tizimi: oq, sodda, katta va tushunarli elementlar.
 * Hamma sahifalar faqat shu fayldagi qismlardan quriladi. */
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
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'border border-line bg-white text-ink hover:bg-page disabled:text-faint',
  ghost: 'text-soft hover:bg-ink/5 hover:text-ink disabled:text-faint',
  danger: 'bg-bad text-white hover:bg-bad/90 disabled:bg-bad/50',
  'danger-ghost': 'text-bad hover:bg-bad-tint disabled:text-faint',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizing =
    size === 'sm' ? 'h-9 gap-1.5 px-3 text-[14px]' : size === 'lg' ? 'h-12 gap-2 px-5 text-[16px]' : 'h-11 gap-2 px-4 text-[15px]';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed',
        sizing,
        BUTTON_VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 15 : 18} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={size === 'sm' ? 15 : 18} aria-hidden />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl text-soft transition-colors hover:bg-ink/5 hover:text-ink', className)}
      {...rest}
    >
      <Icon size={19} aria-hidden />
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
      <span className="text-[14px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="text-[13px] text-bad">{error}</span> : hint ? <span className="text-[13px] text-faint">{hint}</span> : null}
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
      className={cn('input cursor-pointer appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235E6675' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
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

/** Ikki-uch variantdan birini tanlash (Talaba / Xodim). */
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
    <div className={cn('inline-flex rounded-xl bg-ink/[0.05] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-[10px] px-4 py-2 text-[14px] font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-card' : 'text-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── Holat va xabarlar */

export type Tone = 'ok' | 'warn' | 'bad' | 'plain' | 'brand';

const BADGE_TONES: Record<Tone, string> = {
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-warn-tint text-warn',
  bad: 'bg-bad-tint text-bad',
  plain: 'bg-ink/[0.06] text-soft',
  brand: 'bg-brand-tint text-brand',
};

export function Badge({ tone = 'plain', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Alert({ tone = 'bad', children, className }: { tone?: 'bad' | 'warn' | 'ok' | 'info'; children: ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  const tones = {
    bad: 'bg-bad-tint text-bad',
    warn: 'bg-warn-tint text-warn',
    ok: 'bg-ok-tint text-ok',
    info: 'bg-ink/[0.04] text-soft',
  };
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px] leading-snug', tones[tone], className)}>
      <Icon size={18} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Yuklanmoqda...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-soft" role="status">
      <Loader2 size={20} className="animate-spin" aria-hidden />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/[0.05] text-faint">
        <Icon size={26} aria-hidden />
      </span>
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[14px] text-soft">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─────────────────────────── Sahifa sarlavhasi */

export function PageHead({ title, text, actions }: { title: string; text?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {text && <p className="mt-1 text-[15px] text-soft">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
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
    return <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} className={cn('object-cover', className)} />;
  }
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-[#EEF1F5] to-[#E2E6EC] font-semibold text-faint', className)} aria-label={name}>
      <span className="text-[clamp(14px,30%,40px)]">{initials || '?'}</span>
    </div>
  );
}

/* ─────────────────────────── Oynalar */

/** Ochiq oynalar to'plami: Escape faqat eng ustidagisini yopadi. */
const openLayers: { current: () => void }[] = [];

function onEscapeKey(e: KeyboardEvent) {
  if (e.key === 'Escape') openLayers[openLayers.length - 1]?.current();
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const layer = ref;
    if (openLayers.length === 0) {
      window.addEventListener('keydown', onEscapeKey);
      document.body.style.overflow = 'hidden';
    }
    openLayers.push(layer);
    return () => {
      openLayers.splice(openLayers.indexOf(layer), 1);
      if (openLayers.length === 0) {
        window.removeEventListener('keydown', onEscapeKey);
        document.body.style.overflow = '';
      }
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
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('anim-pop flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lift sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
          <IconButton icon={X} label="Yopish" onClick={onClose} className="-mr-2" />
        </div>
        <div className="overflow-y-auto px-6 pb-5 pt-2">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** O'ng tomondan chiqadigan panel — odam ma'lumoti uchun. */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-ink/25" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="anim-slide flex h-full w-full max-w-[460px] flex-col bg-white shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="truncate text-[16px] font-semibold text-ink">{title}</h2>
          <IconButton icon={X} label="Yopish" onClick={onClose} className="-mr-2" />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">{footer}</div>}
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
      <div className="text-[15px] leading-relaxed text-soft">{text}</div>
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
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="anim-pop flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-[14px] text-white shadow-lift">
            {t.tone === 'ok' ? <CheckCircle2 size={17} className="text-[#7FD8AC]" aria-hidden /> : <AlertCircle size={17} className="text-[#F3A49E]" aria-hidden />}
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
      <path d={qrPath(qr.modules, 4)} fill="#151B26" />
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
