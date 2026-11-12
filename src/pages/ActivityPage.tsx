import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FolderKanban, ListChecks, Receipt, RefreshCw, Settings, Upload, UserRound, Users } from 'lucide-react';
import type { ActivityEntry } from '@/types/domain';
import { Empty, PageHeader } from '@/components/ui';
import { gateway } from '@/data/gateway';
import { useData } from '@/store';
import { longDate, relDay, toISO } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'task' | 'invoice' | 'client' | 'project' | 'expense' | 'other';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'task', label: 'Tasks' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'client', label: 'Clients' },
  { value: 'project', label: 'Projects' },
  { value: 'expense', label: 'Expenses' },
  { value: 'other', label: 'Settings & account' },
];

const ICON: Record<string, typeof ListChecks> = {
  task: ListChecks, invoice: FileText, client: Users, project: FolderKanban, expense: Receipt, workspace: Settings, account: UserRound,
};
/** "Emailed INV-0007 to x" and "Updated settings: …" instead of "Changed INV-0007 emailed to x". */
function line(e: ActivityEntry): { verb: string; rest: string } {
  const s = e.summary || e.entity;
  if (/ emailed to /.test(s)) return { verb: 'Emailed', rest: s.replace(' emailed to ', ' to ') };
  if (e.action === 'settings') return { verb: VERB.settings, rest: s === 'Settings updated' ? 'settings' : s.replace(/^Settings\b/, 'settings') };
  return { verb: VERB[e.action], rest: s };
}

const VERB: Record<ActivityEntry['action'], string> = {
  create: 'Added', update: 'Changed', delete: 'Deleted', import: 'Imported', settings: 'Updated',
};
const TONE: Record<ActivityEntry['action'], string> = {
  create: 'text-invoiced', update: 'text-billable', delete: 'text-danger', import: 'text-internal', settings: 'text-muted',
};

const matches = (e: ActivityEntry, f: Filter) =>
  f === 'all' || (f === 'other' ? !['task', 'invoice', 'client', 'project', 'expense'].includes(e.entity) : e.entity === f);

export default function ActivityPage() {
  const s = useData();
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async (before?: number) => {
    setState('loading');
    try {
      const page = await gateway.activity(before);
      setRows((r) => (before ? [...r, ...page] : page));
      setMore(page.length >= 100);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => void load(), [load]);

  const days = useMemo(() => {
    const out: Array<{ day: string; items: ActivityEntry[] }> = [];
    for (const e of rows.filter((x) => matches(x, filter))) {
      const day = toISO(new Date(e.at));
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [rows, filter]);

  const linkFor = (e: ActivityEntry) =>
    e.action !== 'delete' && e.entity === 'invoice' && s.invoices.some((i) => i.id === e.entityId) ? `/invoices/${e.entityId}` : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        sub={gateway.kind === 'http' ? 'Every change saved to your workspace, newest first.' : 'Recent changes made in this browser, newest first.'}
        actions={
          <button type="button" className="btn" onClick={() => void load()} disabled={state === 'loading'}>
            <RefreshCw className={cn(state === 'loading' && 'animate-spin')} /> Refresh
          </button>
        }
      />
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn('chip', filter === f.value && 'bg-night text-white hover:bg-night hover:text-white')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state === 'error' && !rows.length ? (
        <div className="card">
          <Empty title="Couldn’t load the activity">
            <button type="button" className="btn mt-2" onClick={() => void load()}>Try again</button>
          </Empty>
        </div>
      ) : !days.length && state !== 'loading' ? (
        <div className="card">
          <Empty title="Nothing here yet">
            <p className="text-[13.5px]">Changes to tasks, invoices, clients and settings show up here as you make them.</p>
          </Empty>
        </div>
      ) : (
        days.map((d) => (
          <section key={d.day} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium text-muted">
              {['Today', 'Yesterday'].includes(relDay(d.day)) && <>{relDay(d.day)} · </>}
              <span className="text-faint">{longDate(d.day)}</span>
            </h2>
            <ol className="card divide-y divide-line">
              {d.items.map((e) => {
                const Icon = ICON[e.entity] ?? (e.action === 'import' ? Upload : Settings);
                const href = linkFor(e);
                const body = (
                  <>
                    <span className="grid size-8 flex-none place-items-center rounded-lg bg-surface-2 text-muted">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">
                        <span className={cn('font-medium', TONE[e.action])}>{line(e).verb}</span>{' '}
                        <span className="text-ink-2">{line(e).rest}</span>
                      </span>
                      <span className="block text-[12px] text-faint">
                        {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {e.actor && ` · ${e.actor}`}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {href ? (
                      <Link to={href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">{body}</Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
      {more && rows.length > 0 && (
        <button type="button" className="btn self-center" disabled={state === 'loading'} onClick={() => void load(rows[rows.length - 1]!.id)}>
          Load older
        </button>
      )}
    </div>
  );
}
