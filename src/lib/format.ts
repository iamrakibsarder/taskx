import type { ISODate, ISOMonth, RoundingMode } from '@/types/domain';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MON3 = MONTHS.map((m) => m.slice(0, 3));
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => String(n).padStart(2, '0');

/* ---------- Dates ---------- */

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (): ISODate => toISO(new Date());
export const thisMonth = (): ISOMonth => todayISO().slice(0, 7);
export const fromISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const addDays = (s: ISODate, n: number): ISODate => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const addMonth = (m: ISOMonth, n: number): ISOMonth => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5);
export const endOfMonth = (m: ISOMonth): ISODate => addDays(`${addMonth(m, 1)}-01`, -1);
/** Monday of the week containing today, shifted by `offset` weeks. */
export const weekStart = (offset = 0): ISODate => {
  const d = new Date();
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd + offset * 7);
  return toISO(d);
};
export const dayIndex = (s: ISODate) => (fromISO(s).getDay() + 6) % 7;

export const fmtDate = (s?: string | null) => {
  if (!s) return '';
  const d = fromISO(s);
  return `${d.getDate()} ${MON3[d.getMonth()]}`;
};
export const longDate = (s?: string | null) => {
  if (!s) return '—';
  const d = fromISO(s);
  return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`;
};
export const monthLabel = (m?: string | null) => {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return `${MONTHS[mm - 1]} ${y}`;
};
export const relDay = (s: ISODate) => {
  const t = todayISO();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return `${DOW[dayIndex(s)]} ${fmtDate(s)}`;
};

/* ---------- Durations ---------- */

/** Minutes as `h:mm`. */
export const fmtH = (min: number) => {
  const m = Math.round(min || 0);
  const sign = m < 0 ? '-' : '';
  const a = Math.abs(m);
  return `${sign}${Math.floor(a / 60)}:${pad(a % 60)}`;
};

/** Rounds to a 15-minute step (minimum 15 for any positive value). */
export function snap15(min: number, mode: RoundingMode = 'nearest'): number {
  if (!(min > 0)) return 0;
  const steps = min / 15;
  const r = mode === 'up' ? Math.ceil(steps - 1e-9) : mode === 'down' ? Math.floor(steps) : Math.round(steps);
  return Math.max(15, r * 15);
}

/** Reads `1:30`, `1.5`, `90m`, `2h 15m`, `2h15m`, `3` (hours if ≤12) into raw minutes. */
export function parseDuration(input: unknown): number {
  if (input == null) return 0;
  const s = String(input).trim().toLowerCase().replace(',', '.').replace(/\s+/g, ' ');
  if (!s) return 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,3}):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?) ?h(?:rs?|ours?)? ?(?:(\d+) ?m(?:in(?:s|utes?)?)?)?$/))) return Math.round(+m[1] * 60) + +(m[2] || 0);
  if ((m = s.match(/^(\d+) ?m(?:in(?:s|utes?)?)?$/))) return +m[1];
  if (/^\d+\.\d+$/.test(s)) return Math.round(+s * 60);
  if (/^\d+$/.test(s)) return +s <= 12 ? +s * 60 : +s;
  return 0;
}

/* ---------- Money ---------- */

const fmtCache = new Map<string, Intl.NumberFormat>();
const nf = (key: string, opts: Intl.NumberFormatOptions) => {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, opts);
    fmtCache.set(key, f);
  }
  return f;
};

export function money(n: number, currency = 'USD') {
  try {
    return nf(`m-${currency}`, { style: 'currency', currency }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`;
  }
}

/** Whole units under 10k, compact above (`$12.4K`). */
export function moneyShort(n: number, currency = 'USD') {
  try {
    return Math.abs(n) >= 10000
      ? nf(`c-${currency}`, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n)
      : nf(`s-${currency}`, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return money(n, currency);
  }
}

export const round2 = (n: number) => Math.round((+n || 0) * 100) / 100;
export const num = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};
