import { useSyncExternalStore } from 'react';
import { storage } from './utils';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'taskx.theme';
const listeners = new Set<() => void>();

export function getTheme(): ThemePref {
  const t = storage.get<ThemePref>(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

/** Saves the choice and applies it. `system` follows the OS setting (see styles/index.css). */
export function setTheme(t: ThemePref) {
  storage.set(KEY, t === 'system' ? null : t);
  applyTheme();
  listeners.forEach((l) => l());
}

export function applyTheme() {
  const t = getTheme();
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function useTheme(): ThemePref {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getTheme,
    () => 'system' as ThemePref,
  );
}
