import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { InvoiceDisplayStatus, TaskStatus } from '@/types/domain';
import { monthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

/* ---------- Layout ---------- */

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 px-5 pt-4">
          {title && <h2 className="mr-auto flex items-center gap-2 text-[14px] font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={cn('px-5 pt-3 pb-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-muted">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

/* ---------- Stats ---------- */

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'danger';
}
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div
      className="grid overflow-hidden rounded-lg border border-line bg-line shadow-card"
      style={{ gap: 1, gridTemplateColumns: `repeat(auto-fit, minmax(${stats.length > 3 ? 150 : 180}px, 1fr))` }}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col gap-1 bg-surface px-5 py-4">
          <span className="truncate text-[12.5px] font-medium text-muted">{s.label}</span>
          <span className={cn('num truncate text-[24px] font-medium md:text-[26px]', s.tone === 'danger' && 'text-danger')}>{s.value}</span>
          {s.hint && <span className="truncate text-[12px] text-faint">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Status ---------- */

const PILL: Record<TaskStatus | InvoiceDisplayStatus, string> = {
  review: 'bg-review-bg text-review',
  billable: 'bg-billable-bg text-billable',
  invoiced: 'bg-invoiced-bg text-invoiced',
  paid: 'bg-invoiced-bg text-invoiced',
  waived: 'bg-waived-bg text-waived',
  void: 'bg-waived-bg text-waived',
  draft: 'bg-surface-3 text-ink-2',
  internal: 'bg-internal-bg text-internal',
  sent: 'bg-billable-bg text-billable',
  overdue: 'bg-danger-bg text-danger',
};
const LABEL: Record<TaskStatus | InvoiceDisplayStatus, string> = {
  review: 'Review', billable: 'Billable', invoiced: 'Invoiced', paid: 'Paid', waived: 'Waived', void: 'Void',
  draft: 'Draft', internal: 'Internal', sent: 'Sent', overdue: 'Overdue',
};
export const statusLabel = (s: TaskStatus | InvoiceDisplayStatus) => LABEL[s];
export function Pill({ status, children }: { status: TaskStatus | InvoiceDisplayStatus; children?: ReactNode }) {
  return <span className={cn('pill', PILL[status])}>{children ?? LABEL[status]}</span>;
}

/** Client logo, or the first letter on the client's color. */
export function ClientAvatar({ client, size = 36, className }: { client: { name: string; color: string; logo?: string }; size?: number; className?: string }) {
  const radius = size >= 32 ? 10 : size >= 22 ? 7 : 5;
  if (client.logo)
    return (
      <span
        className={cn('grid flex-none place-items-center overflow-hidden border border-line bg-white', className)}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <img src={client.logo} alt="" className="size-full object-contain p-[12%]" draggable={false} />
      </span>
    );
  return (
    <span
      className={cn('grid flex-none place-items-center font-semibold text-white', className)}
      style={{ width: size, height: size, borderRadius: radius, background: client.color, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {client.name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <i className="inline-block flex-none rounded-full" style={{ background: color, width: size, height: size }} />;
}

/* ---------- Controls ---------- */

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-surface-3 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium text-muted transition [&_svg]:size-3.5 hover:text-ink',
            value === o.value && 'bg-surface text-ink shadow-[0_1px_2px_rgb(12_2_26/0.08),0_0_0_1px_rgb(12_2_26/0.04)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MonthNav({ month, onChange, label }: { month: string; onChange: (delta: number) => void; label?: string }) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-0.5">
      <button type="button" className="btn-icon" onClick={() => onChange(-1)} aria-label="Previous">
        <ChevronLeft />
      </button>
      <span className="min-w-[120px] text-center text-[13px] font-medium">{label ?? monthLabel(month)}</span>
      <button type="button" className="btn-icon" onClick={() => onChange(1)} aria-label="Next">
        <ChevronRight />
      </button>
    </div>
  );
}

export function Progress({ value, max, hot }: { value: number; max: number; hot?: boolean }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn('track', hot && 'hot')} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Popover menu ---------- */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}
export function Menu({ trigger, items, align = 'right' }: { trigger: (open: boolean, toggle: () => void) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn('relative inline-flex', open && 'z-30')}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+6px)] z-40 flex min-w-[210px] animate-pop flex-col rounded-lg border border-line bg-surface p-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-2 [&_svg]:size-4 [&_svg]:text-faint',
                it.danger && 'text-danger [&_svg]:text-danger',
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
