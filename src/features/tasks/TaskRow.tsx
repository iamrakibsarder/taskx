import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, CopyPlus, Ellipsis, Link as LinkIcon, Pencil, Split, Trash2, Undo2 } from 'lucide-react';
import type { Task } from '@/types/domain';
import { Menu, Pill, type MenuItem } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { useAppDispatch, useData } from '@/store';
import { deleteTask, duplicateToday, setStatus, unmergeTask } from '@/store/operations';
import { useProjectLabel } from '@/components/ProjectSelect';
import { TaskDialog, WaiveDialog } from './TaskDialogs';
import { isLocked } from '@/domain/billing';
import { fmtH, relDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, safeUrl } from '@/lib/utils';

export const TaskRow = memo(function TaskRow({
  task: t, selected, onSelect, showDate,
}: { task: Task; selected: boolean; onSelect: (id: string, on: boolean) => void; showDate?: boolean }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const l = useProjectLabel()(t.projectId);
  const locked = isLocked(s, t.date);
  const inv = t.invoiceId ? s.invoices.find((i) => i.id === t.invoiceId) : null;

  const items: MenuItem[] = [];
  if (t.status !== 'invoiced' && !locked) items.push({ label: 'Edit', icon: <Pencil />, onSelect: () => modal.open((c) => <TaskDialog task={t} onClose={c} />) });
  items.push({ label: 'Log again today', icon: <CopyPlus />, onSelect: () => dispatch(duplicateToday(t.id)) });
  if (t.status === 'review' || t.status === 'billable')
    items.push({ label: 'Waive', icon: <Ban />, onSelect: () => modal.open((c) => <WaiveDialog ids={[t.id]} onClose={c} />) });
  if (t.status === 'billable') items.push({ label: 'Back to review', icon: <Undo2 />, onSelect: () => dispatch(setStatus([t.id], 'review')) });
  if (t.status === 'waived') items.push({ label: 'Restore as billable', icon: <Undo2 />, onSelect: () => (dispatch(setStatus([t.id], 'billable')), toast('Restored')) });
  if (t.mergedFrom?.length && t.status !== 'invoiced') items.push({ label: `Split into ${t.mergedFrom.length}`, icon: <Split />, onSelect: () => dispatch(unmergeTask(t.id)) });
  if (t.status !== 'invoiced' && !locked)
    items.push({
      label: 'Delete', icon: <Trash2 />, danger: true,
      onSelect: () =>
        modal.open((c) => (
          <Confirm title="Delete this task?" body={`“${t.memo}” · ${fmtH(t.minutes)}`} confirm="Delete" danger onClose={c}
            onConfirm={() => dispatch(deleteTask(t.id)) && toast('Task deleted')} />
        )),
    });

  return (
    <div
      className={cn(
        'group flex items-center gap-3 border-b border-line px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface-2/60',
        selected && 'bg-brand-50/60 hover:bg-brand-50/80',
      )}
    >
      <input
        type="checkbox"
        className="size-4 flex-none cursor-pointer"
        checked={selected}
        onChange={(e) => onSelect(t.id, e.target.checked)}
        aria-label={`Select ${t.memo}`}
      />
      <i className="h-8 w-[3px] flex-none rounded-full" style={{ background: l.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] text-ink">{t.memo}</span>
          {t.link && (
            <a href={safeUrl(t.link)} target="_blank" rel="noreferrer" className="flex-none text-faint hover:text-brand-700" aria-label="Open link">
              <LinkIcon className="size-3.5" />
            </a>
          )}
          {!!t.mergedFrom?.length && <span className="flex-none text-[11px] text-faint">· merged {t.mergedFrom.length}</span>}
        </div>
        <div className="truncate text-[12.5px] text-faint">
          {l.client} · {l.project}
          {showDate && ` · ${relDay(t.date)}`}
          {s.workspace.team && t.by && ` · ${t.by}`}
          {t.status === 'waived' && t.waiveReason && ` · ${t.waiveReason}`}
          {inv && (
            <>
              {' · '}
              <Link to={`/invoices/${inv.id}`} className="hover:text-brand-700 hover:underline">{inv.number}</Link>
            </>
          )}
        </div>
      </div>
      <span className="max-sm:hidden"><Pill status={t.status} /></span>
      <span className="num w-12 flex-none text-right text-[14px] font-medium">{fmtH(t.minutes)}</span>
      <div className="flex w-[132px] flex-none items-center justify-end gap-1 max-sm:w-auto">
        {t.status === 'review' && (
          <button type="button" className="btn btn-soft btn-sm max-sm:px-2" onClick={() => (dispatch(setStatus([t.id], 'billable')), toast('Approved'))}>
            <Check /> <span className="max-sm:hidden">Approve</span>
          </button>
        )}
        <Menu
          items={items}
          trigger={(open, toggle) => (
            <button type="button" className={cn('btn-icon', open && 'bg-surface-3 text-ink')} onClick={toggle} aria-label="Task actions">
              <Ellipsis />
            </button>
          )}
        />
      </div>
    </div>
  );
});
