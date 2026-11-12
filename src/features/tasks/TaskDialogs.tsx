import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ID, Task } from '@/types/domain';
import { Dialog } from '@/components/ui/Modal';
import { Field } from '@/components/ui';
import { TimeWheel } from '@/components/ui/TimeWheel';
import { ProjectSelect, useProjectLabel } from '@/components/ProjectSelect';
import { useAppDispatch, useData } from '@/store';
import { createTask, createTasks, mergeTasks, updateTask, validateTask, waiveTasks } from '@/store/operations';
import { parseJournal } from '@/domain/journal';
import { sumMinutes, byDateAsc } from '@/domain/billing';
import { fmtH, relDay, todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';

export interface TaskPrefill {
  date?: string;
  projectId?: ID;
  memo?: string;
  link?: string;
  minutes?: number;
  by?: string;
}

/** Create or edit one task. */
export function TaskDialog({ task, prefill, onClose, onSaved }: { task?: Task; prefill?: TaskPrefill; onClose: () => void; onSaved?: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [f, setF] = useState({
    date: task?.date ?? prefill?.date ?? todayISO(),
    projectId: task?.projectId ?? prefill?.projectId ?? '',
    memo: task?.memo ?? prefill?.memo ?? '',
    link: task?.link ?? prefill?.link ?? '',
    minutes: task?.minutes ?? prefill?.minutes ?? 60,
    by: task?.by ?? prefill?.by ?? s.workspace.ownerName,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    const err = validateTask(f);
    if (err) return toast.error(err);
    const ok = task ? dispatch(updateTask(task.id, f)) : !!dispatch(createTask(f));
    if (!ok) return;
    toast(task ? 'Task updated' : `Logged ${fmtH(f.minutes)}`);
    onSaved?.();
    onClose();
  };
  const people = [s.workspace.ownerName, ...s.workspace.members].filter(Boolean);
  return (
    <Dialog
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{task ? 'Save' : 'Add task'}</button>
        </>
      }
    >
      <Field label="What did you do?">
        <textarea className="input" rows={2} value={f.memo} onChange={(e) => set({ memo: e.target.value })} data-autofocus placeholder="Homepage hero copy, 2 rounds" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <Field label="Project">
            <ProjectSelect value={f.projectId} onChange={(projectId) => set({ projectId })} includeId={task?.projectId} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            {s.workspace.team ? (
              <Field label="By">
                <select className="input" value={f.by} onChange={(e) => set({ by: e.target.value })}>
                  {people.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Link">
                <input className="input" value={f.link} onChange={(e) => set({ link: e.target.value })} placeholder="Optional" />
              </Field>
            )}
          </div>
          {s.workspace.team && (
            <Field label="Link">
              <input className="input" value={f.link} onChange={(e) => set({ link: e.target.value })} placeholder="Optional" />
            </Field>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="label self-start sm:self-center">Time</span>
          <TimeWheel minutes={f.minutes} onChange={(minutes) => set({ minutes })} maxHours={16} />
        </div>
      </div>
    </Dialog>
  );
}

/** Ask for an optional reason, then waive. */
export function WaiveDialog({ ids, onClose, onDone }: { ids: ID[]; onClose: () => void; onDone?: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [reason, setReason] = useState('');
  const ts = s.tasks.filter((t) => ids.includes(t.id));
  const save = () => {
    const n = dispatch(waiveTasks(ids, reason.trim()));
    toast(n ? `Waived ${n} task${n > 1 ? 's' : ''}` : 'Nothing to waive');
    onDone?.();
    onClose();
  };
  return (
    <Dialog
      title={`Waive ${ts.length > 1 ? `${ts.length} tasks` : 'task'}`}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-dark">Waive {fmtH(sumMinutes(ts))}</button>
        </>
      }
    >
      <p className="text-[13.5px] text-muted">Waived time stays on record and shows as complimentary on the timesheet. It is not charged.</p>
      <Field label="Reason (optional)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Our mistake, goodwill, small fix…" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {['Goodwill', 'Our mistake', 'Quick fix', 'Learning time'].map((r) => (
          <button key={r} type="button" className="chip bg-surface-2" onClick={() => setReason(r)}>{r}</button>
        ))}
      </div>
    </Dialog>
  );
}

/** Combine several tasks of one project into one. */
export function MergeDialog({ ids, onClose, onDone }: { ids: ID[]; onClose: () => void; onDone?: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const label = useProjectLabel();
  const ts = s.tasks.filter((t) => ids.includes(t.id)).sort(byDateAsc);
  const [memo, setMemo] = useState(() => [...new Set(ts.map((t) => t.memo))].join('; '));
  const [date, setDate] = useState(ts[ts.length - 1]?.date ?? todayISO());
  const save = () => {
    if (!memo.trim()) return toast.error('Describe the merged task.');
    if (dispatch(mergeTasks(ids, memo, date))) {
      toast(`Merged ${ts.length} tasks`);
      onDone?.();
      onClose();
    }
  };
  return (
    <Dialog
      title={`Merge ${ts.length} tasks`}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Merge into {fmtH(sumMinutes(ts))}</button>
        </>
      }
    >
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
        {ts[0] && label(ts[0].projectId).project} · {ts.length} tasks · you can split them again later
      </div>
      <Field label="Description">
        <textarea className="input" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <Field label="Date">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </Dialog>
  );
}

/** Free-text day log → several tasks. */
export function JournalDialog({ onClose }: { onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ReturnType<typeof parseJournal> | null>(null);
  const parsed = useMemo(() => rows ?? [], [rows]);
  const read = () => {
    const r = parseJournal(s, text, date);
    if (!r.length) return toast.error('Write one task per line.');
    setRows(r);
  };
  const save = () => {
    const ok = parsed.filter((r) => r.projectId && r.minutes);
    if (ok.length < parsed.length) return toast.error('Pick a project and time for every row.');
    const n = dispatch(createTasks(ok.map((r) => ({ ...r, projectId: r.projectId as ID }))));
    if (n) {
      toast(`Added ${n} task${n > 1 ? 's' : ''} · ${fmtH(ok.reduce((a, r) => a + r.minutes, 0))}`);
      onClose();
    }
  };
  const upd = (i: number, p: Partial<(typeof parsed)[number]>) => setRows(parsed.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Dialog
      wide
      title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-brand-600" /> Write my day</span>}
      onClose={onClose}
      onSubmit={rows ? save : read}
      footer={
        rows ? (
          <>
            <button type="button" className="btn" onClick={() => setRows(null)}>Back</button>
            <button type="submit" className="btn btn-primary">Add {parsed.length} tasks</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-dark">Read it</button>
          </>
        )
      }
    >
      {!rows ? (
        <>
          <Field label="Day">
            <input type="date" className="input max-w-[200px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="One task per line, with a time" hint="Mention a project or client name and it gets matched. Times round to 15 minutes.">
            <textarea
              className="input font-mono text-[13px]"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Holiday campaign: banner set 2h\nPatient portal insurance upload 1:30\nNorthwind call about hosting 15m'}
            />
          </Field>
        </>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {parsed.map((r, i) => (
            <div key={i} className="grid items-center gap-2 p-2.5 sm:grid-cols-[1fr_200px_90px]">
              <input className="input input-soft" value={r.memo} onChange={(e) => upd(i, { memo: e.target.value })} />
              <ProjectSelect soft value={r.projectId} onChange={(projectId) => upd(i, { projectId })} />
              <select className="input input-soft font-mono" value={r.minutes} onChange={(e) => upd(i, { minutes: +e.target.value })}>
                {!r.minutes && <option value={0}>Time</option>}
                {Array.from({ length: 48 }, (_, k) => (k + 1) * 15).map((m) => <option key={m} value={m}>{fmtH(m)}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {rows && <p className="text-[12.5px] text-faint">{relDay(date)} · {fmtH(parsed.reduce((a, r) => a + r.minutes, 0))} total</p>}
    </Dialog>
  );
}
