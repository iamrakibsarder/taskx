import { useEffect, useState, type ReactNode } from 'react';
import { Download, FileText, LoaderCircle } from 'lucide-react';
import { ClientAvatar, Pill } from '@/components/ui';
import { ApiError } from '@/data/gateway';
import { portalApi, type PortalPage } from '@/data/portalApi';
import { fmtH, longDate, money, monthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The client's private invoice page at `/portal/<token>`: no account, read only.
 * Shows what's owed, every sent invoice with a PDF download, and how to pay.
 */
export default function ClientPortal({ token }: { token: string }) {
  const [page, setPage] = useState<PortalPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi
      .page(token)
      .then((p) => {
        setPage(p);
        document.title = `Invoices · ${p.business.name || 'TaskX'}`;
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError && e.status === 404 ? e.message : 'Can’t load your invoices right now. Try again in a minute.'),
      );
  }, [token]);

  if (error)
    return (
      <Frame>
        <div className="card mx-auto mt-16 max-w-md p-8 text-center">
          <FileText className="mx-auto size-8 text-faint" />
          <h1 className="mt-3 text-[17px] font-semibold">This page isn’t available</h1>
          <p className="mt-1 text-[13.5px] text-muted">{error}</p>
        </div>
      </Frame>
    );
  if (!page)
    return (
      <Frame>
        <div className="grid place-items-center py-24 text-faint"><LoaderCircle className="size-6 animate-spin" /></div>
      </Frame>
    );

  const { business: b, client: c } = page;
  const owing = page.owed.filter((o) => o.balance > 0);
  return (
    <Frame business={b.name}>
      <header className="flex flex-wrap items-center gap-4">
        <ClientAvatar client={c} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold tracking-tight">{c.name}</h1>
          <p className="text-[13.5px] text-muted">Invoices from {b.name || 'us'}</p>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <div className="text-[12.5px] font-medium text-muted">Outstanding</div>
          {owing.length ? (
            owing.map((o) => (
              <div key={o.currency} className="mt-1">
                <div className={cn('num text-[26px] font-medium', o.overdue > 0 && 'text-danger')}>{money(o.balance, o.currency)}</div>
                {o.overdue > 0 && <div className="text-[12.5px] text-danger">{money(o.overdue, o.currency)} overdue</div>}
              </div>
            ))
          ) : (
            <div className="num mt-1 text-[26px] font-medium">All paid</div>
          )}
        </div>
        {b.paymentInfo && (
          <div className="card p-5">
            <div className="text-[12.5px] font-medium text-muted">How to pay</div>
            <p className="mt-1.5 text-[13.5px] whitespace-pre-line">{b.paymentInfo}</p>
          </div>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">Invoices</h2>
        {page.invoices.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-muted">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {page.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[14px] font-medium">{i.number}</span>
                    <Pill status={i.status === 'open' ? 'sent' : i.status}>{i.status === 'open' ? 'Open' : undefined}</Pill>
                  </div>
                  <div className="text-[12.5px] text-faint sm:truncate">
                    {[i.period && monthLabel(i.period), i.hours ? `${fmtH(i.hours)} h` : '', i.status === 'paid' ? (i.paidAt ? `Paid ${longDate(i.paidAt)}` : 'Paid') : `Due ${longDate(i.dueDate)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn('num text-[14px] font-medium', i.status === 'overdue' && 'text-danger')}>
                    {money(i.status === 'paid' ? i.total : i.balance, i.currency)}
                  </div>
                  {i.status !== 'paid' && i.paid > 0 && <div className="text-[12px] text-faint">of {money(i.total, i.currency)}</div>}
                </div>
                <a className="btn btn-sm" href={portalApi.pdfUrl(token, i.id)} download>
                  <Download /> PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(b.email || b.address) && (
        <footer className="mt-6 text-center text-[12.5px] text-faint">
          Questions? {b.email ? <a className="font-medium text-brand-700 hover:underline" href={`mailto:${b.email}`}>{b.email}</a> : null}
          {b.address && <div className="mt-1 whitespace-pre-line">{b.address}</div>}
        </footer>
      )}
    </Frame>
  );
}

function Frame({ business, children }: { business?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[760px] px-4 py-8 sm:py-12">
        {business && <div className="mb-6 text-[13px] font-medium tracking-wide text-faint uppercase">{business}</div>}
        {children}
        <p className="mt-10 text-center text-[11.5px] text-faint">Private page for this client · Powered by TaskX</p>
      </div>
    </div>
  );
}
