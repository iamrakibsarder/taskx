import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import data, { dataActions } from './dataSlice';
import ui from './uiSlice';
import { ApiError, gateway } from '@/data/gateway';
import { entryFor, recordLocal } from './activity';
import { getSync, setSync } from './syncStatus';
import type { DataState } from '@/types/domain';
import { sampleData } from '@/data/sample';

/**
 * Mirrors every data change to the gateway.
 * Local mode: a debounced snapshot to browser storage, plus a local change log.
 * API mode: one request per change. If the server refuses one, the error is shown and the
 * screen is reloaded from the server once the queue is quiet, so it never shows unsaved data.
 */
let snapTimer: ReturnType<typeof setTimeout> | undefined;
const sync: Middleware = (api) => (next) => (action) => {
  const before = (api.getState() as RootState).data;
  const result = next(action);
  const a = action as { type: string; payload: never };
  if (!a.type.startsWith('data/') || a.type === dataActions.loaded.type || a.type === dataActions.loadFailed.type) return result;

  if (gateway.snapshot) {
    const after = (api.getState() as RootState).data;
    const entry = entryFor(before, after, a, after.workspace.ownerName);
    if (entry) recordLocal(entry);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const { status: _s, error: _e, ...rest } = (api.getState() as RootState).data;
      gateway.snapshot!(rest as DataState);
    }, 250);
    return result;
  }
  const p = a.payload as { col: never; item: never; id: string; fields: never };
  if (dataActions.upsert.match(action)) track(gateway.upsert(p.col, p.item));
  else if (dataActions.patch.match(action)) track(gateway.patch(p.col, p.id, p.fields));
  else if (dataActions.remove.match(action)) track(gateway.remove(p.col, p.id));
  else if (dataActions.setWorkspace.match(action)) track(gateway.saveWorkspace((api.getState() as RootState).data.workspace));
  return result;
};

function track(write: Promise<void>) {
  setSync((s) => ({ pending: s.pending + 1 }));
  write
    .then(() => setSync({ error: null, offline: false, savedAt: Date.now() }))
    .catch((e: unknown) => {
      const status = e instanceof ApiError ? e.status : -1;
      if (status === 401) return; // the sign-in screen takes over
      const msg = e instanceof Error ? e.message : String(e);
      setSync({ error: msg, offline: status === 0 });
      window.dispatchEvent(new CustomEvent('taskx:sync-error', { detail: msg }));
      if (status !== 0) scheduleResync();
    })
    .finally(() => setSync((s) => ({ pending: s.pending - 1 })));
}

let resyncTimer: ReturnType<typeof setTimeout> | undefined;
let lastLoad = Date.now();
/** Reloads everything from the server after the write queue drains. */
export function scheduleResync(delay = 400) {
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(async () => {
    await gateway.idle();
    try {
      const fresh = await gateway.loadAll();
      // A write sent while loading may not be in `fresh`; try again once things settle.
      if (getSync().pending > 0) return scheduleResync();
      store.dispatch(dataActions.loaded(fresh));
      lastLoad = Date.now();
      setSync({ error: null, offline: false });
    } catch (e) {
      setSync({ error: e instanceof Error ? e.message : String(e), offline: e instanceof ApiError && e.status === 0 });
    }
  }, delay);
}

if (typeof window !== 'undefined' && gateway.kind === 'http') {
  // Back online: show the server's version of things.
  window.addEventListener('online', () => getSync().offline && scheduleResync(0));
  // Teammates change things too: coming back to the tab after a while picks up their work.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 30_000) scheduleResync(0);
  });
}

export const store = configureStore({
  reducer: { data, ui },
  middleware: (gdm) => gdm({ serializableCheck: false }).concat(sync),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
/** The domain data (without load status), typed for the pure domain functions. */
export const useData = (): DataState => useAppSelector((s) => s.data);

export async function bootstrap() {
  try {
    store.dispatch(dataActions.loaded(await gateway.loadAll()));
  } catch (e) {
    store.dispatch(dataActions.loadFailed(String(e)));
  }
}

export async function resetToSample() {
  if (gateway.reset) store.dispatch(dataActions.loaded(await gateway.reset()));
}

/** API mode: fills an empty workspace with the demo data, keeping your business settings. */
export async function loadSampleIntoServer() {
  const { workspace } = store.getState().data;
  store.dispatch(dataActions.loaded(await gateway.importAll({ ...sampleData(), workspace })));
}

/** Replaces all data (from a backup file) through the active gateway. */
export async function importData(data: DataState) {
  store.dispatch(dataActions.loaded(await gateway.importAll(data)));
}
