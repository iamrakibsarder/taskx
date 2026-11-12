import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import data, { dataActions } from '@/store/dataSlice';
import ui from '@/store/uiSlice';
import { markUnpaid, recordPayment, removePayment } from '@/store/operations';
import { entryFor } from '@/store/activity';
import { defaultWorkspace } from '@/data/sample';
import { invoiceTotals } from './billing';
import type { DataState, Invoice } from '@/types/domain';

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', seq: 1, number: 'INV-0001', clientId: 'c1', client: { name: 'Northwind', contact: '', email: '', address: '' },
  period: '2026-10', issueDate: '2026-11-01', dueDate: '2026-11-15', currency: 'USD',
  lines: [{ kind: 'hours', desc: 'Work', detail: '', minutes: 120, rate: 50, amount: 100, taskIds: [] }],
  discount: 0, taxRate: 10, taxLabel: 'Tax', notes: '', status: 'sent', createdAt: 1, ...over,
});

const storeWith = (invoice: Invoice) => {
  const s = configureStore({ reducer: { data, ui } });
  const state: DataState = { workspace: defaultWorkspace(), clients: [], projects: [], tasks: [], invoices: [invoice], expenses: [] };
  s.dispatch(dataActions.loaded(state));
  return s;
};

describe('invoice payments', () => {
  it('payments and credits both reduce the balance', () => {
    const t = invoiceTotals(
      inv({
        payments: [{ id: 'p1', date: '2026-11-03', amount: 40, method: 'Card', note: '' }],
        credits: [{ id: 'c1', number: 'CN-0001', date: '2026-11-02', amount: 10, reason: '' }],
      }),
    );
    expect(t.total).toBe(110);
    expect(t.paid).toBe(40);
    expect(t.credited).toBe(10);
    expect(t.balance).toBe(60);
  });

  it('a partial payment keeps the invoice open; paying the rest marks it paid', () => {
    const s = storeWith(inv());
    expect(s.dispatch(recordPayment('i1', { amount: 50, date: '2026-11-04', method: 'Bank transfer', note: 'ref 1' }))).toBe(true);
    let i = s.getState().data.invoices[0]!;
    expect(i.status).toBe('sent');
    expect(invoiceTotals(i).balance).toBe(60);

    expect(s.dispatch(recordPayment('i1', { amount: 61, date: '2026-11-05', method: 'Card', note: '' }))).toBe(false);
    expect(s.dispatch(recordPayment('i1', { amount: 60, date: '2026-11-06', method: 'Card', note: '' }))).toBe(true);
    i = s.getState().data.invoices[0]!;
    expect(i.status).toBe('paid');
    expect(i.paidAt).toBe('2026-11-06');
    expect(i.payments).toHaveLength(2);

    s.dispatch(removePayment('i1', i.payments![1]!.id));
    i = s.getState().data.invoices[0]!;
    expect(i.status).toBe('sent');
    expect(i.paidAt).toBeNull();

    s.dispatch(markUnpaid('i1'));
    expect(s.getState().data.invoices[0]!.payments).toEqual([]);
  });

  it('drafts and void invoices take no payments', () => {
    expect(storeWith(inv({ status: 'draft' })).dispatch(recordPayment('i1', { amount: 5, date: '2026-11-04', method: '', note: '' }))).toBe(false);
    expect(storeWith(inv({ status: 'void' })).dispatch(recordPayment('i1', { amount: 5, date: '2026-11-04', method: '', note: '' }))).toBe(false);
  });
});

describe('local activity log', () => {
  const base: DataState = { workspace: defaultWorkspace(), clients: [], projects: [], tasks: [], invoices: [], expenses: [] };
  const task = { id: 't1', date: '2026-11-03', projectId: 'p', memo: 'Homepage', link: '', minutes: 90, status: 'review' as const, by: '', invoiceId: null, createdAt: 1 };

  it('describes creates, status changes and deletes', () => {
    const withTask = { ...base, tasks: [task] };
    const create = entryFor(base, withTask, { type: 'data/upsert', payload: { col: 'tasks', item: task } }, 'Alex');
    expect(create).toMatchObject({ action: 'create', entity: 'task', actor: 'Alex', summary: 'Homepage (1:30, 2026-11-03)' });

    const approved = { ...withTask, tasks: [{ ...task, status: 'billable' as const }] };
    const update = entryFor(withTask, approved, { type: 'data/patch', payload: { col: 'tasks', id: 't1' } }, '');
    expect(update?.summary).toContain('review → billable');

    const del = entryFor(withTask, base, { type: 'data/remove', payload: { col: 'tasks', id: 't1' } }, '');
    expect(del).toMatchObject({ action: 'delete', entityId: 't1' });
    expect(entryFor(base, base, { type: 'data/remove', payload: { col: 'tasks', id: 'ghost' } }, '')).toBeNull();
  });
});
