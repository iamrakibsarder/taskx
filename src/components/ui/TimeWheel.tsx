import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fmtH } from '@/lib/format';
import { cn, range } from '@/lib/utils';

const ITEM = 32;
const PRESETS = [15, 30, 60, 120, 240];

function Column({ values, index, onIndex, label, format }: {
  values: number[]; index: number; onIndex: (i: number) => void; label: string; format: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the scroll position in sync with the value.
  useEffect(() => {
    const el = ref.current;
    if (!el || Math.round(el.scrollTop / ITEM) === index) return;
    settling.current = true;
    el.scrollTo({ top: index * ITEM, behavior: 'smooth' });
    const t = setTimeout(() => (settling.current = false), 300);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={values[index]}
      onScroll={() => {
        if (settling.current) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const i = Math.max(0, Math.min(values.length - 1, Math.round((ref.current?.scrollTop ?? 0) / ITEM)));
          if (i !== index) onIndex(i);
        }, 90);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        onIndex(Math.max(0, Math.min(values.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1))));
      }}
      className="relative h-24 w-11 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-md py-8 text-center font-mono text-[19px] font-medium [scrollbar-width:none] [mask-image:linear-gradient(transparent,#000_28%,#000_72%,transparent)] [&::-webkit-scrollbar]:hidden"
    >
      {values.map((v, i) => (
        <div
          key={v}
          onClick={() => onIndex(i)}
          className={cn('h-8 cursor-pointer snap-center leading-8 transition-opacity select-none', i === index ? 'opacity-100' : 'opacity-25')}
        >
          {format(v)}
        </div>
      ))}
    </div>
  );
}

/** Watch-style hour/minute wheel in 15-minute steps. */
export function TimeWheel({ minutes, onChange, maxHours = 12 }: { minutes: number; onChange: (m: number) => void; maxHours?: number }) {
  const hours = range(0, maxHours);
  const quarters = [0, 15, 30, 45];
  const h = Math.min(maxHours, Math.floor(minutes / 60));
  const q = Math.round((minutes % 60) / 15) % 4;
  const set = (hh: number, qq: number) => onChange(Math.max(15, hh * 60 + quarters[qq]!));
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative inline-flex items-center rounded-xl border border-line bg-surface px-2.5 shadow-[inset_0_1px_2px_rgb(12_2_26/0.04)]">
        <div className="pointer-events-none absolute inset-x-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-brand-50" />
        <Column values={hours} index={h} onIndex={(i) => set(i, q)} label="Hours" format={String} />
        <span className="relative font-mono text-[19px] text-faint">:</span>
        <Column values={quarters} index={q} onIndex={(i) => set(h, i)} label="Minutes" format={(v) => String(v).padStart(2, '0')} />
        <span className="relative ml-1.5 text-[11.5px] text-faint">hrs</span>
      </div>
      <div className="flex max-w-[230px] flex-wrap justify-center gap-1.5">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 font-mono text-[12px] transition',
              m === minutes ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-ink-2 hover:border-ink',
            )}
          >
            {fmtH(m)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact `− 1:00 +` control; the value opens the wheel. */
export function DurationStepper({ minutes, onChange, soft }: { minutes: number; onChange: (m: number) => void; soft?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const step = (d: number) => onChange(Math.max(15, Math.min(16 * 60, minutes + d)));
  return (
    <div ref={ref} className={cn('relative inline-flex h-10 items-center gap-0.5 rounded-[10px] px-1', soft ? 'bg-surface-2' : 'border border-line bg-surface')}>
      <button type="button" className="btn-icon" onClick={() => step(-15)} aria-label="15 minutes less">
        <Minus />
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Time ${fmtH(minutes)}, open picker`}
        className={cn('min-w-[54px] rounded-md px-1 py-1.5 font-mono text-[15px] font-medium hover:bg-surface', open && 'bg-surface')}
      >
        {fmtH(minutes)}
      </button>
      <button type="button" className="btn-icon" onClick={() => step(15)} aria-label="15 minutes more">
        <Plus />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-40 animate-pop rounded-xl border border-line bg-surface p-3 shadow-pop">
          <TimeWheel minutes={minutes} onChange={onChange} maxHours={16} />
        </div>
      )}
    </div>
  );
}
