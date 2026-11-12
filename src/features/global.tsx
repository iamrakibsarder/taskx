import { useCallback, useEffect, useState } from 'react';
import { Camera, FolderOpen, Play } from 'lucide-react';
import { Dialog } from '@/components/ui/Modal';
import { Field } from '@/components/ui';
import { useModal } from '@/components/ui/Modal';
import { ProjectSelect } from '@/components/ProjectSelect';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { clearTimer, startTimer } from '@/store/uiSlice';
import { TaskDialog, type TaskPrefill } from '@/features/tasks/TaskDialogs';
import { snap15, todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';
import { findClient, findProject } from '@/domain/billing';
import { isCaptureSupported, startCapture, stopCapture } from '@/features/capture/capture';
import type { ShotContext } from '@/features/capture/paths';
import { SCREENSHOTS } from '@/lib/flags';
import { allowFolder, folderAccess, pickFolder, screenshotStorage } from '@/features/capture/storage';

/** Seconds since the timer started, ticking. */
export function useElapsed(start?: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);
  return start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

export const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** What the current timer's screenshots are filed under. */
export function timerShotContext(): ShotContext | null {
  const { ui, data } = store.getState();
  if (!ui.timer) return null;
  const p = findProject(data, ui.timer.projectId);
  const c = p && !p.internal ? findClient(data, p.clientId) : undefined;
  return { user: data.workspace.ownerName || 'me', client: c?.name ?? '', project: p?.name ?? 'No project' };
}

/** Folder status for local screenshot saving, and the click handlers to fix it. */
export function useScreenshotFolder() {
  const [access, setAccess] = useState<{ state: PermissionState | 'missing' | 'checking'; name?: string }>({ state: 'checking' });
  const refresh = useCallback(() => void folderAccess().then(setAccess), []);
  useEffect(refresh, [refresh]);
  const choose = async () => {
    try {
      const h = await pickFolder();
      setAccess({ state: 'granted', name: h.name });
      toast(`Screenshots will be saved in “${h.name}”`);
    } catch {
      /* picker closed */
    }
  };
  const allow = async () => {
    if (await allowFolder()) refresh();
  };
  return { access, choose, allow, needsFolder: screenshotStorage.kind === 'folder' };
}

function StartTimerDialog({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const every = useAppSelector((s) => s.data.workspace.screenshotMinutes);
  const [projectId, setProjectId] = useState('');
  const [memo, setMemo] = useState('');
  const canCapture = SCREENSHOTS && every > 0 && isCaptureSupported();
  const [capture, setCapture] = useState(canCapture);
  const folder = useScreenshotFolder();
  const folderOk = !folder.needsFolder || folder.access.state === 'granted';

  const start = () => {
    if (!projectId) return toast.error('Choose a project.');
    if (capture && !folderOk) return toast.error('Choose where to save screenshots first.');
    const go = () => {
      dispatch(startTimer({ projectId, memo, capture }));
      onClose();
    };
    if (!capture) return go();
    // Must be called straight from the click so the browser shows its prompt.
    void startCapture(every, timerShotContext).then((ok) => ok && go());
  };

  return (
    <Dialog
      title="Start timer"
      onClose={onClose}
      onSubmit={start}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Play /> {capture ? 'Share screen & start' : 'Start'}</button>
        </>
      }
    >
      <Field label="Working on">
        <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional, you can fill it in later" data-autofocus />
      </Field>
      <Field label="Project">
        <ProjectSelect value={projectId} onChange={setProjectId} />
      </Field>
      {canCapture && (
        <div className="rounded-lg border border-line bg-surface-2/60 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 size-4" checked={capture} onChange={(e) => setCapture(e.target.checked)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Camera className="size-4 text-brand-600" /> Take a screenshot every {every} min</span>
              <span className="block text-[12.5px] text-muted">Your browser asks which screen to share. Stop sharing any time to pause.</span>
            </span>
          </label>
          {capture && folder.needsFolder && folder.access.state !== 'granted' && folder.access.state !== 'checking' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
              <FolderOpen className="size-4 text-faint" />
              {folder.access.state === 'missing' ? 'Pick a folder to save screenshots in.' : `Allow saving to “${folder.access.name}” again.`}
              <button type="button" className="btn btn-sm ml-auto" onClick={folder.access.state === 'missing' ? folder.choose : folder.allow}>
                {folder.access.state === 'missing' ? 'Choose folder' : 'Allow'}
              </button>
            </div>
          )}
          {capture && folder.needsFolder && folder.access.state === 'granted' && (
            <p className="mt-2 pl-7 text-[12px] text-faint">Saving to “{folder.access.name}”</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** App-wide actions used by the top bar, palette and keyboard shortcuts. */
export function useGlobalActions() {
  const modal = useModal();
  const dispatch = useAppDispatch();
  const timer = useAppSelector((s) => s.ui.timer);

  const newTask = useCallback(
    (prefill?: TaskPrefill) => modal.open((close) => <TaskDialog prefill={prefill} onClose={close} />),
    [modal],
  );

  const stopTimer = useCallback(() => {
    if (!timer) return;
    const minutes = Math.max(15, snap15(Math.round((Date.now() - timer.start) / 60000)));
    modal.open((close) => (
      <TaskDialog
        prefill={{ projectId: timer.projectId, memo: timer.memo, minutes, date: todayISO() }}
        onClose={close}
        onSaved={() => (stopCapture(), dispatch(clearTimer()))}
      />
    ));
  }, [timer, modal, dispatch]);

  const discardTimer = useCallback(() => {
    stopCapture();
    dispatch(clearTimer());
    toast('Timer discarded');
  }, [dispatch]);

  const toggleTimer = useCallback(() => {
    if (timer) stopTimer();
    else modal.open((close) => <StartTimerDialog onClose={close} />);
  }, [timer, stopTimer, modal]);

  /** After a reload the share is gone; this asks again (from a click). */
  const resumeCapture = useCallback(() => {
    void startCapture(store.getState().data.workspace.screenshotMinutes || 5, timerShotContext);
  }, []);

  return { newTask, toggleTimer, stopTimer, discardTimer, resumeCapture, timer };
}
