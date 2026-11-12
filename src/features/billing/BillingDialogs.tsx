import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, Expense, ID } from '@/types/domain';
import { Dialog } from '@/components/ui/Modal';
import { Field, Segmented } from '@/components/ui';
import { useAppDispatch, useData } from '@/store';
import { createInvoice, saveExpense } from '@/store/operations';
import { buildInvoiceLines, clientIdOf, expenseAmount } from '@/domain/billing';
import { addDays, money, monthLabel, num, todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';
import { uid, sumBy } from '@/lib/utils';

export function CreateInvoiceDialog({ client: c, month, onClose }: { client: Client; month: string; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const nav = useNavigate();
  const today = todayISO();
  const [issue, setIssue] = useState(today);
  const [due, setDue] = useState(addDays(issue, num(s.workspace.termsDays) || 14));
  const [itemize, setItemize] = useState<'project' | 'task'>('project');
  const ready = s.tasks.filter((t) => t.date.startsWith(month) && clientIdOf(s, t) === c.id && t.status === 'billable');
  const lines = buildInvoiceLines(s, c, month, ready, itemize === 'task');
  const total = sumBy(lines, (l) => l.amount);
  const create = () => {
    const inv = dispatch(createInvoice(c.id, month, { issue, due, itemize: itemize === 'task' }));
    if (inv) {
      onClose();
      nav(`/invoices/${inv.id}`);
    }
  };
  return (
    <Dialog
      title={`Invoice ${c.name}`}
      onClose={onClose}
      onSubmit={create}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!lines.length}>Create draft · {money(total, s.workspace.currency)}</button>
        </>
      }
    >
      <p className="text-[13.5px] text-muted">
        {monthLabel(month)} · {ready.length} approved task{ready.length === 1 ? '' : 's'}. Tasks still in review stay out until you approve them.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issue date">
          <input
            type="date"
            className="input"
            value={issue}
            onChange={(e) => {
              setIssue(e.target.value);
              setDue(addDays(e.target.value, num(s.workspace.termsDays) || 14));
            }}
          />
        </Field>
        <Field label="Due date">
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {c.billing === 'hourly' && (
        <div className="flex items-center justify-between gap-3">
          <span className="label">Lines</span>
          <Segmented<'project' | 'task'>
            label="Lines"
            value={itemize}
            onChange={setItemize}
            options={[{ value: 'project', label: 'One per project' }, { value: 'task', label: 'One per task' }]}
          />
        </div>
      )}
      <div className="max-h-[240px] overflow-y-auto rounded-lg border border-line">
        <table className="table">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <div className="font-medium">{l.desc}</div>
                  <div className="text-[12px] text-faint">{l.detail}</div>
                </td>
                <td className="n">{money(l.amount, s.workspace.currency)}</td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td className="py-6 text-center text-faint">Nothing approved for {monthLabel(month)} yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function ExpenseDialog({ expense, clientId, onClose }: { expense?: Expense; clientId?: ID; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [f, setF] = useState<Expense>(
    expense ?? {
      id: uid(), date: todayISO(), clientId: clientId ?? s.clients.find((c) => c.active)?.id ?? null, desc: '', amount: 0, markup: 0,
      billable: true, status: 'unbilled', invoiceId: null,
    },
  );
  const set = (p: Partial<Expense>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.desc.trim()) return toast.error('Describe the expense.');
    if (!(num(f.amount) > 0)) return toast.error('Enter an amount.');
    dispatch(saveExpense({ ...f, desc: f.desc.trim(), amount: num(f.amount), markup: num(f.markup), billable: f.billable && !!f.clientId }));
    toast(expense ? 'Expense updated' : 'Expense added');
    onClose();
  };
  return (
    <Dialog
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </>
      }
    >
      <Field label="What was it?">
        <input className="input" value={f.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="Stock photos, hosting, travel…" data-autofocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input type="number" min="0" step="0.01" className="input num" value={f.amount || ''} onChange={(e) => set({ amount: +e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <select className="input" value={f.clientId ?? ''} onChange={(e) => set({ clientId: e.target.value || null })}>
            <option value="">No client (own cost)</option>
            {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Markup %">
          <input type="number" min="0" step="1" className="input num" value={f.markup || ''} onChange={(e) => set({ markup: +e.target.value })} placeholder="0" />
        </Field>
      </div>
      {f.clientId && (
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" className="size-4" checked={f.billable} onChange={(e) => set({ billable: e.target.checked })} />
          Bill to client on the next invoice
          {f.billable && num(f.amount) > 0 && <span className="num ml-auto text-muted">{money(expenseAmount(f), s.workspace.currency)}</span>}
        </label>
      )}
    </Dialog>
  );
}
