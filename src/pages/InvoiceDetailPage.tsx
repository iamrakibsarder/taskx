import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CreditCard, Download, Ellipsis, FileText, Pencil, Plus, Send, TicketMinus, Trash2, Undo2, X } from 'lucide-react';
import type { Invoice, InvoiceLine } from '@/types/domain';
import { Card, Empty, Field, Menu, Pill, type MenuItem } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { useAppDispatch, useData } from '@/store';
import { patch } from '@/store/dataSlice';
import { voidInvoice } from '@/store/operations';
import { CreditDialog, PaymentDialog, SendDialog, saveInvoiceHtml } from '@/features/invoices/InvoiceDialogs';
import { clientIdOf, invoiceStatus, invoiceTotals, sumMinutes } from '@/domain/billing';
import { invoiceTimesheetCsv } from '@/domain/invoiceExport';
import { fmtH, longDate, money, monthLabel, num, round2 } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, downloadFile } from '@/lib/utils';

function Paper({ inv }: { inv: Invoice }) {
  const s = useData();
  const t = invoiceTotals(inv);
  const from = inv.from ?? {
    businessName: s.workspace.businessName, ownerName: s.workspace.ownerName, email: s.workspace.email, address: s.workspace.address, paymentInfo: s.workspace.paymentInfo,
  };
  const m = (n: number) => money(n, inv.currency);
  const st = invoiceStatus(inv);
  return (
    <article className="card relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'var(--brand-gradient)' }} />
      {st === 'void' && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[96px] font-bold text-danger/10 -rotate-12">VOID</div>}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-[18px] font-semibold">{from.businessName || 'Your business'}</div>
          <div className="mt-1 text-[12.5px] whitespace-pre-line text-muted">{[from.ownerName, from.email, from.address].filter(Boolean).join('\n')}</div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-medium tracking-[0.12em] text-faint uppercase">Invoice</div>
          <div className="num text-[22px] font-medium">{inv.number}</div>
          <div className="mt-1 text-[12.5px] text-muted">Issued {longDate(inv.issueDate)}</div>
          <div className={cn('text-[12.5px]', st === 'overdue' ? 'font-medium text-danger' : 'text-muted')}>Due {longDate(inv.dueDate)}</div>
        </div>
      </header>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-[11.5px] font-medium tracking-wide text-faint uppercase">Bill to</div>
          <div className="mt-1 font-medium">{inv.client.name}</div>
          <div className="text-[12.5px] whitespace-pre-line text-muted">{[inv.client.contact, inv.client.email, inv.client.address].filter(Boolean).join('\n')}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-[11.5px] font-medium tracking-wide text-faint uppercase">Period</div>
          <div className="mt-1 font-medium">{monthLabel(inv.period)}</div>
        </div>
      </div>
      <div className="mt-8 overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th className="pl-0">Description</th><th className="n">Hours</th><th className="n">Rate</th><th className="n pr-0">Amount</th></tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td className="pl-0">
                  <div className="font-medium">{l.desc}</div>
                  {l.detail && <div className="text-[12px] text-faint">{l.detail}</div>}
                </td>
                <td className="n">{l.minutes && l.kind !== 'retainer' ? fmtH(l.minutes) : ''}</td>
                <td className="n">{l.rate && l.kind !== 'retainer' ? m(l.rate) : ''}</td>
                <td className="n pr-0">{m(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 ml-auto flex w-full max-w-[300px] flex-col gap-1.5 text-[13.5px]">
        <Row label="Subtotal" v={m(t.subtotal)} />
        {t.discount > 0 && <Row label="Discount" v={`−${m(t.discount)}`} />}
        {t.tax > 0 && <Row label={`${inv.taxLabel} ${num(inv.taxRate)}%`} v={m(t.tax)} />}
        <div className="my-1 h-px bg-line" />
        <Row label="Total" v={m(t.total)} strong />
        {(inv.credits ?? []).map((c) => <Row key={c.id} label={`Credit ${c.number}`} v={`−${m(c.amount)}`} />)}
        {t.credited > 0 && <Row label="Balance due" v={m(t.balance)} strong />}
      </div>
      {(inv.notes || from.paymentInfo) && (
        <div className="mt-10 grid gap-6 border-t border-line pt-6 text-[12.5px] text-muted sm:grid-cols-2">
          {from.paymentInfo && <div><div className="mb-1 font-medium text-ink">How to pay</div><div className="whitespace-pre-line">{from.paymentInfo}</div></div>}
          {inv.notes && <div><div className="mb-1 font-medium text-ink">Notes</div><div className="whitespace-pre-line">{inv.notes}</div></div>}
        </div>
      )}
    </article>
  );
}

const Row = ({ label, v, strong }: { label: string; v: string; strong?: boolean }) => (
  <div className={cn('flex justify-between gap-4', strong ? 'text-[15px] font-semibold' : 'text-muted')}>
    <span>{label}</span>
    <span className="num">{v}</span>
  </div>
);

function DraftEditor({ inv, onDone }: { inv: Invoice; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [f, setF] = useState(() => ({ ...inv, lines: inv.lines.map((l) => ({ ...l })) }));
  const set = (p: Partial<Invoice>) => setF((x) => ({ ...x, ...p }));
  const setLine = (i: number, p: Partial<InvoiceLine>) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const t = invoiceTotals(f);
  const save = () => {
    dispatch(
      patch('invoices', inv.id, {
        issueDate: f.issueDate, dueDate: f.dueDate, discount: num(f.discount), taxRate: num(f.taxRate), taxLabel: f.taxLabel, notes: f.notes,
        lines: f.lines.map((l) => ({ ...l, amount: round2(num(l.amount)) })),
      }),
    );
    toast('Draft saved');
    onDone();
  };
  return (
    <Card title="Edit draft" actions={<button type="button" className="btn-icon" onClick={onDone} aria-label="Close editor"><X /></button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issue date"><input type="date" className="input" value={f.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></Field>
          <Field label="Due date"><input type="date" className="input" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">Lines</span>
          {f.lines.map((l, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-2">
              <div className="flex gap-1.5">
                <input className="input input-soft bg-surface" value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} aria-label="Description" />
                <input type="number" step="0.01" className="input input-soft num w-28 bg-surface text-right" value={l.amount} onChange={(e) => setLine(i, { amount: +e.target.value })} aria-label="Amount" />
                {l.kind === 'custom' && (
                  <button type="button" className="btn-icon h-9 flex-none" onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })} aria-label="Remove line"><Trash2 /></button>
                )}
              </div>
              <input className="input input-soft h-8 bg-surface text-[12.5px]" value={l.detail} onChange={(e) => setLine(i, { detail: e.target.value })} placeholder="Detail" aria-label="Detail" />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm self-start"
            onClick={() => set({ lines: [...f.lines, { kind: 'custom', desc: 'Extra item', detail: '', minutes: 0, rate: 0, amount: 0, taskIds: [] }] })}
          >
            <Plus /> Add line
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Discount"><input type="number" min="0" step="0.01" className="input num" value={f.discount || ''} onChange={(e) => set({ discount: +e.target.value })} placeholder="0" /></Field>
          <Field label="Tax label"><input className="input" value={f.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} /></Field>
          <Field label="Tax %"><input type="number" min="0" step="0.1" className="input num" value={f.taxRate || ''} onChange={(e) => set({ taxRate: +e.target.value })} placeholder="0" /></Field>
        </div>
        <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-[13px] text-muted">Total <span className="num ml-1 text-[15px] font-semibold text-ink">{money(t.total, inv.currency)}</span></span>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onDone}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}>Save draft</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const s = useData();
  const nav = useNavigate();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const [editing, setEditing] = useState(false);
  const inv = s.invoices.find((i) => i.id === id);
  if (!inv)
    return (
      <div className="card">
        <Empty title="Invoice not found"><Link to="/invoices" className="btn mt-2"><ArrowLeft /> All invoices</Link></Empty>
      </div>
    );

  const st = invoiceStatus(inv);
  const t = invoiceTotals(inv);
  const tasks = s.tasks.filter((x) => x.invoiceId === inv.id);
  const waived = s.tasks.filter((x) => x.status === 'waived' && clientIdOf(s, x) === inv.clientId && x.date.startsWith(inv.period));
  const open = (node: (c: () => void) => ReactNode) => modal.open(node);

  const more: MenuItem[] = [
    { label: 'Download invoice', icon: <Download />, onSelect: () => saveInvoiceHtml(s, inv) },
    { label: 'Download timesheet CSV', icon: <FileText />, onSelect: () => downloadFile(`${inv.number} timesheet.csv`, invoiceTimesheetCsv(s, inv), 'text/csv') },
  ];
  if (st !== 'draft' && st !== 'void') more.push({ label: 'Resend', icon: <Send />, onSelect: () => open((c) => <SendDialog inv={inv} onClose={c} />) });
  if ((st === 'sent' || st === 'overdue' || st === 'paid') && t.balance > 0)
    more.push({ label: 'Credit note', icon: <TicketMinus />, onSelect: () => open((c) => <CreditDialog inv={inv} onClose={c} />) });
  if (st === 'paid') more.push({ label: 'Mark unpaid', icon: <Undo2 />, onSelect: () => (dispatch(patch('invoices', inv.id, { status: 'sent', paidAt: null, paidNote: null })), toast('Marked unpaid')) });
  if (st !== 'void')
    more.push({
      label: st === 'draft' ? 'Delete draft' : 'Void invoice', icon: st === 'draft' ? <Trash2 /> : <Ban />, danger: true,
      onSelect: () =>
        open((c) => (
          <Confirm
            title={st === 'draft' ? 'Delete this draft?' : `Void ${inv.number}?`}
            body={`Its ${tasks.length} task${tasks.length === 1 ? '' : 's'} go back to approved so you can invoice them again.${st === 'draft' ? '' : ' The invoice stays on record as void.'}`}
            confirm={st === 'draft' ? 'Delete' : 'Void'}
            danger
            onClose={c}
            onConfirm={() => dispatch(voidInvoice(inv.id)) === 'deleted' && nav('/invoices')}
          />
        )),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/invoices" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft /> Invoices</Link>
        <h1 className="text-[26px] font-semibold tracking-tight">{inv.number}</h1>
        <Pill status={st} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {st === 'draft' && !editing && <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil /> Edit</button>}
          {st === 'draft' && <button type="button" className="btn btn-primary" onClick={() => open((c) => <SendDialog inv={inv} onClose={c} />)}><Send /> Send</button>}
          {(st === 'sent' || st === 'overdue') && (
            <button type="button" className="btn btn-primary" onClick={() => open((c) => <PaymentDialog inv={inv} onClose={c} />)}><CreditCard /> Record payment</button>
          )}
          <Menu items={more} trigger={(o, tg) => <button type="button" className={cn('btn w-9 px-0', o && 'bg-surface-2')} onClick={tg} aria-label="More"><Ellipsis /></button>} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">{editing && st === 'draft' ? <DraftEditor inv={inv} onDone={() => setEditing(false)} /> : <Paper inv={inv} />}</div>
        <aside className="flex flex-col gap-4">
          <Card>
            <div className="text-[12.5px] text-muted">{st === 'paid' ? 'Paid' : t.credited ? 'Balance due' : 'Amount due'}</div>
            <div className={cn('num text-[28px] font-medium', st === 'overdue' && 'text-danger')}>{money(st === 'paid' ? t.total : t.balance, inv.currency)}</div>
            <dl className="mt-4 flex flex-col gap-2 text-[13px]">
              <Meta k="Client" v={<Link className="hover:text-brand-700" to={`/tasks?client=${inv.clientId}`}>{inv.client.name}</Link>} />
              <Meta k="Sent" v={inv.sentAt ? longDate(inv.sentAt) : '—'} />
              <Meta k="Paid" v={inv.paidAt ? longDate(inv.paidAt) : '—'} />
              {inv.paidNote && <Meta k="Note" v={inv.paidNote} />}
            </dl>
          </Card>
          <Card title="Work on this invoice">
            <div className="flex flex-col gap-2 text-[13px]">
              <Meta k="Tasks" v={`${tasks.length} · ${fmtH(sumMinutes(tasks))}`} />
              {waived.length > 0 && <Meta k="Waived" v={`${waived.length} · ${fmtH(sumMinutes(waived))}`} />}
              <button type="button" className="mt-1 self-start text-[13px] font-medium text-brand-700 hover:underline" onClick={() => downloadFile(`${inv.number} timesheet.csv`, invoiceTimesheetCsv(s, inv), 'text/csv')}>
                Timesheet CSV
              </button>
            </div>
          </Card>
          {(inv.credits?.length ?? 0) > 0 && (
            <Card title="Credit notes">
              <div className="flex flex-col gap-2 text-[13px]">
                {inv.credits!.map((c) => (
                  <div key={c.id} className="flex justify-between gap-3">
                    <span><span className="font-medium">{c.number}</span> <span className="text-faint">{c.reason}</span></span>
                    <span className="num">−{money(c.amount, inv.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

const Meta = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-faint">{k}</dt>
    <dd className="truncate text-right">{v}</dd>
  </div>
);
