import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CircleCheck, Plus } from 'lucide-react';
import { Card, ClientAvatar, Dot, PageHeader, Progress, StatGrid } from '@/components/ui';
import { useAppSelector, useData } from '@/store';
import { useGlobalActions } from '@/features/global';
import { attentionItems, type AttentionItem } from '@/domain/insights';
import {
  clientBilling, clientIdOf, invoiceStatus, invoiceTotals, isInternalTask, isOpenInvoice, projectUsedMinutes, sumMinutes, taskValue,
} from '@/domain/billing';
import { addDays, DOW, dayIndex, fmtH, greeting, moneyShort, num, thisMonth, todayISO, weekStart } from '@/lib/format';
import { cn, range, sumBy } from '@/lib/utils';

const TONE: Record<AttentionItem['tone'], string> = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-brand-500' };

function HoursChart() {
  const s = useData();
  const today = todayISO();
  const days = range(0, 13).map((i) => addDays(today, i - 13));
  const data = days.map((d) => {
    const ts = s.tasks.filter((t) => t.date === d);
    const internal = sumMinutes(ts.filter((t) => isInternalTask(s, t)));
    return { d, client: sumMinutes(ts) - internal, internal };
  });
  const max = Math.max(8 * 60, ...data.map((x) => x.client + x.internal));
  const total = sumBy(data, (x) => x.client + x.internal);
  return (
    <Card
      title="Last 14 days"
      actions={
        <span className="flex items-center gap-3 text-[12px] text-faint">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-brand-500" /> Client</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-internal" /> Internal</span>
          <span className="num text-ink">{fmtH(total)}</span>
        </span>
      }
    >
      <div className="flex h-[168px] items-end gap-1.5 pt-2" role="img" aria-label={`Hours per day for the last 14 days, ${fmtH(total)} total`}>
        {data.map((x) => {
          const h = ((x.client + x.internal) / max) * 100;
          const weekend = dayIndex(x.d) >= 5;
          return (
            <div key={x.d} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${x.d}: ${fmtH(x.client + x.internal)}`}>
              <span className="num text-[10.5px] text-faint opacity-0 transition group-hover:opacity-100">{fmtH(x.client + x.internal)}</span>
              <div className="flex w-full max-w-[28px] flex-col justify-end overflow-hidden rounded-[5px]" style={{ height: `${Math.max(h, 1.5)}%` }}>
                {x.internal > 0 && <div className="bg-internal" style={{ flex: x.internal }} />}
                {x.client > 0 && <div className="bg-brand-500" style={{ flex: x.client, background: 'var(--brand-gradient)' }} />}
                {!x.client && !x.internal && <div className="h-full bg-surface-3" />}
              </div>
              <span className={cn('text-[10.5px]', x.d === today ? 'font-semibold text-ink' : weekend ? 'text-line-2' : 'text-faint')}>
                {DOW[dayIndex(x.d)]![0]}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function HomePage() {
  const s = useData();
  const nav = useNavigate();
  const timer = useAppSelector((x) => x.ui.timer);
  const { newTask, stopTimer } = useGlobalActions();
  const cur = s.workspace.currency;
  const mo = thisMonth();

  const stats = useMemo(() => {
    const ws = weekStart(0);
    const week = s.tasks.filter((t) => t.date >= ws && t.date < addDays(ws, 7));
    const ready = s.tasks.filter((t) => t.status === 'billable');
    const review = s.tasks.filter((t) => t.status === 'review');
    const open = s.invoices.filter(isOpenInvoice);
    const overdue = open.filter((i) => invoiceStatus(i) === 'overdue');
    const paid = s.invoices.filter((i) => i.status === 'paid' && (i.paidAt ?? '').startsWith(mo));
    return [
      { label: 'This week', value: fmtH(sumMinutes(week)), hint: `${fmtH(sumMinutes(week.filter((t) => !isInternalTask(s, t))))} client time` },
      { label: 'Ready to invoice', value: moneyShort(sumBy(ready, (t) => taskValue(s, t)), cur), hint: review.length ? `${review.length} more to review` : 'All reviewed' },
      {
        label: 'Outstanding', value: moneyShort(sumBy(open, (i) => invoiceTotals(i).balance), cur),
        hint: overdue.length ? `${overdue.length} overdue` : `${open.length} open invoice${open.length === 1 ? '' : 's'}`,
        tone: overdue.length ? ('danger' as const) : undefined,
      },
      { label: 'Paid this month', value: moneyShort(sumBy(paid, (i) => invoiceTotals(i).total), cur), hint: `${paid.length} invoice${paid.length === 1 ? '' : 's'}` },
    ];
  }, [s, cur, mo]);

  const todo = attentionItems(s, timer?.start);
  const clients = s.clients
    .filter((c) => c.active)
    .map((c) => ({ c, b: clientBilling(s, c, mo) }))
    .map((x) => ({ ...x, used: x.b.review + x.b.billable + x.b.invoiced }))
    .sort((a, b) => b.used - a.used);
  const internal = sumMinutes(s.tasks.filter((t) => t.date.startsWith(mo) && clientIdOf(s, t) === 'internal'));
  const budgets = s.projects
    .filter((p) => !p.archived && num(p.budgetHours))
    .map((p) => ({ p, used: projectUsedMinutes(s, p.id), bud: num(p.budgetHours) * 60 }))
    .sort((a, b) => b.used / b.bud - a.used / a.bud);

  const runAction = (it: AttentionItem) => {
    const a = it.action;
    if (it.kind === 'timer') return stopTimer();
    if (a.invoiceId) return nav(`/invoices/${a.invoiceId}`);
    if (a.clientId) return nav(`/tasks?client=${a.clientId}`);
    if (a.projectId) return nav(`/tasks?project=${a.projectId}`);
    if (a.to) nav(a.to);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Good ${greeting()}${s.workspace.ownerName ? `, ${s.workspace.ownerName.split(' ')[0]}` : ''}`}
        sub="Here’s where your time and money stand."
        actions={
          <button type="button" className="btn" onClick={() => newTask()}>
            <Plus /> Log time
          </button>
        }
      />
      <StatGrid stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <HoursChart />
          <Card
            title="Clients this month"
            actions={<Link to="/billing" className="flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">Billing <ArrowRight className="size-3.5" /></Link>}
            bodyClass="px-0 pb-1"
          >
            {clients.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="pl-5">Client</th>
                      <th className="n">Hours</th>
                      <th className="n">To review</th>
                      <th className="n pr-5">Ready</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(({ c, b, used }) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => nav(`/tasks?client=${c.id}`)}>
                        <td className="pl-5">
                          <div className="flex items-center gap-2.5">
                            <ClientAvatar client={c} size={26} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{c.name}</div>
                              {num(c.cap) > 0 && (
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="w-24"><Progress value={used} max={num(c.cap) * 60} hot={used > num(c.cap) * 60} /></div>
                                  <span className="num text-[11px] text-faint">cap {num(c.cap)}h</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="n">{fmtH(used)}</td>
                        <td className={cn('n', b.review ? 'text-review' : 'text-faint')}>{b.review ? fmtH(b.review) : '—'}</td>
                        <td className="n pr-5 font-medium">{b.amount ? moneyShort(b.amount, cur) : <span className="text-faint">—</span>}</td>
                      </tr>
                    ))}
                    {internal > 0 && (
                      <tr className="cursor-pointer hover:bg-surface-2/60" onClick={() => nav('/tasks?client=internal')}>
                        <td className="pl-5"><div className="flex items-center gap-2.5"><Dot color="var(--color-internal)" /> <span className="text-muted">Internal</span></div></td>
                        <td className="n">{fmtH(internal)}</td>
                        <td className="n text-faint">—</td>
                        <td className="n pr-5 text-faint">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 pb-4 text-[13.5px] text-muted">Add a client to start tracking. <Link className="text-brand-700 hover:underline" to="/clients">Add client</Link></p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title={<>To do {todo.length > 0 && <span className="num rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{todo.length}</span>}</>}>
            {todo.length ? (
              <ul className="-mx-2 flex flex-col">
                {todo.map((it, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => runAction(it)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2">
                      <i className={cn('size-2 flex-none rounded-full', TONE[it.tone])} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{it.title}</span>
                        <span className="block truncate text-[12.5px] text-faint">{it.detail}</span>
                      </span>
                      <span className="flex-none text-[12.5px] font-medium text-brand-700 opacity-70 group-hover:opacity-100">{it.action.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 py-2 text-[13.5px] text-muted">
                <CircleCheck className="size-5 text-invoiced" /> All clear. Nothing needs you right now.
              </div>
            )}
          </Card>
          {budgets.length > 0 && (
            <Card title="Project budgets">
              <div className="flex flex-col gap-4">
                {budgets.slice(0, 6).map(({ p, used, bud }) => (
                  <Link key={p.id} to={`/tasks?project=${p.id}`} className="group flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="truncate font-medium group-hover:text-brand-700">{p.name}</span>
                      <span className={cn('num flex-none text-[12px]', used > bud ? 'text-danger' : 'text-faint')}>{fmtH(used)} / {fmtH(bud)}</span>
                    </div>
                    <Progress value={used} max={bud} hot={used > bud} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
