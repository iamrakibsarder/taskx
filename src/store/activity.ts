import type { ActivityEntry, CollectionKey, DataState, EntityOf, Invoice, Task } from '@/types/domain';
import { LOCAL_ACTIVITY_KEY } from '@/data/gateway';
import { storage } from '@/lib/utils';
import { fmtH } from '@/lib/format';

const MAX = 300;
const NAME: Record<CollectionKey, string> = { clients: 'client', projects: 'project', tasks: 'task', invoices: 'invoice', expenses: 'expense' };

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const moved = (a: string | undefined, b: string, text: string) => (a && a !== b ? `${text} · ${a} → ${b}` : text);

/** One line per change, worded like the server's log. */
export function describe(col: CollectionKey, prev: EntityOf<CollectionKey> | undefined, next: EntityOf<CollectionKey>): string {
  switch (col) {
    case 'tasks': {
      const t = next as Task;
      return moved((prev as Task | undefined)?.status, t.status, `${clip(t.memo)} (${fmtH(t.minutes)}, ${t.date})`);
    }
    case 'invoices': {
      const i = next as Invoice;
      const p = prev as Invoice | undefined;
      const pay = i.payments ?? [];
      if (pay.length > (p?.payments?.length ?? 0)) return `Invoice ${i.number} · payment ${pay[pay.length - 1]!.amount.toFixed(2)} ${i.currency}`;
      return moved(p?.status, i.status, `Invoice ${i.number} for ${i.client.name}`);
    }
    case 'clients':
      return `Client ${(next as { name: string }).name}`;
    case 'projects':
      return `Project ${(next as { name: string }).name}`;
    case 'expenses':
      return `Expense ${clip((next as { desc: string }).desc)} (${(next as { amount: number }).amount})`;
  }
}

/** Browser mode: keeps the newest `MAX` changes in local storage. */
export function recordLocal(entry: Omit<ActivityEntry, 'id' | 'at'>) {
  const all = storage.get<ActivityEntry[]>(LOCAL_ACTIVITY_KEY) ?? [];
  const id = (all[0]?.id ?? 0) + 1;
  storage.set(LOCAL_ACTIVITY_KEY, [{ ...entry, id, at: new Date().toISOString() }, ...all].slice(0, MAX));
}

/** What a data action changed, for the local log. `null` = nothing worth logging. */
export function entryFor(
  before: DataState,
  after: DataState,
  a: { type: string; payload: { col?: CollectionKey; id?: string; item?: { id: string } } },
  actor: string,
): Omit<ActivityEntry, 'id' | 'at'> | null {
  const { col } = a.payload ?? {};
  if (a.type === 'data/setWorkspace') return { actor, action: 'settings', entity: 'workspace', entityId: '', summary: 'Settings updated' };
  if (!col) return null;
  const id = a.payload.id ?? a.payload.item?.id ?? '';
  const prev = (before[col] as Array<EntityOf<CollectionKey>>).find((x) => x.id === id);
  const next = (after[col] as Array<EntityOf<CollectionKey>>).find((x) => x.id === id);
  if (a.type === 'data/remove') return prev ? { actor, action: 'delete', entity: NAME[col], entityId: id, summary: describe(col, undefined, prev) } : null;
  if (!next) return null;
  return { actor, action: prev ? 'update' : 'create', entity: NAME[col], entityId: id, summary: describe(col, prev, next) };
}
