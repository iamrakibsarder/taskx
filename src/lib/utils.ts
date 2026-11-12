export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const sumBy = <T,>(items: T[], f: (x: T) => number) => items.reduce((a, x) => a + f(x), 0);

export const safeUrl = (u: string) => {
  const s = u.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/** Offers a generated file to the browser as a download. */
export function downloadFile(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const csv = (rows: Array<Array<string | number>>) =>
  rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

export const storage = {
  get<T>(key: string): T | null {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked; the app keeps working in memory */
    }
  },
};
