import { useState } from 'react';
import type { Task, TaskStatus } from '@/types/domain';
import { Pill } from '@/components/ui';
import { useModal } from '@/components/ui/Modal';
import { useAppDispatch } from '@/store';
import { moveTask } from '@/store/operations';
import { useProjectLabel } from '@/components/ProjectSelect';
import { TaskDialog, WaiveDialog } from './TaskDialogs';
import { sumMinutes } from '@/domain/billing';
import { fmtH, relDay } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLS: TaskStatus[] = ['review', 'billable', 'waived', 'invoiced', 'internal'];

/** Drag cards between statuses. */
export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const dispatch = useAppDispatch();
  const modal = useModal();
  const label = useProjectLabel();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const drop = (id: string, to: TaskStatus) => {
    const r = dispatch(moveTask(id, to));
    if (r === 'waive') modal.open((c) => <WaiveDialog ids={[id]} onClose={c} />);
  };
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {COLS.map((col) => {
        const list = tasks.filter((t) => t.status === col);
        return (
          <div
            key={col}
            onDragOver={(e) => (e.preventDefault(), setOver(col))}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              drop(e.dataTransfer.getData('text/plain'), col);
            }}
            className={cn(
              'flex w-[260px] flex-none flex-col gap-2 rounded-xl bg-surface-2 p-2 transition md:w-auto',
              over === col && 'bg-brand-50 ring-2 ring-brand-200',
            )}
          >
            <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5">
              <Pill status={col} />
              <span className="num text-[12px] text-faint">{list.length} · {fmtH(sumMinutes(list))}</span>
            </div>
            {list.slice(0, 60).map((t) => {
              const l = label(t.projectId);
              return (
                <button
                  type="button"
                  key={t.id}
                  draggable={t.status !== 'invoiced'}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                  onClick={() => t.status !== 'invoiced' && modal.open((c) => <TaskDialog task={t} onClose={c} />)}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-left shadow-card transition hover:border-line-2',
                    t.status !== 'invoiced' && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  <span className="line-clamp-2 text-[13.5px] leading-snug">{t.memo}</span>
                  <span className="flex items-center gap-2 text-[12px] text-faint">
                    <i className="size-2 flex-none rounded-full" style={{ background: l.color }} />
                    <span className="flex-1 truncate">{l.project}</span>
                    <span>{relDay(t.date)}</span>
                    <span className="num font-medium text-ink">{fmtH(t.minutes)}</span>
                  </span>
                </button>
              );
            })}
            {!list.length && <div className="rounded-lg border border-dashed border-line-2 py-6 text-center text-[12px] text-faint">Drop here</div>}
          </div>
        );
      })}
    </div>
  );
}
