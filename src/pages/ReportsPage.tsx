import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Card, Empty, PageHeader, Segmented, StatGrid } from '@/components/ui';
import { useData } from '@/store';
import { buildReport, type ReportGroup, type ReportRange } from '@/domain/insights';
import { fmtH, money, moneyShort } from '@/lib/format';
import { csv, downloadFile, storage } from '@/lib/utils';

export default function ReportsPage() {
  const s = useData();
  const cur = s.workspace.currency;
  const [range, setRange] = useState<ReportRange>(() => storage.get<ReportRange>('taskx.reportRange') ?? 'month');
  const [by, setBy] = useState<ReportGroup>('client');
  const r = useMemo(() => buildReport(s, range, by), [s, range, by]);
  const max = Math.max(1, ...r.rows.map((x) => x.total));
  const billedPct = r.totals.clientMinutes ? Math.round((r.totals.billed / r.totals.clientMinutes) * 100) : 0;

  const exportCsv = () => {
    const head = [by === 'client' ? 'Client' : by === 'project' ? 'Project' : 'Person', 'Total h', 'Billable h', 'Review h', 'Waived h', 'Internal h', 'Value'];
    if (by === 'client') head.push('Invoiced');
    const rows = r.rows.map((x) => {
      const row: Array<string | number> = [x.label, (x.total / 60).toFixed(2), (x.billed / 60).toFixed(2), (x.review / 60).toFixed(2), (x.waived / 60).toFixed(2), (x.internal / 60).toFixed(2), x.value.toFixed(2)];
      if (by === 'client') row.push(x.invoiced.toFixed(2));
      return row;
    });
    downloadFile(`TaskX report ${r.range.label} by ${by}.csv`, csv([head, ...rows]), 'text/csv');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        sub={`${r.range.label} · ${r.taskCount} tasks`}
        actions={
          <>
            <Segmented<ReportRange>
              label="Range"
              value={range}
              onChange={(v) => (setRange(v), storage.set('taskx.reportRange', v))}
              options={[
                { value: 'month', label: 'Month' }, { value: 'last', label: 'Last month' }, { value: 'quarter', label: 'Quarter' },
                { value: 'year', label: 'Year' }, { value: 'all', label: 'All' },
              ]}
            />
            <button type="button" className="btn" onClick={exportCsv} disabled={!r.rows.length}><Download /> CSV</button>
          </>
        }
      />
      <StatGrid
        stats={[
          { label: 'Hours logged', value: fmtH(r.totals.total), hint: `${fmtH(r.totals.internal)} internal` },
          { label: 'Billable share', value: `${billedPct}%`, hint: `${fmtH(r.totals.billed)} of client time` },
          { label: 'Billable value', value: moneyShort(r.totals.value, cur), hint: `${fmtH(r.totals.review)} still in review` },
          { label: 'Invoiced', value: moneyShort(r.invoicedAll, cur), hint: 'After credit notes' },
          { label: 'Effective rate', value: r.effectiveRate ? `${moneyShort(r.effectiveRate, cur)}/h` : '—', hint: 'Invoiced ÷ client hours' },
        ]}
      />
      <Card
        title="Breakdown"
        actions={
          <Segmented<ReportGroup>
            label="Group by"
            value={by}
            onChange={setBy}
            options={[{ value: 'client', label: 'Client' }, { value: 'project', label: 'Project' }, { value: 'person', label: 'Person' }]}
          />
        }
        bodyClass="px-0 pb-1"
      >
        {r.rows.length ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[680px]">
              <thead>
                <tr>
                  <th className="pl-5">{by === 'client' ? 'Client' : by === 'project' ? 'Project' : 'Person'}</th>
                  <th className="w-[28%]" />
                  <th className="n">Total</th>
                  <th className="n">Billable</th>
                  <th className="n">Waived</th>
                  <th className="n">Value</th>
                  {by === 'client' && <th className="n pr-5">Invoiced</th>}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.key}>
                    <td className="pl-5">
                      <span className="flex items-center gap-2.5 font-medium">
                        <i className="size-2 flex-none rounded-full" style={{ background: x.color }} /> {x.label}
                      </span>
                    </td>
                    <td>
                      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" style={{ width: `${(x.total / max) * 100}%` }} title={`${fmtH(x.billed)} billable · ${fmtH(x.review)} review · ${fmtH(x.waived)} waived · ${fmtH(x.internal)} internal`}>
                        <i style={{ flex: x.billed, background: 'var(--color-brand-500)' }} />
                        <i style={{ flex: x.review, background: 'var(--color-review)' }} />
                        <i style={{ flex: x.waived, background: 'var(--color-line-2)' }} />
                        <i style={{ flex: x.internal, background: 'var(--color-internal)' }} />
                      </div>
                    </td>
                    <td className="n font-medium">{fmtH(x.total)}</td>
                    <td className="n">{fmtH(x.billed)}</td>
                    <td className="n text-faint">{x.waived ? fmtH(x.waived) : '—'}</td>
                    <td className="n">{x.value ? money(x.value, cur) : '—'}</td>
                    {by === 'client' && <td className="n pr-5">{x.invoiced ? money(x.invoiced, cur) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pl-5">Total</td>
                  <td />
                  <td className="n">{fmtH(r.totals.total)}</td>
                  <td className="n">{fmtH(r.totals.billed)}</td>
                  <td className="n">{fmtH(r.totals.waived)}</td>
                  <td className="n">{money(r.totals.value, cur)}</td>
                  {by === 'client' && <td className="n pr-5">{money(r.totals.invoiced, cur)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty title="No time in this range" />
        )}
        <div className="flex flex-wrap gap-4 px-5 pt-2 pb-3 text-[12px] text-faint">
          {[['Billable', 'var(--color-brand-500)'], ['Review', 'var(--color-review)'], ['Waived', 'var(--color-line-2)'], ['Internal', 'var(--color-internal)']].map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: c }} /> {l}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
