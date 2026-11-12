import { describe, expect, it } from 'vitest';
import { safeName, screenshotPath, weekOfMonth } from './paths';

describe('screenshot paths', () => {
  it('numbers weeks of the month from Monday', () => {
    // Nov 2026 starts on a Sunday: the 1st is week 1, Mon the 2nd starts week 2.
    expect(weekOfMonth(new Date(2026, 10, 1))).toBe(1);
    expect(weekOfMonth(new Date(2026, 10, 2))).toBe(2);
    expect(weekOfMonth(new Date(2026, 10, 30))).toBe(6);
    // Jun 2026 starts on a Monday.
    expect(weekOfMonth(new Date(2026, 5, 7))).toBe(1);
    expect(weekOfMonth(new Date(2026, 5, 8))).toBe(2);
  });
  it('builds user/clients/client/project/month/week/file', () => {
    const p = screenshotPath({ user: 'Alex', client: 'Northwind Bakery', project: 'Website refresh' }, new Date(2026, 10, 6, 2, 15, 9));
    expect([...p.dirs, p.file].join('/')).toBe('Alex/clients/Northwind Bakery/Website refresh/2026-11/week-2/2026-11-06_02-15-09.jpg');
  });
  it('files internal work outside clients', () => {
    const p = screenshotPath({ user: 'Alex', client: '', project: 'Admin' }, new Date(2026, 10, 6, 9, 0, 0));
    expect(p.dirs.slice(0, 3)).toEqual(['Alex', 'internal', 'Admin']);
  });
  it('strips characters folders can’t hold', () => {
    expect(safeName('A/B: "C"?')).toBe('A B C');
    expect(safeName('...')).toBe('unnamed');
  });
});
