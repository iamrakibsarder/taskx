import { useSyncExternalStore } from 'react';
import { storage } from '@/lib/utils';

/** The signed-in account (API mode with accounts on). */
export interface Account {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
}

const TOKEN_KEY = 'taskx.token';
let account: Account | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const session = {
  token: () => storage.get<string>(TOKEN_KEY),
  /** Keeps the token for later visits and remembers who is signed in. */
  signIn(token: string, user: Account) {
    storage.set(TOKEN_KEY, token);
    account = user;
    emit();
  },
  setAccount(user: Account | null) {
    account = user;
    emit();
  },
  clear() {
    storage.set(TOKEN_KEY, null);
    account = null;
    emit();
  },
};

export const useAccount = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => account,
    () => null,
  );

/** Fired when the server says the session is over (401). The auth gate shows sign-in. */
export const SIGNED_OUT = 'taskx:signed-out';
