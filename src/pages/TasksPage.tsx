import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Check, ChevronDown, Kanban, LayoutList, Merge, Search, X } from 'lucide-react';
import type { Task, TaskStatus } from '@/types/domain';
import { Empty, PageHeader, Pill, Segmented } from '@/components/ui';
import { useModal } from '@/components/ui/Modal';
import { useAppDispatch, useData } from '@/store';
import { canMerge, setStatus } from '@/store/operations';
import { QuickAdd } from '@/features/tasks/QuickAdd';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskBoard } from '@/features/tasks/TaskBoard';
import { MergeDialog, WaiveDialog } from '@/features/tasks/TaskDialogs';
import { byDateDesc, clientIdOf, findClient, findProject, sumMinutes } from '@/domain/billing';
import { addDays, addMonth, fmtH, relDay, thisMonth, weekStart } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, storage } from '@/lib/utils';

type Period = 'week' | 'month' | 'last' | 'all';
type GroupBy = 'day' | 'project' | 'status';
type View = 'list' | 'board';

const PERIODS: Record<Period, string> = { week: 'This week', month: 'This month', last: 'Last month', all: 'All time' };
const STATUS_ORDER: TaskStatus[] = ['review', 'billable', 'waived', 'invoiced', 'internal'];

function inPeriod(t: Task, p: Period) {
  if (p === 'all') return true;
  if (p === 'week') return t.date >= weekStart(0) && t.date < addDays(weekStart(0), 7);
  if (p === 'month') return t.date.startsWith(thisMonth());
  return t.date.startsWith(addMonth(thisMonth(), -1));
}

