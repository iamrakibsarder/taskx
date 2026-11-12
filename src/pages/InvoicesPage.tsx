import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import type { InvoiceDisplayStatus } from '@/types/domain';
import { Dot, Empty, PageHeader, Pill, StatGrid } from '@/components/ui';
import { useData } from '@/store';
import { invoiceStatus, invoiceTotals } from '@/domain/billing';
import { fmtDate, money, moneyShort, monthLabel } from '@/lib/format';
import { cn, sumBy } from '@/lib/utils';

type Tab = 'all' | InvoiceDisplayStatus;
const TABS: Array<{ k: Tab; label: string }> = [
  { k: 'all', label: 'All' }, { k: 'draft', label: 'Draft' }, { k: 'sent', label: 'Sent' }, { k: 'overdue', label: 'Overdue' },
  { k: 'paid', label: 'Paid' }, { k: 'void', label: 'Void' },
];

export default function InvoicesPage() {
  const s = useData();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as Tab | null) ?? 'all';
  const cur = s.workspace.currency;

  const rows = useMemo(
    () => s.invoices.map((i) => ({ i, st: invoiceStatus(i), t: invoiceTotals(i) })).sort((a, b) => b.i.seq - a.i.seq),
    [s.invoices],
  );
  const shown = tab === 'all' ? rows : rows.filter((r) => r.st === tab);
  const count = (k: Tab) => (k === 'all' ? rows.length : rows.filter((r) => r.st === k).length);
  const open = rows.filter((r) => r.st === 'sent' || r.st === 'overdue');
  const overdue = rows.filter((r) => r.st === 'overdue');
  const year = new Date().getFullYear().toString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Invoices" sub="Create invoices from Billing. Track and get paid here." actions={<button type="button" className="btn" onClick={() => nav('/billing')}><Wallet /> Go to billing</button>} />
      <StatGrid
        stats={[
          { label: 'Outstanding', value: moneyShort(sumBy(open, (r) => r.t.balance), cur), hint: `${open.length} open` },
          { label: 'Overdue', value: moneyShort(sumBy(overdue, (r) => r.t.balance), cur), hint: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`, tone: overdue.length ? 'danger' : undefined },
          { label: 'Drafts', value: moneyShort(sumBy(rows.filter((r) => r.st === 'draft'), (r) => r.t.total), cur), hint: `${count('draft')} to send` },
          { label: `Paid in ${year}`, value: moneyShort(sumBy(rows.filter((r) => r.st === 'paid' && (r.i.paidAt ?? '').startsWith(year)), (r) => r.t.total), cur) },
        ]}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => setParams(k === 'all' ? {} : { status: k }, { replace: true })}
            className={cn(
              '-mb-px flex flex-none items-center gap-1.5 border-b-2 border-transparent px-3 pb-2.5 text-[13.5px] font-medium text-muted hover:text-ink',
              tab === k && 'border-brand-600 text-ink',
            )}
          >
            {label} <span className="num text-[11.5px] text-faint">{count(k)}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="card overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th className="pl-5">Invoice</th>
                <th>Client</th>
                <th>Period</th>
                <th>Due</th>
                <th>Status</th>
                <th className="n pr-5">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ i, st, t }) => {
                const c = s.clients.find((x) => x.id === i.clientId);
                return (
                  <tr key={i.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => nav(`/invoices/${i.id}`)}>
                    <td className="pl-5 font-medium">{i.number}</td>
                    <td><span className="flex items-center gap-2"><Dot color={c?.color ?? '#9a96a5'} /> {i.client.name}</span></td>
                    <td className="text-muted">{monthLabel(i.period)}</td>
                    <td className={cn('text-muted', st === 'overdue' && 'text-danger')}>{fmtDate(i.dueDate)}</td>
                    <td><Pill status={st} /></td>
                    <td className="n pr-5">
                      <div className={cn('text-[13.5px] font-medium', st === 'void' && 'text-faint line-through')}>{money(t.total, i.currency)}</div>
                      {t.credited > 0 && st !== 'paid' && <div className="text-[11.5px] text-faint">{money(t.balance, i.currency)} due</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <Empty title={rows.length ? 'Nothing here' : 'No invoices yet'}>
            <p className="text-[13.5px]">{rows.length ? 'No invoices with this status.' : 'Approve some tasks, then create an invoice from Billing.'}</p>
          </Empty>
        </div>
      )}
    </div>
  );
}
