import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from './index';
import { dataActions, patch, remove, upsert } from './dataSlice';
import type { Client, CreditNote, DataState, Expense, ID, Invoice, ISODate, ISOMonth, Project, Task, TaskStatus } from '@/types/domain';
import { addDays, fmtH, monthLabel, num, round2, snap15, todayISO } from '@/lib/format';
import { uid } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  buildInvoiceLines, byDateAsc, clientIdOf, findClient, findProject, invoiceTotals, isLocked, nextInvoiceSeq, sumMinutes,
} from '@/domain/billing';

type Thunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
const D = (getState: () => RootState): DataState => getState().data;

/** Blocks changes to locked months, with a toast. */
function lockGuard(s: DataState, ...dates: Array<ISODate | undefined>): boolean {
  if (dates.some((d) => isLocked(s, d))) {
    toast.error(`${monthLabel(s.workspace.lockedThrough)} and earlier are locked. Unlock in Settings.`);
    return false;
  }
  return true;
}

const statusForNew = (s: DataState, projectId: ID): TaskStatus =>
  findProject(s, projectId)?.internal ? 'internal' : s.workspace.autoApprove ? 'billable' : 'review';

/* ---------------- Tasks ---------------- */

export interface TaskInput {
  date: ISODate;
  projectId: ID;
  memo: string;
  minutes: number;
  link?: string;
  by?: string;
}

export function validateTask(i: Partial<TaskInput>): string | null {
  if (!i.projectId) return 'Choose a project.';
  if (!i.memo?.trim()) return 'Describe what you did.';
  if (!i.minutes) return 'Set the time.';
  return null;
}

export const createTask =
  (i: TaskInput): Thunk<Task | null> =>
  (dispatch, getState) => {
    const s = D(getState);
    if (!lockGuard(s, i.date)) return null;
    const t: Task = {
      id: uid(),
      date: i.date || todayISO(),
      projectId: i.projectId,
      memo: i.memo.trim(),
      link: (i.link ?? '').trim(),
      minutes: snap15(i.minutes, s.workspace.rounding),
      status: statusForNew(s, i.projectId),
      by: i.by || s.workspace.ownerName || '',
      invoiceId: null,
      createdAt: Date.now(),
    };
    dispatch(upsert('tasks', t));
    return t;
  };

export const createTasks =
  (rows: TaskInput[]): Thunk<number> =>
  (dispatch, getState) => {
    if (!lockGuard(D(getState), ...rows.map((r) => r.date))) return 0;
    rows.forEach((r) => dispatch(createTask(r)));
    return rows.length;
  };

export const updateTask =
  (id: ID, i: TaskInput): Thunk<boolean> =>
  (dispatch, getState) => {
    const s = D(getState);
    const t = s.tasks.find((x) => x.id === id);
    if (!t || !lockGuard(s, t.date, i.date)) return false;
    const fields: Partial<Task> = {
      date: i.date, projectId: i.projectId, memo: i.memo.trim(), link: (i.link ?? '').trim(),
      minutes: snap15(i.minutes, s.workspace.rounding),
    };
    if (i.by !== undefined) fields.by = i.by;
    const wasInternal = t.status === 'internal';
    const nowInternal = !!findProject(s, i.projectId)?.internal;
    if (wasInternal !== nowInternal) fields.status = nowInternal ? 'internal' : 'review';
    dispatch(patch('tasks', id, fields));
    return true;
  };

/** Approve / back to review / restore. Allowed in locked months (no content changes). */
export const setStatus =
  (ids: ID[], to: 'billable' | 'review'): Thunk<number> =>
  (dispatch, getState) => {
    let n = 0;
    for (const id of ids) {
      const t = D(getState).tasks.find((x) => x.id === id);
      if (!t) continue;
      const ok = to === 'billable' ? t.status === 'review' : t.status === 'billable' || t.status === 'waived';
      if (ok) {
        dispatch(patch('tasks', id, { status: to, waiveReason: null }));
        n++;
      }
    }
    return n;
  };

