import type { DataState, ID, ISODate } from '@/types/domain';
import { parseDuration, snap15, todayISO } from '@/lib/format';
import { activeProjects, findClient } from './billing';

export interface JournalRow {
  date: ISODate;
  projectId: ID | '';
  memo: string;
  minutes: number;
}

const DURATION =
  /(\d+(?:[.,]\d+)?\s*(?:h|hr|hrs|hours?)\s*(?:\d+\s*(?:m|min|mins|minutes?))?|\d+\s*(?:m|min|mins|minutes?)\b|\b\d{1,2}:\d{2}\b)/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turns free text ("Patient portal: insurance upload 4h") into task rows.
 * One task per line. Matches project or client names, reads a duration, rounds to 15 minutes.
 * The Rust API can later swap this for an AI-backed parser behind the same shape.
 */
export function parseJournal(s: DataState, text: string, date: ISODate = todayISO()): JournalRow[] {
  const projects = activeProjects(s);
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const dm = line.match(DURATION);
      const minutes = dm ? snap15(parseDuration(dm[1]!.replace(/\s+/g, '')), s.workspace.rounding) : 60;
      const low = line.toLowerCase();
      let best: (typeof projects)[number] | undefined;
      let bestLen = 0;
      for (const p of projects) {
        for (const name of [p.name, findClient(s, p.clientId)?.name].filter(Boolean) as string[]) {
          const n = name.toLowerCase();
          if (low.includes(n) && n.length > bestLen) {
            best = p;
            bestLen = n.length;
          }
        }
      }
      let memo = line.replace(DURATION, '').replace(/\b(about|around|approx\.?|for)\s*$/i, '');
      if (best) {
        for (const name of [best.name, findClient(s, best.clientId)?.name].filter(Boolean) as string[]) {
          memo = memo.replace(new RegExp(`${escapeRe(name)}\\s*[:\\-–—|,]?`, 'i'), '');
        }
      }
      memo = memo.replace(/^[\s:\-–—|,]+|[\s:\-–—|,]+$/g, '').replace(/\s{2,}/g, ' ');
      return {
        date,
        projectId: best?.id ?? '',
        memo: memo ? memo[0]!.toUpperCase() + memo.slice(1) : '',
        minutes: minutes || 60,
      };
    })
    .filter((r) => r.memo);
}
