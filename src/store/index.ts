import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import data, { dataActions } from './dataSlice';
import ui from './uiSlice';
import { gateway } from '@/data/gateway';
import type { DataState } from '@/types/domain';

/**
 * Mirrors every data change to the gateway.
 * Local mode: a debounced snapshot to browser storage.
 * API mode: one request per change (errors are reported, the screen keeps the optimistic value).
 */
let snapTimer: ReturnType<typeof setTimeout> | undefined;
const sync: Middleware = (api) => (next) => (action) => {
  const result = next(action);
  const a = action as { type: string; payload: never };
  if (!a.type.startsWith('data/') || a.type === dataActions.loaded.type || a.type === dataActions.loadFailed.type) return result;

  if (gateway.snapshot) {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const { status: _s, error: _e, ...rest } = (api.getState() as RootState).data;
      gateway.snapshot!(rest as DataState);
    }, 250);
    return result;
  }
  const p = a.payload as { col: never; item: never; id: string; fields: never };
  const report = (e: unknown) => window.dispatchEvent(new CustomEvent('taskx:sync-error', { detail: e instanceof Error ? e.message : String(e) }));
  if (dataActions.upsert.match(action)) gateway.upsert(p.col, p.item).catch(report);
  else if (dataActions.patch.match(action)) gateway.patch(p.col, p.id, p.fields).catch(report);
  else if (dataActions.remove.match(action)) gateway.remove(p.col, p.id).catch(report);
  else if (dataActions.setWorkspace.match(action)) gateway.saveWorkspace((api.getState() as RootState).data.workspace).catch(report);
  return result;
};

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

/** Replaces all data (from a backup file) through the active gateway. */
export async function importData(data: DataState) {
  store.dispatch(dataActions.loaded(await gateway.importAll(data)));
}
