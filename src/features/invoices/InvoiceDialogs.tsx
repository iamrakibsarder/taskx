import { useState } from 'react';
import { Copy, Download, Mail } from 'lucide-react';
import type { Invoice } from '@/types/domain';
import { Dialog } from '@/components/ui/Modal';
import { Field } from '@/components/ui';
import { useAppDispatch, useData } from '@/store';
import { patch } from '@/store/dataSlice';
import { addCreditNote, markSent } from '@/store/operations';
import { invoiceTotals } from '@/domain/billing';
import { invoiceEmail, invoiceHtml } from '@/domain/invoiceExport';
import { money, num, todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';

export const saveInvoiceHtml = (s: ReturnType<typeof useData>, inv: Invoice) =>
  downloadFile(`${inv.number} ${inv.client.name}.html`, invoiceHtml(s, inv), 'text/html');

/**
 * Sending happens from the user's own mail app for now (mailto + attached HTML).
 * When the Rust API is connected, this becomes a real "send" with the PDF attached.
 */
export function SendDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const draft = invoiceEmail(s, inv);
  const [to, setTo] = useState(inv.client.email);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const resend = inv.status !== 'draft';
  return (
    <Dialog
      wide
      title={resend ? `Resend ${inv.number}` : `Send ${inv.number}`}
      onClose={onClose}
      onSubmit={() => {
        if (!to.trim()) return toast.error('Add the client’s email.');
        dispatch(markSent(inv.id, to.trim()));
        onClose();
      }}
      footer={
        <>
          <button type="button" className="btn mr-auto" onClick={() => (navigator.clipboard?.writeText(`${subject}\n\n${body}`), toast('Email copied'))}>
            <Copy /> Copy
          </button>
          <button type="button" className="btn" onClick={() => saveInvoiceHtml(s, inv)}><Download /> Invoice file</button>
          <a className="btn" href={mailto} onClick={() => saveInvoiceHtml(s, inv)}><Mail /> Open in mail</a>
          <button type="submit" className="btn btn-primary">{resend ? 'Mark resent' : 'Mark as sent'}</button>
        </>
      }
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
        Open it in your mail app, attach the invoice file, send, then mark it as sent here.
      </p>
      <Field label="To">
        <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" />
      </Field>
      <Field label="Subject">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message">
        <textarea className="input text-[13.5px]" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export function PaymentDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const t = invoiceTotals(inv);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  return (
    <Dialog
      title="Record payment"
      onClose={onClose}
      onSubmit={() => {
        dispatch(patch('invoices', inv.id, { status: 'paid', paidAt: date, paidNote: note.trim() || null }));
        toast(`${inv.number} paid`);
        onClose();
      }}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Mark paid · {money(t.balance, inv.currency)}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid on">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank transfer, ref…" />
        </Field>
      </div>
    </Dialog>
  );
}

export function CreditDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const t = invoiceTotals(inv);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayISO());
  return (
    <Dialog
      title="Credit note"
      onClose={onClose}
      onSubmit={() => {
        dispatch(addCreditNote(inv.id, num(amount), date, reason));
        onClose();
      }}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-dark">Issue credit</button>
        </>
      }
    >
      <p className="text-[13.5px] text-muted">Reduces what the client owes on {inv.number}. Balance now {money(t.balance, inv.currency)}.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input type="number" min="0" step="0.01" max={t.balance} className="input num" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Discount agreed after delivery" />
      </Field>
    </Dialog>
  );
}
