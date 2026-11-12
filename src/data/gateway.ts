import type { ActivityEntry, CollectionKey, DataState, EntityOf, ID, Workspace } from '@/types/domain';
import { storage } from '@/lib/utils';
import { defaultWorkspace, sampleData } from './sample';
import { session, SIGNED_OUT } from './session';

/**
 * The one seam between the UI and wherever data lives.
 *
 * - `LocalGateway` (default): keeps everything in browser storage. Used until the Rust API is ready.
 * - `HttpGateway`: talks to the TaskX Rust API. Turned on by setting `VITE_API_URL`.
 *
 * Redux stays the source of truth on screen; every data action is mirrored to the gateway by
 * `store/sync.ts`, so swapping gateways never touches components.
 */
export interface DataGateway {
  readonly kind: 'local' | 'http';
  loadAll(): Promise<DataState>;
  upsert<K extends CollectionKey>(col: K, item: EntityOf<K>): Promise<void>;
  patch<K extends CollectionKey>(col: K, id: ID, fields: Partial<EntityOf<K>>): Promise<void>;
  remove(col: CollectionKey, id: ID): Promise<void>;
  saveWorkspace(ws: Workspace): Promise<void>;
  /** Local mode only: persist a full snapshot. */
  snapshot?(state: DataState): void;
  reset?(): Promise<DataState>;
  /** Replace all data (restore a backup). */
  importAll(data: DataState): Promise<DataState>;
  /** Change history, newest first. `before` = only entries older than that id. */
  activity(before?: number): Promise<ActivityEntry[]>;
  /** Resolves when every write sent so far has finished. */
  idle(): Promise<void>;
}

/** Browser-mode change history, recorded by the store (see `store/activity.ts`). */
export const LOCAL_ACTIVITY_KEY = 'taskx.activity.v1';

/** Thrown for API errors; `status` 0 = the server couldn't be reached. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One request to the TaskX API, with the sign-in token. A 401 signs the person out. */
export async function apiRequest<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Can’t reach the TaskX server. Check your connection.', 0);
  }
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(SIGNED_OUT));
    throw new ApiError(msg ?? `${method} ${path} failed with ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const KEY = 'taskx.data.v1';

export class LocalGateway implements DataGateway {
  readonly kind = 'local' as const;
  async loadAll() {
    const saved = storage.get<DataState>(KEY);
    if (saved?.workspace) return { ...saved, workspace: { ...defaultWorkspace(), ...saved.workspace } };
    const fresh = sampleData();
    storage.set(KEY, fresh);
    return fresh;
  }
  // Per-entity writes are covered by the debounced snapshot.
  async upsert() {}
  async patch() {}
  async remove() {}
  async saveWorkspace() {}
  snapshot(state: DataState) {
    storage.set(KEY, state);
  }
  async reset() {
    const fresh = sampleData();
    storage.set(KEY, fresh);
    return fresh;
  }
  async importAll(data: DataState) {
    const next = { ...data, workspace: { ...defaultWorkspace(), ...data.workspace } };
    storage.set(KEY, next);
    return next;
  }
  async activity(before?: number) {
    const all = storage.get<ActivityEntry[]>(LOCAL_ACTIVITY_KEY) ?? [];
    return all.filter((e) => before === undefined || e.id < before).slice(0, 100);
  }
  async idle() {}
}

/** REST contract for the Rust API. Paths are relative to `VITE_API_URL`. */
export class HttpGateway implements DataGateway {
  readonly kind = 'http' as const;
  constructor(private base: string) {}
  /** Writes go out one at a time, in order, so e.g. "create invoice, then link tasks" never races. */
  private queue: Promise<unknown> = Promise.resolve();

  private send<T>(method: string, path: string, body?: unknown): Promise<T> {
    return apiRequest<T>(this.base, method, path, body);
  }

  idle() {
    return this.queue.then(() => undefined);
  }
  /** GET /api/activity */
  activity(before?: number) {
    return this.req<ActivityEntry[]>('GET', `/api/activity?limit=100${before ? `&before=${before}` : ''}`);
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (method === 'GET') return this.send<T>(method, path, body);
    const run = this.queue.then(() => this.send<T>(method, path, body));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** POST /api/import: replace everything on the server (restore a backup or move browser data up). */
  importAll(data: DataState) {
    return this.req<DataState>('POST', '/api/import', data);
  }

  /** GET /api/bootstrap → the whole workspace in one call. */
  loadAll() {
    return this.req<DataState>('GET', '/api/bootstrap');
  }
  /** PUT /api/{collection}/{id} */
  async upsert<K extends CollectionKey>(col: K, item: EntityOf<K>) {
    await this.req('PUT', `/api/${col}/${item.id}`, item);
  }
  /** PATCH /api/{collection}/{id} */
  async patch<K extends CollectionKey>(col: K, id: ID, fields: Partial<EntityOf<K>>) {
    await this.req('PATCH', `/api/${col}/${id}`, fields);
  }
  /** DELETE /api/{collection}/{id} */
  async remove(col: CollectionKey, id: ID) {
    await this.req('DELETE', `/api/${col}/${id}`);
  }
  /** PUT /api/workspace */
  async saveWorkspace(ws: Workspace) {
    await this.req('PUT', '/api/workspace', ws);
  }
}

const configuredApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
/** In development the Vite dev server forwards /api to VITE_API_URL, so the app calls its own origin. */
export const apiUrl = configuredApi ? (import.meta.env.DEV ? '/' : configuredApi) : undefined;
export const gateway: DataGateway = apiUrl ? new HttpGateway(apiUrl) : new LocalGateway();