export default function TasksPage() {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as TaskStatus | null) ?? 'all';
  const client = params.get('client') ?? '';
  const project = params.get('project') ?? '';
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>(() => (params.get('status') || params.get('project') ? 'all' : storage.get<Period>('taskx.period') ?? 'month'));
  const [group, setGroup] = useState<GroupBy>(() => storage.get<GroupBy>('taskx.group') ?? 'day');
  const [view, setView] = useState<View>(() => storage.get<View>('taskx.view') ?? 'list');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
    setSel(new Set());
  };

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.tasks
      .filter((t) => inPeriod(t, period))
      .filter((t) => !client || clientIdOf(s, t) === client)
      .filter((t) => !project || t.projectId === project)
      .filter((t) => !term || `${t.memo} ${findProject(s, t.projectId)?.name ?? ''}`.toLowerCase().includes(term))
      .sort(byDateDesc);
  }, [s, period, client, project, q]);
  const tasks = useMemo(() => (status === 'all' ? base : base.filter((t) => t.status === status)), [base, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const t of base) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [base]);

  const groups = useMemo(() => {
    const m = new Map<string, { label: ReactNode; tasks: Task[] }>();
    for (const t of tasks) {
      let key: string;
      let label: ReactNode;
      if (group === 'project') {
        key = t.projectId;
        const p = findProject(s, t.projectId);
        const c = p && !p.internal ? findClient(s, p.clientId) : null;
        label = (
          <span className="flex items-center gap-2">
            <i className="size-2 rounded-full" style={{ background: c?.color ?? 'var(--color-internal)' }} />
            {p?.name ?? 'Deleted project'} <span className="font-normal text-faint">{c?.name ?? 'Internal'}</span>
          </span>
        );
      } else if (group === 'status') {
        key = t.status;
        label = <Pill status={t.status} />;
      } else {
        key = t.date;
        label = relDay(t.date);
      }
      if (!m.has(key)) m.set(key, { label, tasks: [] });
      m.get(key)!.tasks.push(t);
    }
    const arr = [...m.entries()];
    if (group === 'status') arr.sort(([a], [b]) => STATUS_ORDER.indexOf(a as TaskStatus) - STATUS_ORDER.indexOf(b as TaskStatus));
    if (group === 'project') arr.sort(([, a], [, b]) => sumMinutes(b.tasks) - sumMinutes(a.tasks));
    return arr;
  }, [tasks, group, s]);

  const onSelect = (id: string, on: boolean) =>
    setSel((x) => {
      const n = new Set(x);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const selIds = [...sel].filter((id) => tasks.some((t) => t.id === id));
  const selTasks = tasks.filter((t) => sel.has(t.id));
  const clear = () => setSel(new Set());

  const filtersOn = !!(client || project || q || status !== 'all');
  const activeClient = findClient(s, client);
  const activeProject = findProject(s, project);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={activeProject?.name ?? activeClient?.name ?? 'Tasks'}
        sub={`${PERIODS[period]} · ${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${fmtH(sumMinutes(tasks))}`}
        actions={
          <Segmented<View>
            label="View"
            value={view}
            onChange={(v) => (setView(v), storage.set('taskx.view', v))}
            options={[
              { value: 'list', label: <><LayoutList /> List</> },
              { value: 'board', label: <><Kanban /> Board</> },
            ]}
          />
        }
      />

      <QuickAdd />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 md:max-w-[260px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input className="input pl-9" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={period} onChange={(e) => (setPeriod(e.target.value as Period), storage.set('taskx.period', e.target.value))} aria-label="Period">
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input w-auto max-w-[180px]" value={client} onChange={(e) => setParam('client', e.target.value)} aria-label="Client">
            <option value="">All clients</option>
            {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="internal">Internal</option>
          </select>
          {view === 'list' && (
            <select className="input w-auto" value={group} onChange={(e) => (setGroup(e.target.value as GroupBy), storage.set('taskx.group', e.target.value))} aria-label="Group by">
              <option value="day">By day</option>
              <option value="project">By project</option>
              <option value="status">By status</option>
            </select>
          )}
          {filtersOn && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setQ(''), setParams({}, { replace: true }))}>
              <X /> Clear
            </button>
          )}
        </div>
        {view === 'list' && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {(['all', ...STATUS_ORDER] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setParam('status', st === 'all' ? '' : st)}
                className={cn(
                  'flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted transition hover:bg-surface-3 hover:text-ink',
                  status === st && 'bg-ink text-white hover:bg-ink hover:text-white',
                )}
              >
                {st === 'all' ? 'All' : st[0]!.toUpperCase() + st.slice(1)}
                <span className={cn('num text-[11.5px]', status === st ? 'text-white/60' : 'text-faint')}>{counts[st] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'board' ? (
        <TaskBoard tasks={base} />
      ) : !tasks.length ? (
        <div className="card">
          <Empty title={s.tasks.length ? 'No tasks here' : 'No tasks yet'}>
            <p className="text-[13.5px]">{s.tasks.length ? 'Try another period or clear the filters.' : 'Log your first task above. It takes five seconds.'}</p>
          </Empty>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([key, g]) => {
            const isClosed = closed.has(key);
            const all = g.tasks.every((t) => sel.has(t.id));
            const review = g.tasks.filter((t) => t.status === 'review').length;
            return (
              <section key={key} className="card overflow-hidden">
                <div className="flex items-center gap-3 bg-surface px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer"
                    checked={all}
                    onChange={(e) => g.tasks.forEach((t) => onSelect(t.id, e.target.checked))}
                    aria-label="Select group"
                  />
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left text-[13.5px] font-semibold"
                    onClick={() => setClosed((x) => { const n = new Set(x); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                    aria-expanded={!isClosed}
                  >
                    <ChevronDown className={cn('size-4 text-faint transition-transform', isClosed && '-rotate-90')} />
                    {g.label}
                    {review > 0 && group !== 'status' && <span className="text-[12px] font-medium text-review">{review} to review</span>}
                  </button>
                  <span className="num text-[13px] font-medium text-muted">{fmtH(sumMinutes(g.tasks))}</span>
                </div>
                {!isClosed && (
                  <div className="border-t border-line">
                    {g.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} selected={sel.has(t.id)} onSelect={onSelect} showDate={group !== 'day'} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 animate-pop items-center gap-1 rounded-xl bg-ink py-1.5 pr-1.5 pl-4 text-white shadow-pop max-md:bottom-20">
          <span className="mr-2 text-[13px] whitespace-nowrap">
            {selIds.length} selected · <span className="num">{fmtH(sumMinutes(selTasks))}</span>
          </span>
          <button
            type="button"
            className="btn btn-sm border-white/10 bg-white/10 text-white shadow-none hover:bg-white/20"
            onClick={() => {
              const n = dispatch(setStatus(selIds, 'billable'));
              toast(n ? `Approved ${n}` : 'Nothing to approve');
              clear();
            }}
          >
            <Check /> Approve
          </button>
          <button
            type="button"
            className="btn btn-sm border-white/10 bg-white/10 text-white shadow-none hover:bg-white/20"
            onClick={() => modal.open((c) => <WaiveDialog ids={selIds} onClose={c} onDone={clear} />)}
          >
            <Ban /> Waive
          </button>
          <button
            type="button"
            className="btn btn-sm border-white/10 bg-white/10 text-white shadow-none hover:bg-white/20"
            onClick={() => {
              const err = canMerge(s, selIds);
              if (err) return toast.error(err);
              modal.open((c) => <MergeDialog ids={selIds} onClose={c} onDone={clear} />);
            }}
          >
            <Merge /> Merge
          </button>
          <button type="button" className="btn-icon text-white/60 hover:bg-white/10 hover:text-white" onClick={clear} aria-label="Clear selection">
            <X />
          </button>
        </div>
      )}
    </div>
  );
}

