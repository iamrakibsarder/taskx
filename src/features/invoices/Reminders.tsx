import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, LoaderCircle, Send } from 'lucide-react';
import type { Invoice } from '@/types/domain';
import { Card, Field } from '@/components/ui';
import { Dialog, useModal } from '@/components/ui/Modal';
import { invoiceApi, type Reminders } from '@/data/invoiceApi';
import { useAccount } from '@/data/session';
import { longDate } from '@/lib/format';
import { toast } from '@/lib/toast';

const todayUTC = () => new Date().toISOString().slice(0, 10);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const stageText = (stage: number | null) =>
  stage === null ? 'Sent by hand' : stage === 0 ? 'On the due date' : stage < 0 ? `${-stage} day${stage === -1 ? '' : 's'} before` : `${stage} day${stage === 1 ? '' : 's'} late`;

/**
 * Payment reminders for one invoice (API mode): what went out, when the next one goes, and a
 * button to send one now. Reloads when the invoice changes (a payment stops reminders).
 */
export function RemindersCard({ inv }: { inv: Invoice }) {
  const modal = useModal();
  const [r, setR] = useState<Reminders | null>(null);
  const [failed, setFailed] = useState(false);
  const paidKey = `${inv.status}:${inv.payments?.length ?? 0}:${inv.credits?.length ?? 0}`;

  const load = useCallback(() => {
    invoiceApi
      .reminders(inv.id)
      .then((x) => (setR(x), setFailed(false)))
      .catch(() => setFailed(true));
  }, [inv.id]);
  useEffect(load, [load, paidKey]);

  if (failed || !r) return null;
  if (!r.items.length && !r.owes) return null;

  const status = !r.mailEnabled
    ? 'Email isn’t set up on the server.'
    : !r.owes
      ? 'Nothing is owed, so no more reminders.'
      : !r.workspaceOn
        ? <>Automatic reminders are off. <Link to="/settings" className="font-medium text-brand-700 hover:underline">Turn on</Link></>
        : !r.clientOn
          ? 'Off for this client.'
          : r.next
            ? r.next <= todayUTC()
              ? 'The next one goes out today.'
              : `Next one ${longDate(r.next)}.`
            : 'No more scheduled.';

  return (
    <Card
      title={<><BellRing className="size-4 text-brand-600" /> Reminders</>}
      actions={
        r.owes && r.mailEnabled ? (
          <button type="button" className="btn btn-sm" onClick={() => modal.open((c) => <ReminderDialog inv={inv} draft={r.draft} onClose={c} onSent={setR} />)}>
            <Send /> Remind
          </button>
        ) : undefined
      }
    >
      <p className="text-[13px] text-muted">{status}</p>
      {r.items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 text-[13px]">
          {r.items.map((x) => (
            <li key={x.sentAt} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium">{longDate(x.sentAt.slice(0, 10))}</span>
                <span className="block truncate text-[12px] text-faint">{stageText(x.stage)} · {x.sentTo}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReminderDialog({ inv, draft, onClose, onSent }: { inv: Invoice; draft: Reminders['draft']; onClose: () => void; onSent: (r: Reminders) => void }) {
  const account = useAccount();
  const [to, setTo] = useState(draft.to || inv.client.email);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copyMe, setCopyMe] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!to.trim()) return toast.error('Add the client’s email.');
    setBusy(true);
    try {
      onSent(await invoiceApi.remind(inv.id, { to: to.trim(), subject, body, copyMe }));
      toast(`Reminder sent to ${to.trim()}`);
      onClose();
    } catch (e) {
      toast.error(message(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      wide
      title={`Remind about ${inv.number}`}
      onClose={onClose}
      onSubmit={() => void send()}
      footer={
        <button type="submit" className="btn btn-primary" disabled={busy || !to.trim()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Send />} Send reminder
        </button>
      }
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">The invoice PDF is attached again.</p>
      <Field label="To">
        <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" />
      </Field>
      <Field label="Subject">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message">
        <textarea className="input text-[13.5px]" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {account && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} className="size-4 accent-brand-600" />
          Send me a copy ({account.email})
        </label>
      )}
    </Dialog>
  );
}
