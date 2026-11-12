import type { DataState, ID, Invoice, ISODate } from '@/types/domain';
import { addMonth, daysBetween, endOfMonth, fmtH, money, monthLabel, num, thisMonth, todayISO } from '@/lib/format';
import { sumBy } from '@/lib/utils';
import {
  clientBilling, clientColor, clientIdOf, findClient, findProject, invoiceStatus, invoiceTotals, isInternalTask,
  projectUsedMinutes, sumMinutes, taskValue,
} from './billing';

/* ---------- To-do / attention items ---------- */

export type AttentionKind = 'review' | 'overdue' | 'draft' | 'cap' | 'budget' | 'unbilled' | 'timer';
export interface AttentionItem {
  kind: AttentionKind;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  action: { label: string; to?: string; projectId?: ID; invoiceId?: ID; clientId?: ID };
}

export function attentionItems(s: DataState, timerStart?: number | null): AttentionItem[] {
  const items: AttentionItem[] = [];
  const today = todayISO();
  const mo = thisMonth();

  const oldReview = s.tasks.filter((t) => t.status === 'review' && daysBetween(t.date, today) >= 3);
  if (oldReview.length) {
    items.push({
      kind: 'review', tone: 'warning',
      title: `${oldReview.length} task${oldReview.length > 1 ? 's' : ''} waiting 3+ days`,
      detail: `${fmtH(sumMinutes(oldReview))} not approved yet`,
      action: { label: 'Review', to: '/tasks?status=review' },
    });
  }
  for (const i of s.invoices.filter((x) => invoiceStatus(x) === 'overdue')) {
    const d = daysBetween(i.dueDate, today);
    items.push({
      kind: 'overdue', tone: 'danger',
      title: `${i.number} is ${d} day${d === 1 ? '' : 's'} overdue`,
      detail: `${i.client.name} · ${money(invoiceTotals(i).balance, i.currency)}`,
      action: { label: 'Open', invoiceId: i.id },
    });
  }
  for (const i of s.invoices.filter((x) => x.status === 'draft')) {
    items.push({
      kind: 'draft', tone: 'info',
      title: `${i.number} is still a draft`,
      detail: `${i.client.name} · ${money(invoiceTotals(i).total, i.currency)}`,
      action: { label: 'Send', invoiceId: i.id },
    });
  }
  for (const c of s.clients.filter((c) => c.active && num(c.cap))) {
    const b = clientBilling(s, c, mo);
    const used = b.invoiced + b.billable + b.review;
    const cap = num(c.cap) * 60;
    if (used >= cap * 0.8) {
      items.push({
        kind: 'cap', tone: used > cap ? 'danger' : 'warning',
        title: `${c.name} at ${Math.round((used / cap) * 100)}% of cap`,
        detail: `${fmtH(used)} of ${fmtH(cap)} this month`,
        action: { label: 'View', clientId: c.id },
      });
    }
  }
  for (const p of s.projects.filter((p) => !p.archived && num(p.budgetHours))) {
    const used = projectUsedMinutes(s, p.id);
    const bud = num(p.budgetHours) * 60;
    if (used >= bud * 0.8) {
      items.push({
        kind: 'budget', tone: used > bud ? 'danger' : 'warning',
        title: `${p.name} used ${Math.round((used / bud) * 100)}% of budget`,
        detail: `${fmtH(used)} of ${fmtH(bud)}`,
        action: { label: 'Budget', projectId: p.id },
      });
    }
  }
  const leftover = s.tasks.filter((t) => t.status === 'billable' && t.date.slice(0, 7) < mo);
  if (leftover.length) {
    items.push({
      kind: 'unbilled', tone: 'info',
      title: `${money(sumBy(leftover, (t) => taskValue(s, t)), s.workspace.currency)} approved, not invoiced`,
      detail: `${leftover.length} task${leftover.length > 1 ? 's' : ''} from earlier months`,
      action: { label: 'Invoice', to: `/billing?month=${addMonth(mo, -1)}` },
    });
  }
  if (timerStart && Date.now() - timerStart >= 4 * 3600_000) {
    items.push({
      kind: 'timer', tone: 'warning',
      title: `Timer running ${fmtH(Math.floor((Date.now() - timerStart) / 60000))}`,
      detail: 'Did you forget to stop it?',
      action: { label: 'Stop' },
    });
  }
  return items;
}