export const waiveTasks =
  (ids: ID[], reason: string): Thunk<number> =>
  (dispatch, getState) => {
    const ts = D(getState).tasks.filter((t) => ids.includes(t.id) && (t.status === 'review' || t.status === 'billable'));
    ts.forEach((t) => dispatch(patch('tasks', t.id, { status: 'waived', waiveReason: reason || null })));
    return ts.length;
  };

export const deleteTask =
  (id: ID): Thunk<boolean> =>
  (dispatch, getState) => {
    const s = D(getState);
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status === 'invoiced' || !lockGuard(s, t.date)) return false;
    dispatch(remove('tasks', id));
    return true;
  };

export function canMerge(s: DataState, ids: ID[]): string | null {
  const ts = s.tasks.filter((t) => ids.includes(t.id));
  if (ts.length < 2) return 'Pick at least two tasks.';
  if (new Set(ts.map((t) => t.projectId)).size > 1) return 'Pick tasks from the same project.';
  if (new Set(ts.map((t) => t.status)).size > 1) return 'Pick tasks with the same status.';
  if (!['review', 'billable', 'internal'].includes(ts[0]!.status)) return 'These tasks can’t be merged.';
  return null;
}

export const mergeTasks =
  (ids: ID[], memo: string, date: ISODate): Thunk<boolean> =>
  (dispatch, getState) => {
    const s = D(getState);
    const ts = s.tasks.filter((t) => ids.includes(t.id)).sort(byDateAsc);
    if (canMerge(s, ids) || !lockGuard(s, date, ...ts.map((t) => t.date))) return false;
    const merged: Task = {
      id: uid(), date, projectId: ts[0]!.projectId, memo: memo.trim(), link: ts.find((t) => t.link)?.link ?? '',
      minutes: sumMinutes(ts), status: ts[0]!.status, by: ts[0]!.by, invoiceId: null, createdAt: Date.now(), mergedFrom: ts,
    };
    dispatch(upsert('tasks', merged));
    ts.forEach((t) => dispatch(remove('tasks', t.id)));
    return true;
  };

export const unmergeTask =
  (id: ID): Thunk =>
  (dispatch, getState) => {
    const s = D(getState);
    const t = s.tasks.find((x) => x.id === id);
    if (!t?.mergedFrom || !lockGuard(s, t.date)) return;
    t.mergedFrom.forEach((o) => dispatch(upsert('tasks', { ...o, projectId: t.projectId, status: t.status, invoiceId: null })));
    dispatch(remove('tasks', id));
    toast(`Split back into ${t.mergedFrom.length} tasks`);
  };

export const duplicateToday =
  (id: ID): Thunk =>
  (dispatch, getState) => {
    const t = D(getState).tasks.find((x) => x.id === id);
    if (!t) return;
    const n = dispatch(createTask({ date: todayISO(), projectId: t.projectId, memo: t.memo, link: t.link, minutes: t.minutes, by: t.by }));
    if (n) toast(`Logged ${fmtH(n.minutes)} again today`);
  };

/** Board drag. Returns `'waive'` when the caller should ask for a reason first. */
export const moveTask =
  (id: ID, to: TaskStatus): Thunk<'ok' | 'waive' | 'blocked'> =>
  (dispatch, getState) => {
    const s = D(getState);
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status === to) return 'blocked';
    if (t.status === 'invoiced') return toast.error('Invoiced tasks are locked. Void the invoice to change them.'), 'blocked';
    if (to === 'invoiced') return toast.error('Create invoices from Billing.'), 'blocked';
    const internal = !!findProject(s, t.projectId)?.internal;
    if ((to === 'internal') !== internal) {
      toast.error(internal ? 'Internal tasks stay internal. Change the project to bill it.' : 'Move it to an internal project instead.');
      return 'blocked';
    }
    if (to === 'waived') return 'waive';
    dispatch(patch('tasks', id, { status: to, waiveReason: null }));
    return 'ok';
  };

