import type {
  Client, DataState, Expense, ID, Invoice, InvoiceDisplayStatus, InvoiceLine, ISODate, ISOMonth, Project, Task,
} from '@/types/domain';
import { fmtDate, fmtH, monthLabel, num, round2, todayISO } from '@/lib/format';
import { sumBy } from '@/lib/utils';

/* ---------- Lookups ---------- */

export const findProject = (s: DataState, id: ID | null | undefined) => s.projects.find((p) => p.id === id);
export const findClient = (s: DataState, id: ID | null | undefined) => s.clients.find((c) => c.id === id);

/** Client id of a task, or `'internal'`. */
export function clientIdOf(s: DataState, t: Task): ID | 'internal' {
  const p = findProject(s, t.projectId);
  return p && !p.internal && p.clientId ? p.clientId : 'internal';
}
export const isInternalTask = (s: DataState, t: Task) => !!findProject(s, t.projectId)?.internal;

export const clientColor = (s: DataState, id: ID | 'internal') =>
  id === 'internal' ? 'var(--color-internal)' : findClient(s, id)?.color ?? '#9a96a5';

export const clientRate = (s: DataState, c?: Client) => num(c?.rate) || num(s.workspace.defaultRate);

export function rateFor(s: DataState, t: Task): number {
  const p = findProject(s, t.projectId);
  if (!p || p.internal) return 0;
  return num(p.rate) || clientRate(s, findClient(s, p.clientId));
}
export const taskValue = (s: DataState, t: Task) => (t.minutes / 60) * rateFor(s, t);
export const sumMinutes = (tasks: Task[]) => sumBy(tasks, (t) => t.minutes);
export const expenseAmount = (e: Expense) => round2(num(e.amount) * (1 + num(e.markup) / 100));
export const projectUsedMinutes = (s: DataState, pid: ID) => sumMinutes(s.tasks.filter((t) => t.projectId === pid));

export const byDateDesc = (a: Task, b: Task) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
export const byDateAsc = (a: Task, b: Task) => -byDateDesc(a, b);

export const isLocked = (s: DataState, date?: ISODate | null) =>
  !!(s.workspace.lockedThrough && date && date.slice(0, 7) <= s.workspace.lockedThrough);

export const activeProjects = (s: DataState): Project[] =>
  s.projects.filter((p) => !p.archived && (p.internal || (p.clientId && findClient(s, p.clientId)?.active !== false)));

/* ---------- Invoices ---------- */

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  credited: number;
  balance: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'discount' | 'taxRate' | 'credits'>): InvoiceTotals {
  const subtotal = round2(sumBy(inv.lines, (l) => num(l.amount)));
  const discount = round2(num(inv.discount));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2((taxable * num(inv.taxRate)) / 100);
  const total = round2(taxable + tax);
  const credited = round2(sumBy(inv.credits ?? [], (c) => num(c.amount)));
  return { subtotal, discount, tax, total, credited, balance: round2(Math.max(0, total - credited)) };
}

export function invoiceStatus(inv: Invoice, today = todayISO()): InvoiceDisplayStatus {
  if (inv.status === 'sent' && inv.dueDate && inv.dueDate < today) return 'overdue';
  return inv.status;
}

export const isOpenInvoice = (inv: Invoice) => ['sent', 'overdue'].includes(invoiceStatus(inv));

/* ---------- Billing preview ---------- */

export const unbilledExpenses = (s: DataState, clientId: ID, month: ISOMonth) =>
  s.expenses.filter((e) => e.clientId === clientId && e.billable && e.status === 'unbilled' && e.date.slice(0, 7) <= month);