/* ---------- Reports ---------- */

export type ReportRange = 'month' | 'last' | 'quarter' | 'year' | 'all';
export type ReportGroup = 'client' | 'project' | 'person';

export function reportRange(range: ReportRange): { from: ISODate; to: ISODate; label: string } {
  const today = todayISO();
  const y = +today.slice(0, 4);
  const mo = thisMonth();
  const q = Math.floor((+today.slice(5, 7) - 1) / 3);
  const qStart = `${y}-${String(q * 3 + 1).padStart(2, '0')}`;
  switch (range) {
    case 'last': {
      const m = addMonth(mo, -1);
      return { from: `${m}-01`, to: endOfMonth(m), label: monthLabel(m) };
    }
    case 'quarter':
      return { from: `${qStart}-01`, to: endOfMonth(addMonth(qStart, 2)), label: `Q${q + 1} ${y}` };
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31', label: 'All time' };
    default:
      return { from: `${mo}-01`, to: endOfMonth(mo), label: monthLabel(mo) };
  }
}

export interface ReportRow {
  key: string;
  label: string;
  color: string;
  total: number;
  billed: number;
  review: number;
  waived: number;
  internal: number;
  value: number;
  invoiced: number;
  clientMinutes: number;
}

const invoicedNet = (i: Invoice) => {
  const t = invoiceTotals(i);
  return t.total - t.credited;
};

export function buildReport(s: DataState, range: ReportRange, by: ReportGroup) {
  const r = reportRange(range);
  const tasks = s.tasks.filter((t) => t.date >= r.from && t.date <= r.to);
  const owner = s.workspace.ownerName || 'Me';
  const keyOf = (t: (typeof tasks)[number]) =>
    by === 'project' ? t.projectId : by === 'person' ? t.by || owner : clientIdOf(s, t);
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);

  const rows: ReportRow[] = [...groups.entries()]
    .map(([key, list]) => {
      let label: string;
      let color: string;
      if (by === 'project') {
        const p = findProject(s, key);
        label = p?.name ?? 'Deleted project';
        color = clientColor(s, p?.internal || !p?.clientId ? 'internal' : p.clientId);
      } else if (by === 'person') {
        label = key;
        color = 'var(--color-brand-500)';
      } else {
        label = key === 'internal' ? 'Internal' : findClient(s, key)?.name ?? 'Client';
        color = clientColor(s, key);
      }
      const m = (st: string) => sumMinutes(list.filter((t) => t.status === st));
      const invoiced =
        by === 'client' && key !== 'internal'
          ? sumBy(
              s.invoices.filter((i) => i.clientId === key && i.status !== 'void' && i.issueDate >= r.from && i.issueDate <= r.to),
              invoicedNet,
            )
          : 0;
      return {
        key, label, color,
        total: sumMinutes(list),
        billed: m('billable') + m('invoiced'),
        review: m('review'),
        waived: m('waived'),
        internal: m('internal'),
        value: sumBy(list.filter((t) => t.status === 'billable' || t.status === 'invoiced'), (t) => taskValue(s, t)),
        invoiced,
        clientMinutes: sumMinutes(list.filter((t) => !isInternalTask(s, t))),
      };
    })
    .sort((a, b) => b.total - a.total);

  const totals = rows.reduce(
    (a, x) => ({
      total: a.total + x.total, billed: a.billed + x.billed, review: a.review + x.review, waived: a.waived + x.waived,
      internal: a.internal + x.internal, value: a.value + x.value, invoiced: a.invoiced + x.invoiced,
      clientMinutes: a.clientMinutes + x.clientMinutes,
    }),
    { total: 0, billed: 0, review: 0, waived: 0, internal: 0, value: 0, invoiced: 0, clientMinutes: 0 },
  );
  const invoicedAll = sumBy(
    s.invoices.filter((i) => i.status !== 'void' && i.issueDate >= r.from && i.issueDate <= r.to),
    invoicedNet,
  );
  const effectiveRate = totals.clientMinutes ? invoicedAll / (totals.clientMinutes / 60) : 0;
  return { range: r, rows, totals, invoicedAll, effectiveRate, taskCount: tasks.length };
}
