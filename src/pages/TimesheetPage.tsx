import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import type { ID } from '@/types/domain';
import { PageHeader } from '@/components/ui';
import { Dialog, useModal } from '@/components/ui/Modal';
import { DurationStepper } from '@/components/ui/TimeWheel';
import { ProjectSelect, useProjectLabel } from '@/components/ProjectSelect';
import { useAppDispatch, useData } from '@/store';
import { copyWeek as copyWeekThunk, createTask, deleteTask } from '@/store/operations';
import { isLocked, sumMinutes } from '@/domain/billing';
import { addDays, DOW, fmtDate, fmtH, relDay, todayISO, weekStart } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, range } from '@/lib/utils';

function CellDialog({ projectId, date, onClose }: { projectId: ID; date: string; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const l = useProjectLabel()(projectId);
  const tasks = s.tasks.filter((t) => t.projectId === projectId && t.date === date);
  const [memo, setMemo] = useState('');
  const [minutes, setMinutes] = useState(60);
  const add = () => {
    if (!memo.trim()) return toast.error('Describe what you did.');
    if (dispatch(createTask({ date, projectId, memo, minutes }))) {
      setMemo('');
      toast(`Logged ${fmtH(minutes)}`);
    }
  };
  return (
    <Dialog title={<span>{l.project} <span className="font-normal text-faint">· {relDay(date)}</span></span>} onClose={onClose} onSubmit={add}>
      {tasks.length > 0 && (
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
              <span className="flex-1 truncate">{t.memo}</span>
              <span className="num text-muted">{fmtH(t.minutes)}</span>
              {t.status !== 'invoiced' && !isLocked(s, t.date) && (
                <button type="button" className="btn-icon" aria-label="Delete" onClick={() => dispatch(deleteTask(t.id))}>
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input h-10 flex-1" placeholder="What did you do?" value={memo} onChange={(e) => setMemo(e.target.value)} data-autofocus />
        <div className="flex gap-2">
          <DurationStepper minutes={minutes} onChange={setMinutes} />
          <button type="submit" className="btn btn-primary h-10"><Plus /> Add</button>
        </div>
      </div>
    </Dialog>
  );
}

export default function TimesheetPage() {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const label = useProjectLabel();
  const [offset, setOffset] = useState(0);
  const [extra, setExtra] = useState<ID[]>([]);
  const start = weekStart(offset);
  const days = range(0, 6).map((i) => addDays(start, i));
  const today = todayISO();

  const week = useMemo(() => s.tasks.filter((t) => t.date >= start && t.date < addDays(start, 7)), [s.tasks, start]);
  const rows = useMemo(() => {
    const ids = [...new Set([...week.map((t) => t.projectId), ...extra])];
    return ids
      .map((id) => ({ id, l: label(id), cells: days.map((d) => sumMinutes(week.filter((t) => t.projectId === id && t.date === d))) }))
      .sort((a, b) => a.l.client.localeCompare(b.l.client) || a.l.project.localeCompare(b.l.project));
  }, [week, extra, days, label]);
  const dayTotals = days.map((d) => sumMinutes(week.filter((t) => t.date === d)));
  const total = sumMinutes(week);

  const open = (projectId: ID, date: string) => modal.open((c) => <CellDialog projectId={projectId} date={date} onClose={c} />);
  const copyLast = () => {
    if (week.length) return toast.error('This week already has time. Copy works on an empty week.');
    const n = dispatch(copyWeekThunk(weekStart(offset - 1), start));
    toast(n ? `Copied ${n} tasks from last week` : 'Last week is empty');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Timesheet"
        sub={`${fmtDate(start)} – ${fmtDate(addDays(start, 6))} · ${fmtH(total)} logged`}
        actions={
          <>
            <button type="button" className="btn" onClick={copyLast}><Copy /> Copy last week</button>
            <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-0.5">
              <button type="button" className="btn-icon" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week"><ChevronLeft /></button>
              <button type="button" className="px-2 text-[13px] font-medium" onClick={() => setOffset(0)}>{offset === 0 ? 'This week' : 'Today'}</button>
              <button type="button" className="btn-icon" onClick={() => setOffset((o) => o + 1)} aria-label="Next week"><ChevronRight /></button>
            </div>
          </>
        }
      />
      <div className="card overflow-x-auto">
        <table className="table min-w-[760px] table-fixed">
          <colgroup>
            <col className="w-[34%]" />
            {days.map((d) => <col key={d} />)}
            <col className="w-[76px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="pl-5">Project</th>
              {days.map((d, i) => (
                <th key={d} className={cn('text-center', d === today && 'text-brand-700')}>
                  <div>{DOW[i]}</div>
                  <div className="num text-[11px] font-normal">{fmtDate(d)}</div>
                </th>
              ))}
              <th className="n pr-5">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pl-5">
                  <div className="flex items-center gap-2.5">
                    <i className="h-7 w-[3px] flex-none rounded-full" style={{ background: r.l.color }} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate font-medium">{r.l.project}</div>
                      <div className="truncate text-[12px] text-faint">{r.l.client}</div>
                    </div>
                  </div>
                </td>
                {r.cells.map((m, i) => (
                  <td key={i} className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => open(r.id, days[i]!)}
                      className={cn(
                        'num h-10 w-full rounded-md text-[13.5px] transition hover:bg-brand-50 hover:text-brand-700',
                        m ? 'font-medium text-ink' : 'text-line-2',
                        days[i] === today && 'bg-surface-2',
                      )}
                    >
                      {m ? fmtH(m) : '+'}
                    </button>
                  </td>
                ))}
                <td className="n pr-5 font-medium">{fmtH(sumMinutes(week.filter((t) => t.projectId === r.id)))}</td>
              </tr>
            ))}
            <tr>
              <td className="pl-5" colSpan={9}>
                <div className="max-w-[300px]">
                  <ProjectSelect
                    soft
                    value=""
                    placeholder="+ Add a project row"
                    onChange={(id) => setExtra((x) => (rows.some((r) => r.id === id) ? x : [...x, id]))}
                  />
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pl-5 text-muted">Day total</td>
              {dayTotals.map((m, i) => <td key={i} className={cn('num text-center text-[13px]', !m && 'text-line-2')}>{m ? fmtH(m) : '—'}</td>)}
              <td className="n pr-5 text-[14px] font-semibold">{fmtH(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[12.5px] text-faint">Click any cell to add or remove time. Everything rounds to 15 minutes.</p>
    </div>
  );
}

