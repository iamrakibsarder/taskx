import { apiUrl } from '@/data/gateway';
import { idb } from '@/lib/idb';
import { localStamp, screenshotPath, type ShotContext } from './paths';
import { session } from '@/data/session';

/**
 * Where screenshots are written. Same idea as the data gateway:
 * - `folder`: a folder on this computer the user picked (Chrome/Edge), used while there's no API.
 * - `server`: POST to the Rust API, which saves them (and later uploads to Google Drive).
 */
export interface ScreenshotStorage {
  readonly kind: 'folder' | 'server';
  save(ctx: ShotContext, at: Date, image: Blob): Promise<string>;
}

const HANDLE_KEY = 'screenshots.folder';

export const folderSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export const savedFolder = () => idb.get<FileSystemDirectoryHandle>(HANDLE_KEY);

/** Opens the folder picker. Must run from a click. */
export async function pickFolder() {
  const h = await window.showDirectoryPicker!({ id: 'taskx-screenshots', mode: 'readwrite', startIn: 'documents' });
  await idb.set(HANDLE_KEY, h);
  return h;
}

export async function forgetFolder() {
  await idb.del(HANDLE_KEY);
}

/** `granted`, `prompt` (needs a click to re-allow after a browser restart), or `missing`. */
export async function folderAccess(): Promise<{ state: PermissionState | 'missing'; name?: string }> {
  const h = await savedFolder();
  if (!h) return { state: 'missing' };
  const state = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  return { state, name: h.name };
}

/** Re-asks for write access to the saved folder. Must run from a click. */
export async function allowFolder() {
  const h = await savedFolder();
  if (!h) return false;
  return ((await h.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted';
}

class FolderStorage implements ScreenshotStorage {
  readonly kind = 'folder' as const;
  async save(ctx: ShotContext, at: Date, image: Blob) {
    const root = await savedFolder();
    if (!root) throw new Error('Choose a screenshots folder in Settings first.');
    let dir = root;
    const { dirs, file } = screenshotPath(ctx, at);
    for (const d of dirs) dir = await dir.getDirectoryHandle(d, { create: true });
    const fh = await dir.getFileHandle(file, { create: true });
    const w = await fh.createWritable();
    await w.write(image);
    await w.close();
    return [root.name, ...dirs, file].join('/');
  }
}

class ServerStorage implements ScreenshotStorage {
  readonly kind = 'server' as const;
  constructor(private base: string) {}
  async save(ctx: ShotContext, at: Date, image: Blob) {
    const q = new URLSearchParams({ user: ctx.user, client: ctx.client, project: ctx.project, takenAt: localStamp(at) });
    const res = await fetch(`${this.base.replace(/\/$/, '')}/api/screenshots?${q}`, {
      method: 'POST',
      headers: {
        'Content-Type': image.type || 'image/jpeg',
        ...(session.token() ? { Authorization: `Bearer ${session.token()}` } : {}),
      },
      body: image,
      credentials: 'include',
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
    return ((await res.json()) as { path: string }).path;
  }
}

export const screenshotStorage: ScreenshotStorage = apiUrl ? new ServerStorage(apiUrl) : new FolderStorage();
