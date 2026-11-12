import type { DataState, Invoice } from '@/types/domain';
import { fmtH, longDate, money, monthLabel, round2 } from '@/lib/format';
import { csv } from '@/lib/utils';
import { byDateAsc, clientIdOf, findProject, invoiceTotals, rateFor, taskValue } from './billing';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

/** A standalone HTML file of the invoice, for attaching to an email or printing to PDF. */
export function invoiceHtml(s: DataState, inv: Invoice): string {
  const f = inv.from ?? s.workspace;
  const t = invoiceTotals(inv);
  const m = (n: number) => money(n, inv.currency);
  const rows = inv.lines
    .map(
      (l) => `<tr><td><b>${esc(l.desc)}</b>${l.detail ? `<div class="mu">${esc(l.detail)}</div>` : ''}</td>
      <td class="n">${l.minutes ? fmtH(l.minutes) : '—'}</td><td class="n">${l.kind === 'hours' || l.kind === 'overage' ? `${m(l.rate)}/h` : '—'}</td><td class="n">${m(l.amount)}</td></tr>`,
    )
    .join('');
  const credits =
    (inv.credits ?? []).map((c) => `<span>Credit note ${esc(c.number)}</span><span class="n">−${m(c.amount)}</span>`).join('') +
    (inv.payments ?? []).map((p) => `<span>Paid ${longDate(p.date)}</span><span class="n">−${m(p.amount)}</span>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(inv.number)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
body{margin:0;background:#f8f7fb;padding:40px 16px;font:14px/1.55 'Be Vietnam Pro',system-ui,sans-serif;color:#0c021a}
.p{max-width:820px;margin:0 auto;background:#fff;border:1px solid #ebe8f1;border-radius:16px;padding:48px}
.h{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding-bottom:28px;border-bottom:1px solid #ebe8f1}
.b{font-weight:600;font-size:20px;letter-spacing:-.02em}.w{font-weight:600;font-size:36px;letter-spacing:-.03em;line-height:1;text-align:right}
.mu{color:#5c5c63;font-size:13px}.lb{font-size:12px;color:#5c5c63;margin-bottom:6px}.n{text-align:right;font-family:'JetBrains Mono',monospace;white-space:nowrap}
.meta{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:24px 0}
table{width:100%;border-collapse:collapse}th{font-size:12px;font-weight:500;color:#5c5c63;text-align:left;padding:10px 0;border-bottom:1px solid #ebe8f1}
td{padding:12px 0;border-bottom:1px solid #ebe8f1;vertical-align:top}td.n,th.n{padding-left:14px}
.tot{margin-left:auto;width:min(320px,100%);display:grid;grid-template-columns:1fr auto;gap:6px 18px;padding-top:16px}
.due{font-weight:600;font-size:17px;border-top:1px solid #0c021a;padding-top:10px;margin-top:6px}
.pay{margin-top:28px;padding:16px;border-radius:12px;background:#f5f3f9;font-size:13px}
.badge{display:inline-block;margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#5c5c63}
@media print{body{background:#fff;padding:0}.p{border:0}}
</style></head><body><article class="p">
<header class="h"><div><div class="b">${esc(f.businessName || 'Your business')}</div><div class="mu">${nl(f.address)}</div><div class="mu">${esc(f.email)}</div></div>
<div><div class="w">Invoice</div><div class="badge" style="text-align:right;display:block">${esc(inv.number)}${inv.status === 'paid' ? ' · Paid' : ''}</div></div></header>
<section class="meta"><div><div class="lb">Billed to</div><b>${esc(inv.client.name)}</b>${inv.client.contact ? `<div class="mu">Attn: ${esc(inv.client.contact)}</div>` : ''}<div class="mu">${nl(inv.client.address)}</div><div class="mu">${esc(inv.client.email)}</div></div>
<div class="mu">Issued <b>${longDate(inv.issueDate)}</b><br>Due <b>${longDate(inv.dueDate)}</b><br>Period <b>${monthLabel(inv.period)}</b></div></section>
<table><thead><tr><th>Description</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<section class="tot"><span>Subtotal</span><span class="n">${m(t.subtotal)}</span>${t.discount ? `<span>Discount</span><span class="n">−${m(t.discount)}</span>` : ''}${inv.taxRate ? `<span>${esc(inv.taxLabel)} (${inv.taxRate}%)</span><span class="n">${m(t.tax)}</span>` : ''}${credits ? `<span><b>Total</b></span><span class="n">${m(t.total)}</span>${credits}` : ''}
<span class="due">${inv.status === 'paid' ? 'Paid' : credits ? 'Balance due' : 'Amount due'}</span><span class="n due">${m(credits ? t.balance : t.total)}</span></section>
${f.paymentInfo ? `<section class="pay"><div class="lb">How to pay</div>${nl(f.paymentInfo)}</section>` : ''}
${inv.notes ? `<p class="mu" style="margin-top:22px">${nl(inv.notes)}</p>` : ''}
</article></body></html>`;
}

/** Client timesheet for an invoice: billed tasks plus that month's complimentary (waived) work. */
export function invoiceTimesheetCsv(s: DataState, inv: Invoice): string {
  const retainer = inv.lines.some((l) => l.kind === 'retainer' || l.kind === 'covered');
  const rows: Array<Array<string | number>> = [['Date', 'Project', 'Task', 'Time (h:mm)', 'Hours', 'Rate', 'Amount', 'Status']];
  for (const t of s.tasks.filter((t) => t.invoiceId === inv.id).sort(byDateAsc)) {
    rows.push([t.date, findProject(s, t.projectId)?.name ?? '', t.memo, fmtH(t.minutes), (t.minutes / 60).toFixed(2),
      retainer ? '' : rateFor(s, t), retainer ? '' : round2(taskValue(s, t)).toFixed(2), 'Billed']);
  }
  for (const t of s.tasks.filter((t) => t.status === 'waived' && clientIdOf(s, t) === inv.clientId && t.date.slice(0, 7) === inv.period).sort(byDateAsc)) {
    rows.push([t.date, findProject(s, t.projectId)?.name ?? '', t.memo, fmtH(t.minutes), (t.minutes / 60).toFixed(2), '', '0.00', 'Complimentary']);
  }
  return csv(rows);
}

export function invoiceEmail(s: DataState, inv: Invoice) {
  const t = invoiceTotals(inv);
  const f = inv.from ?? s.workspace;
  const m = (n: number) => money(n, inv.currency);
  const due = t.credited || t.paid ? t.balance : t.total;
  const subject = `Invoice ${inv.number} from ${f.businessName || 'us'}: ${m(due)} due ${longDate(inv.dueDate)}`;
  const body = [
    `Hi ${inv.client.contact || inv.client.name},`,
    '',
    `Here is invoice ${inv.number} for ${monthLabel(inv.period)}. The ${t.credited || t.paid ? 'balance' : 'total'} is ${m(due)}, due by ${longDate(inv.dueDate)}.`,
    '',
    ...inv.lines.map((l) => `- ${l.desc}${l.minutes ? ` (${fmtH(l.minutes)} h)` : ''}: ${m(l.amount)}`),
    ...(t.discount ? [`- Discount: -${m(t.discount)}`] : []),
    ...(t.tax ? [`- ${inv.taxLabel}: ${m(t.tax)}`] : []),
    '',
    ...(f.paymentInfo ? ['How to pay:', f.paymentInfo, ''] : []),
    'The full invoice is attached. Let me know if you have any questions.',
    '',
    'Thank you,',
    f.ownerName || f.businessName || '',
  ].join('\n');
  return { subject, body };
}