export const copyWeek =
  (fromStart: ISODate, toStart: ISODate): Thunk<number> =>
  (dispatch, getState) => {
    const s = D(getState);
    const end = addDays(fromStart, 7);
    const shift = Math.round((new Date(toStart).getTime() - new Date(fromStart).getTime()) / 864e5);
    const src = s.tasks.filter((t) => t.date >= fromStart && t.date < end && !findProject(s, t.projectId)?.archived);
    if (!lockGuard(s, ...src.map((t) => addDays(t.date, shift)))) return 0;
    src.forEach((t) => dispatch(createTask({ date: addDays(t.date, shift), projectId: t.projectId, memo: t.memo, link: t.link, minutes: t.minutes, by: t.by })));
    return src.length;
  };

/* ---------------- Invoices ---------------- */

export const createInvoice =
  (clientId: ID, month: ISOMonth, opts: { issue: ISODate; due: ISODate; itemize: boolean }): Thunk<Invoice | null> =>
  (dispatch, getState) => {
    const s = D(getState);
    const c = findClient(s, clientId);
    if (!c) return null;
    const ready = s.tasks.filter((t) => t.date.slice(0, 7) === month && clientIdOf(s, t) === c.id && t.status === 'billable');
    const lines = buildInvoiceLines(s, c, month, ready, opts.itemize);
    if (!lines.length) {
      toast.error('Nothing to invoice for that month.');
      return null;
    }
    const seq = nextInvoiceSeq(s);
    const inv: Invoice = {
      id: uid(), seq, number: `${s.workspace.invoicePrefix || 'INV-'}${String(seq).padStart(4, '0')}`, clientId: c.id,
      client: { name: c.name, contact: c.contact, email: c.email, address: c.address },
      period: month, issueDate: opts.issue, dueDate: opts.due, currency: s.workspace.currency, lines,
      discount: 0, taxRate: num(s.workspace.taxRate), taxLabel: s.workspace.taxLabel || 'Tax', notes: s.workspace.invoiceNote,
      status: 'draft', createdAt: Date.now(),
    };
    dispatch(upsert('invoices', inv));
    lines.flatMap((l) => l.taskIds).forEach((id) => dispatch(patch('tasks', id, { status: 'invoiced', invoiceId: inv.id })));
    lines.flatMap((l) => l.expenseIds ?? []).forEach((id) => dispatch(patch('expenses', id, { status: 'invoiced', invoiceId: inv.id })));
    toast(`Draft ${inv.number} created`);
    return inv;
  };

export const markSent =
  (id: ID, email: string): Thunk =>
  (dispatch, getState) => {
    const s = D(getState);
    const inv = s.invoices.find((i) => i.id === id);
    if (!inv) return;
    const w = s.workspace;
    dispatch(
      patch('invoices', id, {
        status: inv.status === 'draft' ? 'sent' : inv.status,
        sentAt: todayISO(),
        from: { businessName: w.businessName, ownerName: w.ownerName, email: w.email, address: w.address, paymentInfo: w.paymentInfo },
        client: { ...inv.client, email: email || inv.client.email },
      }),
    );
    toast(`${inv.number} marked as sent`);
  };

export const addCreditNote =
  (id: ID, amount: number, date: ISODate, reason: string): Thunk =>
  (dispatch, getState) => {
    const s = D(getState);
    const inv = s.invoices.find((i) => i.id === id);
    if (!inv) return;
    const t = invoiceTotals(inv);
    const amt = round2(Math.min(t.balance, amount));
    if (!(amt > 0)) return void toast.error('Enter an amount above zero.');
    const seq = s.invoices.reduce((a, i) => a + (i.credits?.length ?? 0), 0) + 1;
    const credit: CreditNote = { id: uid(), number: `CN-${String(seq).padStart(4, '0')}`, date, amount: amt, reason: reason.trim() };
    const fields: Partial<Invoice> = { credits: [...(inv.credits ?? []), credit] };
    if (round2(t.balance - amt) <= 0 && inv.status !== 'paid') Object.assign(fields, { status: 'paid', paidAt: date, paidNote: 'Settled by credit note' });
    dispatch(patch('invoices', id, fields));
    toast(`Credit note ${credit.number} issued`);
  };

