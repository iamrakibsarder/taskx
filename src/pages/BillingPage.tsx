import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Ellipsis, FileText, Lock, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import type { Client } from '@/types/domain';
import { Card, ClientAvatar, Dot, Empty, Menu, MonthNav, PageHeader, Pill, Progress, StatGrid } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { useAppDispatch, useData } from '@/store';
import { remove } from '@/store/dataSlice';
import { lockMonth } from '@/store/operations';
import { CreateInvoiceDialog, ExpenseDialog } from '@/features/billing/BillingDialogs';
import { clientBilling, clientIdOf, expenseAmount, findProject, invoiceStatus, invoiceTotals, isLocked, sumMinutes } from '@/domain/billing';
import { addMonth, fmtDate, fmtH, money, moneyShort, monthLabel, num, thisMonth } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, sumBy } from '@/lib/utils';

function ClientCard({ c, month }: { c: Client; month: string }) {
  const s = useData();
  const modal = useModal();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const b = clientBilling(s, c, month);
  const cur = s.workspace.currency;
  const used = b.review + b.billable + b.invoiced;
  const cap = num(c.cap) * 60;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ClientAvatar client={c} size={36} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">{c.name}</h3>
            <p className="truncate text-[12.5px] text-faint">
              {c.billing === 'retainer' ? `Retainer ${money(num(c.retainerFee), cur)} · ${num(c.includedHours)}h included` : `Hourly · ${money(num(c.rate) || num(s.workspace.defaultRate), cur)}/h`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {b.reviewCount > 0 && (
            <Link to={`/tasks?client=${c.id}&status=review`} className="btn btn-sm">
              Review {b.reviewCount}
            </Link>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={!b.lines.length} onClick={() => modal.open((x) => <CreateInvoiceDialog client={c} month={month} onClose={x} />)}>
            <FileText /> Invoice {b.amount ? moneyShort(b.amount, cur) : ''}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          { k: 'review', label: 'In review', v: b.review },
          { k: 'billable', label: 'Approved', v: b.billable },
          { k: 'waived', label: 'Waived', v: b.waived, hint: b.waivedValue ? `${moneyShort(b.waivedValue, cur)} off` : '' },
          { k: 'invoiced', label: 'Invoiced', v: b.invoiced },
        ].map((x) => (
          <div key={x.k} className="bg-surface px-5 py-3">
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <i className="size-1.5 rounded-full" style={{ background: `var(--color-${x.k})` }} /> {x.label}
            </div>
            <div className={cn('num text-[17px] font-medium', !x.v && 'text-line-2')}>{fmtH(x.v)}</div>
            {x.hint && <div className="text-[11.5px] text-faint">{x.hint}</div>}
          </div>
        ))}
      </div>

      {cap > 0 && (
        <div className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-[12.5px] text-muted">
          <span>Cap</span>
          <div className="flex-1"><Progress value={used} max={cap} hot={used > cap} /></div>
          <span className={cn('num', used > cap && 'text-danger')}>{fmtH(used)} / {fmtH(cap)}</span>
        </div>
      )}

      <div className="px-5 py-3">
        <button type="button" className="flex w-full items-center gap-2 text-[13px] font-medium text-muted hover:text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
          {b.lines.length ? `Invoice preview · ${b.lines.length} line${b.lines.length === 1 ? '' : 's'}` : 'By project'}
          {b.invoices.length > 0 && (
            <span className="ml-auto flex gap-1.5">
              {b.invoices.map((i) => (
                <span key={i.id} role="link" tabIndex={0} onClick={(e) => (e.stopPropagation(), nav(`/invoices/${i.id}`))} className="cursor-pointer">
                  <Pill status={invoiceStatus(i)}>{i.number}</Pill>
                </span>
              ))}
            </span>
          )}
        </button>
        {open && (
          <div className="mt-3 flex flex-col gap-4">
            {b.lines.length > 0 && (
              <table className="table">
                <tbody>
                  {b.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="pl-0">
                        <div className="font-medium">{l.desc}</div>
                        <div className="text-[12px] text-faint">{l.detail}</div>
                      </td>
                      <td className="n pr-0">{money(l.amount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pl-0">Total before tax</td>
                    <td className="n pr-0 text-[14px]">{money(b.amount, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            {Object.keys(b.byProject).length > 0 && (
              <div className="overflow-x-auto rounded-lg bg-surface-2 p-1">
                <table className="table">
                  <thead>
                    <tr><th>Project</th><th className="n">Review</th><th className="n">Approved</th><th className="n">Waived</th><th className="n">Invoiced</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(b.byProject).map(([pid, r]) => (
                      <tr key={pid}>
                        <td><Link className="hover:text-brand-700" to={`/tasks?project=${pid}`}>{findProject(s, pid)?.name ?? '—'}</Link></td>
                        {(['review', 'billable', 'waived', 'invoiced'] as const).map((k) => (
                          <td key={k} className={cn('n', !r[k] && 'text-line-2')}>{fmtH(r[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!b.lines.length && !Object.keys(b.byProject).length && <p className="text-[13px] text-faint">No time logged for {monthLabel(month)}.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

export default function BillingPage() {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? thisMonth();
  const setMonth = (d: number) => setParams({ month: addMonth(month, d) }, { replace: true });
  const cur = s.workspace.currency;

  const clients = s.clients.filter((c) => c.active || s.tasks.some((t) => t.date.startsWith(month) && clientIdOf(s, t) === c.id));
  const all = clients.map((c) => clientBilling(s, c, month));
  const internal = sumMinutes(s.tasks.filter((t) => t.date.startsWith(month) && clientIdOf(s, t) === 'internal'));
  const invoicedThisMonth = s.invoices.filter((i) => i.period === month && i.status !== 'void');
  const expenses = s.expenses.filter((e) => e.status === 'unbilled' && e.date.slice(0, 7) <= month).sort((a, b) => b.date.localeCompare(a.date));
  const locked = isLocked(s, `${month}-01`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing"
        sub={locked ? `${monthLabel(month)} is locked` : 'Review, approve, invoice.'}
        actions={
          <>
            <MonthNav month={month} onChange={setMonth} />
            {!locked && month < thisMonth() && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  modal.open((c) => (
                    <Confirm
                      title={`Lock ${monthLabel(month)}?`}
                      body="Tasks in this month and earlier can still be approved, waived and invoiced, but not edited, added or deleted. You can unlock in Settings."
                      confirm="Lock month"
                      onClose={c}
                      onConfirm={() => dispatch(lockMonth(month))}
                    />
                  ))
                }
              >
                <Lock /> Lock month
              </button>
            )}
          </>
        }
      />
      <StatGrid
        stats={[
          { label: 'To review', value: fmtH(sumBy(all, (b) => b.review)), hint: `${sumBy(all, (b) => b.reviewCount)} tasks` },
          { label: 'Ready to invoice', value: moneyShort(sumBy(all, (b) => b.amount), cur), hint: fmtH(sumBy(all, (b) => b.billable)) },
          { label: 'Invoiced', value: moneyShort(sumBy(invoicedThisMonth, (i) => invoiceTotals(i).total), cur), hint: `${invoicedThisMonth.length} invoices` },
          { label: 'Waived', value: fmtH(sumBy(all, (b) => b.waived)), hint: `${moneyShort(sumBy(all, (b) => b.waivedValue), cur)} given away` },
        ]}
      />

      {clients.length ? (
        <div className="flex flex-col gap-4">
          {clients.map((c) => <ClientCard key={c.id} c={c} month={month} />)}
        </div>
      ) : (
        <div className="card">
          <Empty title="No clients yet"><Link to="/clients" className="btn btn-primary mt-2"><Plus /> Add a client</Link></Empty>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title={<><Receipt className="size-4 text-faint" /> Unbilled expenses</>}
          actions={<button type="button" className="btn btn-sm" onClick={() => modal.open((c) => <ExpenseDialog onClose={c} />)}><Plus /> Add</button>}
          bodyClass="px-0 pb-1"
        >
          {expenses.length ? (
            <table className="table">
              <tbody>
                {expenses.map((e) => {
                  const c = s.clients.find((x) => x.id === e.clientId);
                  return (
                    <tr key={e.id}>
                      <td className="pl-5">
                        <div className="font-medium">{e.desc}</div>
                        <div className="flex items-center gap-1.5 text-[12px] text-faint">
                          {c ? <><Dot color={c.color} size={6} /> {c.name}</> : 'Own cost'} · {fmtDate(e.date)}
                          {!e.billable && c && ' · not billed'}
                          {num(e.markup) > 0 && ` · +${num(e.markup)}%`}
                        </div>
                      </td>
                      <td className="n">{money(e.billable && c ? expenseAmount(e) : num(e.amount), cur)}</td>
                      <td className="w-10 pr-3">
                        <Menu
                          items={[
                            { label: 'Edit', icon: <Pencil />, onSelect: () => modal.open((x) => <ExpenseDialog expense={e} onClose={x} />) },
                            {
                              label: 'Delete', icon: <Trash2 />, danger: true,
                              onSelect: () => modal.open((x) => <Confirm title="Delete expense?" body={e.desc} confirm="Delete" danger onClose={x} onConfirm={() => (dispatch(remove('expenses', e.id)), toast('Expense deleted'))} />),
                            },
                          ]}
                          trigger={(_, t) => <button type="button" className="btn-icon" onClick={t} aria-label="Expense actions"><Ellipsis /></button>}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-5 pb-4 text-[13.5px] text-faint">No open expenses. Billable ones go on the next invoice automatically.</p>
          )}
        </Card>
        <Card title="Internal time">
          <div className="num text-[26px] font-medium">{fmtH(internal)}</div>
          <p className="mt-1 text-[13px] text-muted">Logged on internal projects in {monthLabel(month)}. Never billed.</p>
          <Link to="/tasks?client=internal" className="mt-3 inline-block text-[13px] font-medium text-brand-700 hover:underline">See tasks</Link>
        </Card>
      </div>
    </div>
  );
}
