/**
 * Where a screenshot goes:
 *   <user>/clients/<client>/<project>/<YYYY-MM>/week-<n>/<YYYY-MM-DD_HH-MM-SS>.jpg
 *   <user>/internal/<project>/<YYYY-MM>/week-<n>/…   (internal projects)
 * The Rust API builds the exact same path (see taskx-backend/src/screenshots.rs).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Safe folder/file name: no slashes or characters Windows/macOS/Drive reject. */
export function safeName(s: string, fallback = 'unnamed') {
  const out = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
    .trim();
  return out || fallback;
}

/** Week of the month, weeks starting Monday. The week holding the 1st is week 1. */
export function weekOfMonth(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Math.floor((d.getDate() - 1 + offset) / 7) + 1;
}

/** Local time as `YYYY-MM-DDTHH:MM:SS` (no zone), so folders follow the user's own day. */
export const localStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export interface ShotContext {
  user: string;
  /** Empty for internal projects. */
  client: string;
  project: string;
}

export function screenshotPath(ctx: ShotContext, at: Date, ext = 'jpg') {
  const month = `${at.getFullYear()}-${pad(at.getMonth() + 1)}`;
  const base = ctx.client ? ['clients', safeName(ctx.client)] : ['internal'];
  const dirs = [safeName(ctx.user, 'me'), ...base, safeName(ctx.project), month, `week-${weekOfMonth(at)}`];
  const file = `${localStamp(at).replace('T', '_').replace(/:/g, '-')}.${ext}`;
  return { dirs, file };
}
