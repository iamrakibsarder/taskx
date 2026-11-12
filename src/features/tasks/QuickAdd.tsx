import { useMemo, useState } from 'react';
import { Calendar, Link as LinkIcon, Plus, Repeat2, Sparkles, User } from 'lucide-react';
import { useAppDispatch, useAppSelector, useData } from '@/store';
import { setDraft } from '@/store/uiSlice';
import { createTask, validateTask } from '@/store/operations';
import { DurationStepper } from '@/components/ui/TimeWheel';
import { ProjectSelect, useProjectLabel } from '@/components/ProjectSelect';
import { useModal } from '@/components/ui/Modal';
import { JournalDialog } from './TaskDialogs';
import { activeProjects, byDateDesc } from '@/domain/billing';
import { fmtH, relDay, todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** One-line task entry. Enter adds; chips set the rest. */
export function QuickAdd() {
  const s = useData();
  const d = useAppSelector((x) => x.ui.draft);
  const dispatch = useAppDispatch();
  const modal = useModal();
  const label = useProjectLabel();
  const [showLink, setShowLink] = useState(!!d.link);
  const set = (p: Partial<typeof d>) => dispatch(setDraft(p));

  const recent = useMemo(() => {
    const live = new Set(activeProjects(s).map((p) => p.id));
    const seen = new Set<string>();
    const out: typeof s.tasks = [];
    for (const t of s.tasks.slice().sort(byDateDesc)) {
      const k = `${t.projectId}|${t.memo}`;
      if (seen.has(k) || !live.has(t.projectId)) continue;
      seen.add(k);
      out.push(t);
      if (out.length === 3) break;
    }
    return out;
  }, [s]);

  const add = () => {
    const input = { ...d, projectId: d.projectId as string, by: d.by || s.workspace.ownerName };
    const err = validateTask(input);
    if (err) return toast.error(err);
    const t = dispatch(createTask(input));
    if (!t) return;
    toast(`Logged ${fmtH(t.minutes)} · ${label(t.projectId).project}`);
    set({ memo: '', link: '' });
    setShowLink(false);
    document.getElementById('quick-memo')?.focus();
  };

  const people = [s.workspace.ownerName, ...s.workspace.members].filter(Boolean);
  const isToday = d.date === todayISO();

  return (
    <form
      className="card p-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          id="quick-memo"
          className="h-10 min-w-0 flex-1 rounded-[10px] bg-transparent px-3 text-[15px] outline-none placeholder:text-faint"
          placeholder="What did you work on?"
          value={d.memo}
          onChange={(e) => set({ memo: e.target.value })}
          autoComplete="off"
        />
        <div className="flex items-center gap-2">
          <ProjectSelect soft className="h-10 min-w-0 flex-1 md:w-[210px] md:flex-none" value={d.projectId} onChange={(projectId) => set({ projectId })} />
          <DurationStepper soft minutes={d.minutes} onChange={(minutes) => set({ minutes })} />
          <button type="submit" className="btn btn-primary h-10 px-4" aria-label="Add task">
            <Plus /> <span className="max-sm:hidden">Add</span>
          </button>
        </div>
      </div>
      {showLink && (
        <input
          className="input input-soft mt-2"
          placeholder="Paste a link (ticket, doc, design…)"
          value={d.link}
          onChange={(e) => set({ link: e.target.value })}
          autoFocus
        />
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-0.5 border-t border-line px-1 pt-1.5">
        <label className={cn('chip relative', !isToday && 'bg-brand-50 text-brand-700')}>
          <Calendar /> {relDay(d.date)}
          <input
            type="date"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={d.date}
            onChange={(e) => set({ date: e.target.value || todayISO() })}
            aria-label="Date"
          />
        </label>
        {s.workspace.team && people.length > 1 && (
          <label className="chip relative">
            <User /> {d.by || s.workspace.ownerName}
            <select className="absolute inset-0 cursor-pointer opacity-0" value={d.by || s.workspace.ownerName} onChange={(e) => set({ by: e.target.value })} aria-label="Logged by">
              {people.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        )}
        <button type="button" className={cn('chip', (showLink || d.link) && 'text-brand-700')} onClick={() => setShowLink((x) => !x)}>
          <LinkIcon /> Link
        </button>
        <span className="mx-1 h-4 w-px bg-line" />
        {recent.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip max-w-[170px] max-lg:hidden"
            title={`Fill: ${t.memo}`}
            onClick={() => set({ memo: t.memo, projectId: t.projectId, minutes: t.minutes, link: t.link })}
          >
            <Repeat2 /> <span className="truncate">{t.memo}</span>
          </button>
        ))}
        <button type="button" className="chip ml-auto text-brand-700" onClick={() => modal.open((c) => <JournalDialog onClose={c} />)}>
          <Sparkles /> Write my day
        </button>
      </div>
    </form>
  );
}
