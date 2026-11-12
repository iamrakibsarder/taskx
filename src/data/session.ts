import { useSyncExternalStore } from 'react';
import { storage } from '@/lib/utils';

/** The signed-in account (API mode with accounts on). */
export interface Account {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  /** In the current workspace. */
  role: Role;
  workspaceName: string;
}

export type Role = 'owner' | 'admin' | 'member';
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };
/** True when `role` is at least `min`. With no account (browser mode, accounts off) you can do everything. */
export const can = (a: Account | null, min: Role) => !a || RANK[a.role] >= RANK[min];

const TOKEN_KEY = 'taskx.token';
let account: Account | null = null;
/** The server really sends email (otherwise invite links must be shared by hand). */
let mailEnabled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const session = {
  token: () => storage.get<string>(TOKEN_KEY),
  account: () => account,
  mailEnabled: () => mailEnabled,
  /** Keeps the token for later visits. Call `setAccount` with `/api/auth/me` afterwards. */
  saveToken(token: string) {
    storage.set(TOKEN_KEY, token);
  },
  setAccount(user: Account | null, mail = false) {
    account = user;
    mailEnabled = mail;
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
