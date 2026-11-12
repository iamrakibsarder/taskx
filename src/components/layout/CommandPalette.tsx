import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartColumn, CalendarRange, FileText, House, ListChecks, Plus, Search, Settings, Sparkles, Timer, Users, Wallet,
} from 'lucide-react';
import { useData } from '@/store';
import { Dot } from '@/components/ui';
import { invoiceTotals } from '@/domain/billing';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  group: string;
  run: () => void;
}

export function CommandPalette({ onClose, extra }: { onClose: () => void; extra: PaletteAction[] }) {
  const s = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const go = (to: string) => () => nav(to);

  const all = useMemo<PaletteAction[]>(() => {
    const pages: PaletteAction[] = [
      { id: 'p-home', label: 'Home', icon: <House />, group: 'Go to', hint: 'G H', run: go('/') },
      { id: 'p-tasks', label: 'Tasks', icon: <ListChecks />, group: 'Go to', hint: 'G T', run: go('/tasks') },
      { id: 'p-week', label: 'Timesheet', icon: <CalendarRange />, group: 'Go to', hint: 'G W', run: go('/timesheet') },
      { id: 'p-bill', label: 'Billing', icon: <Wallet />, group: 'Go to', hint: 'G B', run: go('/billing') },
      { id: 'p-inv', label: 'Invoices', icon: <FileText />, group: 'Go to', hint: 'G I', run: go('/invoices') },
      { id: 'p-rep', label: 'Reports', icon: <ChartColumn />, group: 'Go to', hint: 'G R', run: go('/reports') },
      { id: 'p-cli', label: 'Clients & projects', icon: <Users />, group: 'Go to', hint: 'G C', run: go('/clients') },
      { id: 'p-set', label: 'Settings', icon: <Settings />, group: 'Go to', run: go('/settings') },
      { id: 'p-review', label: 'Tasks waiting for review', icon: <ListChecks />, group: 'Go to', run: go('/tasks?status=review') },
    ];
    const clients: PaletteAction[] = s.clients.map((c) => ({
      id: `c-${c.id}`, label: c.name, hint: 'Tasks', icon: <Dot color={c.color} />, group: 'Clients', run: go(`/tasks?client=${c.id}`),
    }));
    const invoices: PaletteAction[] = s.invoices.slice().sort((a, b) => b.seq - a.seq).map((v) => ({
      id: `i-${v.id}`, label: `${v.number} · ${v.client.name}`, hint: money(invoiceTotals(v).total, v.currency), icon: <FileText />, group: 'Invoices',
      run: go(`/invoices/${v.id}`),
    }));
    return [...extra, ...pages, ...clients, ...invoices];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clients, s.invoices, extra]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? all.filter((a) => `${a.label} ${a.group}`.toLowerCase().includes(t)) : all).slice(0, 40);
  }, [all, q]);

  const run = (a?: PaletteAction) => {
    if (!a) return;
    onClose();
    a.run();
  };

  let lastGroup = '';
  return (
    <div className="relative w-full max-w-[560px] animate-pop self-start overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:mt-[12vh]" role="dialog" aria-label="Command palette">
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 text-faint" />
        <input
          autoFocus
          className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          placeholder="Search or jump to…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(list.length - 1, x + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
            else if (e.key === 'Enter') (e.preventDefault(), run(list[i]));
          }}
        />
        <span className="kbd">Esc</span>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1.5">
        {!list.length && <p className="px-3 py-6 text-center text-[13px] text-faint">No matches</p>}
        {list.map((a, k) => {
          const head = a.group !== lastGroup ? (lastGroup = a.group) : null;
          return (
            <div key={a.id}>
              {head && <div className="px-3 pt-2.5 pb-1 text-[11.5px] font-medium text-faint">{head}</div>}
              <button
                type="button"
                onMouseEnter={() => setI(k)}
                onClick={() => run(a)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] [&_svg]:size-4 [&_svg]:text-faint',
                  k === i && 'bg-surface-2',
                )}
              >
                <span className="grid w-4 place-items-center">{a.icon}</span>
                <span className="flex-1 truncate">{a.label}</span>
                {a.hint && <span className="text-[12px] text-faint">{a.hint}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const paletteIcons = { Plus, Timer, Sparkles };