export const voidInvoice =
  (id: ID): Thunk<'deleted' | 'voided' | null> =>
  (dispatch, getState) => {
    const s = D(getState);
    const inv = s.invoices.find((i) => i.id === id);
    if (!inv) return null;
    s.tasks.filter((t) => t.invoiceId === id).forEach((t) => dispatch(patch('tasks', t.id, { status: 'billable', invoiceId: null })));
    s.expenses.filter((e) => e.invoiceId === id).forEach((e) => dispatch(patch('expenses', e.id, { status: 'unbilled', invoiceId: null })));
    if (inv.status === 'draft') {
      dispatch(remove('invoices', id));
      toast('Draft deleted');
      return 'deleted';
    }
    dispatch(patch('invoices', id, { status: 'void' }));
    toast(`${inv.number} voided`);
    return 'voided';
  };

/* ---------------- Clients, projects, expenses, workspace ---------------- */

export const saveClient = (c: Client): Thunk => (dispatch) => void dispatch(upsert('clients', c));
export const saveProject = (p: Project): Thunk => (dispatch) => void dispatch(upsert('projects', p));
export const saveExpense = (e: Expense): Thunk => (dispatch) => void dispatch(upsert('expenses', e));

export const deleteClient =
  (id: ID): Thunk<boolean> =>
  (dispatch, getState) => {
    const s = D(getState);
    if (s.tasks.some((t) => clientIdOf(s, t) === id)) return toast.error('This client has logged time. Make it inactive instead.'), false;
    s.projects.filter((p) => p.clientId === id).forEach((p) => dispatch(remove('projects', p.id)));
    dispatch(remove('clients', id));
    return true;
  };

export const deleteProject =
  (id: ID): Thunk<boolean> =>
  (dispatch, getState) => {
    if (D(getState).tasks.some((t) => t.projectId === id)) return toast.error('This project has logged time. Archive it instead.'), false;
    dispatch(remove('projects', id));
    return true;
  };

export const lockMonth =
  (m: ISOMonth): Thunk =>
  (dispatch, getState) => {
    const cur = D(getState).workspace.lockedThrough;
    if (!cur || m > cur) dispatch(dataActions.setWorkspace({ lockedThrough: m }));
    toast(`${monthLabel(m)} locked`);
  };

export const clearSampleData = (): Thunk => (dispatch, getState) => {
  const s = D(getState);
  // Sample clients/projects that your own tasks, invoices or expenses use are kept.
  const own = { tasks: s.tasks.filter((t) => !t.sample), invoices: s.invoices.filter((i) => !i.sample), expenses: s.expenses.filter((e) => !e.sample) };
  const keepProjects = new Set(own.tasks.map((t) => t.projectId));
  const keepClients = new Set([
    ...own.invoices.map((i) => i.clientId),
    ...own.expenses.map((e) => e.clientId ?? ''),
    ...s.projects.filter((p) => keepProjects.has(p.id) || !p.sample).map((p) => p.clientId ?? ''),
  ]);
  const keep = (col: 'tasks' | 'expenses' | 'invoices' | 'projects' | 'clients', id: ID) =>
    (col === 'projects' && keepProjects.has(id)) || (col === 'clients' && keepClients.has(id));
  let kept = 0;
  // Children first, so the server's links never point at something already gone.
  (['tasks', 'expenses', 'invoices', 'projects', 'clients'] as const).forEach((col) =>
    (s[col] as Array<{ id: ID; sample?: boolean }>)
      .filter((x) => x.sample)
      .forEach((x) => (keep(col, x.id) ? kept++ : dispatch(remove(col, x.id)))),
  );
  toast(kept ? `Sample data cleared. Kept ${kept} sample client/project you’ve used.` : 'Sample data cleared');
};