function timeLines(s: DataState, c: Client, month: ISOMonth, readyIn: Task[], itemize: boolean): InvoiceLine[] {
  const ready = readyIn.slice().sort(byDateAsc);
  const ids = ready.map((t) => t.id);
  const readyMin = sumMinutes(ready);

  if (c.billing === 'retainer') {
    const lines: InvoiceLine[] = [];
    const invs = s.invoices.filter((i) => i.clientId === c.id && i.period === month && i.status !== 'void');
    const feeBilled = invs.some((i) => i.lines.some((l) => l.kind === 'retainer'));
    const overBilled = sumBy(invs, (i) => sumBy(i.lines.filter((l) => l.kind === 'overage'), (l) => l.minutes || 0));
    const invoicedMin = sumMinutes(
      s.tasks.filter((t) => clientIdOf(s, t) === c.id && t.date.slice(0, 7) === month && t.status === 'invoiced'),
    );
    const incl = num(c.includedHours) * 60;
    const overMin = Math.max(0, Math.max(0, invoicedMin + readyMin - incl) - overBilled);
    const fee = num(c.retainerFee);
    if (!feeBilled) {
      lines.push({
        kind: 'retainer',
        desc: `Monthly retainer · ${monthLabel(month)}`,
        detail: `Includes ${fmtH(incl)} h · ${fmtH(Math.min(incl, invoicedMin + readyMin))} used`,
        minutes: Math.min(incl, readyMin + invoicedMin),
        rate: fee,
        amount: round2(fee),
        taskIds: overMin > 0 ? [] : ids,
      });
    }
    if (overMin > 0) {
      const rate = clientRate(s, c);
      lines.push({
        kind: 'overage',
        desc: 'Hours beyond the retainer',
        detail: `${fmtH(overMin)} over the included ${fmtH(incl)}`,
        minutes: overMin,
        rate,
        amount: round2((overMin / 60) * rate),
        taskIds: ids,
      });
    } else if (feeBilled && ids.length) {
      lines.push({
        kind: 'covered',
        desc: 'Additional work covered by the retainer',
        detail: `${ids.length} task${ids.length > 1 ? 's' : ''}`,
        minutes: readyMin,
        rate: 0,
        amount: 0,
        taskIds: ids,
      });
    }
    return lines;
  }

  if (itemize) {
    return ready.map((t) => ({
      kind: 'hours' as const,
      desc: t.memo,
      detail: `${fmtDate(t.date)} · ${findProject(s, t.projectId)?.name ?? ''}`,
      minutes: t.minutes,
      rate: rateFor(s, t),
      amount: round2(taskValue(s, t)),
      taskIds: [t.id],
    }));
  }

  const groups = new Map<ID, Task[]>();
  for (const t of ready) groups.set(t.projectId, [...(groups.get(t.projectId) ?? []), t]);
  return [...groups.entries()].map(([pid, ts]) => {
    const min = sumMinutes(ts);
    const rate = rateFor(s, ts[0]!);
    return {
      kind: 'hours' as const,
      desc: findProject(s, pid)?.name ?? 'Project',
      detail: `${ts.length} task${ts.length > 1 ? 's' : ''} · ${monthLabel(month)}`,
      minutes: min,
      rate,
      amount: round2((min / 60) * rate),
      taskIds: ts.map((t) => t.id),
    };
  });
}

export function buildInvoiceLines(s: DataState, c: Client, month: ISOMonth, ready: Task[], itemize = false): InvoiceLine[] {
  const expenseLines: InvoiceLine[] = unbilledExpenses(s, c.id, month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      kind: 'expense',
      desc: e.desc,
      detail: `Expense · ${fmtDate(e.date)}${num(e.markup) ? ` · includes ${num(e.markup)}% handling` : ''}`,
      minutes: 0,
      rate: 0,
      amount: expenseAmount(e),
      taskIds: [],
      expenseIds: [e.id],
    }));
  return [...timeLines(s, c, month, ready, itemize), ...expenseLines];
}

export interface ClientBilling {
  tasks: Task[];
  review: number;
  billable: number;
  waived: number;
  invoiced: number;
  reviewCount: number;
  waivedValue: number;
  ready: Task[];
  lines: InvoiceLine[];
  amount: number;
  invoices: Invoice[];
  expenses: Expense[];
  byProject: Record<ID, { review: number; billable: number; waived: number; invoiced: number }>;
}

export function clientBilling(s: DataState, c: Client, month: ISOMonth): ClientBilling {
  const tasks = s.tasks.filter((t) => t.date.slice(0, 7) === month && clientIdOf(s, t) === c.id);
  const mins = (st: Task['status']) => sumMinutes(tasks.filter((t) => t.status === st));
  const ready = tasks.filter((t) => t.status === 'billable');
  const lines = buildInvoiceLines(s, c, month, ready);
  const byProject: ClientBilling['byProject'] = {};
  for (const t of tasks) {
    const row = (byProject[t.projectId] ??= { review: 0, billable: 0, waived: 0, invoiced: 0 });
    if (t.status in row) row[t.status as keyof typeof row] += t.minutes;
  }
  return {
    tasks,
    review: mins('review'),
    billable: mins('billable'),
    waived: mins('waived'),
    invoiced: mins('invoiced'),
    reviewCount: tasks.filter((t) => t.status === 'review').length,
    waivedValue: sumBy(tasks.filter((t) => t.status === 'waived'), (t) => taskValue(s, t)),
    ready,
    lines,
    amount: round2(sumBy(lines, (l) => l.amount)),
    invoices: s.invoices.filter((i) => i.clientId === c.id && i.period === month && i.status !== 'void'),
    expenses: unbilledExpenses(s, c.id, month),
    byProject,
  };
}

export const nextInvoiceSeq = (s: DataState) => s.invoices.reduce((a, i) => Math.max(a, i.seq || 0), 0) + 1;
