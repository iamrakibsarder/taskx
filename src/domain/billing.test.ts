import { describe, expect, it } from 'vitest';
import { fmtH, parseDuration, snap15 } from '@/lib/format';
import { sampleData } from '@/data/sample';
import { buildInvoiceLines, clientBilling, invoiceStatus, invoiceTotals } from './billing';
import { parseJournal } from './journal';
import type { DataState, Invoice } from '@/types/domain';

describe('time', () => {
  it('parses common duration formats', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1.5')).toBe(90);
    expect(parseDuration('90m')).toBe(90);
    expect(parseDuration('2h 15m')).toBe(135);
    expect(parseDuration('2h15m')).toBe(135);
    expect(parseDuration('3')).toBe(180);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('')).toBe(0);
  });
  it('rounds to 15 minutes by rule, never below 15', () => {
    expect(snap15(7)).toBe(15);
    expect(snap15(37)).toBe(30);
    expect(snap15(38)).toBe(45);
    expect(snap15(31, 'up')).toBe(45);
    expect(snap15(30, 'up')).toBe(30);
    expect(snap15(44, 'down')).toBe(30);
    expect(snap15(0)).toBe(0);
  });
  it('formats h:mm', () => {
    expect(fmtH(135)).toBe('2:15');
    expect(fmtH(0)).toBe('0:00');
  });
});

describe('invoice totals', () => {
  const base = { lines: [{ amount: 100 }, { amount: 50.5 }], discount: 10, taxRate: 10, credits: [] } as unknown as Invoice;
  it('applies discount, then tax', () => {
    const t = invoiceTotals(base);
    expect(t.subtotal).toBe(150.5);
    expect(t.tax).toBe(14.05);
    expect(t.total).toBe(154.55);
    expect(t.balance).toBe(154.55);
  });
  it('subtracts credit notes from the balance', () => {
    const t = invoiceTotals({ ...base, credits: [{ id: 'c', number: 'CN-1', date: '2026-01-01', amount: 54.55, reason: '' }] });
    expect(t.credited).toBe(54.55);
    expect(t.balance).toBe(100);
  });
  it('marks sent invoices past due as overdue', () => {
    const inv = { status: 'sent', dueDate: '2026-01-10' } as Invoice;
    expect(invoiceStatus(inv, '2026-01-11')).toBe('overdue');
    expect(invoiceStatus(inv, '2026-01-10')).toBe('sent');
  });
});

describe('billing preview', () => {
  const s: DataState = sampleData();
  const month = s.tasks.find((t) => t.id === 's-t10')!.date.slice(0, 7);

  it('groups hourly work per project at the right rate, plus expenses', () => {
    const c = s.clients.find((c) => c.id === 's-c1')!;
    const b = clientBilling(s, c, month);
    const holiday = b.lines.find((l) => l.desc === 'Holiday campaign')!;
    expect(holiday.minutes).toBe(165);
    expect(holiday.rate).toBe(70); // project override
    expect(holiday.amount).toBe(192.5);
    const site = b.lines.find((l) => l.desc === 'Website refresh')!;
    expect(site.rate).toBe(65); // client rate
    expect(b.lines.some((l) => l.kind === 'expense' && l.amount === 39)).toBe(true);
  });

  it('bills the retainer fee once, and marks up expenses', () => {
    const c = s.clients.find((c) => c.id === 's-c2')!;
    const ready = s.tasks.filter((t) => t.projectId === 's-p3' && t.status === 'billable' && t.date.startsWith(month));
    const lines = buildInvoiceLines(s, c, month, ready);
    expect(lines.filter((l) => l.kind === 'retainer')).toHaveLength(1);
    expect(lines.find((l) => l.kind === 'expense')!.amount).toBe(264); // 240 + 10%
  });

  it('itemizes one line per task when asked', () => {
    const c = s.clients.find((c) => c.id === 's-c1')!;
    const ready = s.tasks.filter((t) => t.status === 'billable' && t.date.startsWith(month) && ['s-p1', 's-p2'].includes(t.projectId));
    const lines = buildInvoiceLines(s, c, month, ready, true).filter((l) => l.kind === 'hours');
    expect(lines).toHaveLength(ready.length);
  });
});

describe('journal parser', () => {
  it('matches projects and reads durations', () => {
    const s = sampleData();
    const rows = parseJournal(s, 'Patient portal: insurance upload 4h\nNorthwind call about hosting, 15m', '2026-01-05');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.projectId).toBe('s-p3');
    expect(rows[0]!.minutes).toBe(240);
    expect(rows[1]!.minutes).toBe(15);
  });
});
