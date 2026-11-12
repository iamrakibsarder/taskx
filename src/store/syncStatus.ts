import { useSyncExternalStore } from 'react';

/** API mode: what the top bar shows about saving. */
export interface SyncStatus {
  /** Writes sent and not answered yet. */
  pending: number;
  /** Last failure, cleared by the next successful save or resync. */
  error: string | null;
  /** The server couldn't be reached. */
  offline: boolean;
  savedAt: number | null;
}

let state: SyncStatus = { pending: 0, error: null, offline: false, savedAt: null };
const listeners = new Set<() => void>();

export function setSync(patch: Partial<SyncStatus> | ((s: SyncStatus) => Partial<SyncStatus>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export const getSync = () => state;

export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getSync,
    getSync,
  );
