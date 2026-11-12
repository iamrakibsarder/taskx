import { apiRequest, apiUrl, ApiError, gateway } from './gateway';
import { session } from './session';
import type { Invoice } from '@/types/domain';

/** The server can email invoices itself (API mode with SMTP set up). */
export const serverMail = () => gateway.kind === 'http' && session.mailEnabled();

/** Invoice PDFs and sending by email (`taskx-backend/src/invoices.rs`). */
export const invoiceApi = {
  send: (id: string, b: { to: string; subject: string; body: string; copyMe: boolean; sentAt: string }) =>
    apiRequest<Invoice>(apiUrl!, 'POST', `/api/invoices/${encodeURIComponent(id)}/send`, b),

  /** Downloads the PDF the server renders (the same file the email attaches). */
  async downloadPdf(inv: Pick<Invoice, 'id' | 'number' | 'client'>) {
    const token = session.token();
    let res: Response;
    try {
      res = await fetch(`${apiUrl!.replace(/\/$/, '')}/api/invoices/${encodeURIComponent(inv.id)}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    } catch {
      throw new ApiError('Can’t reach the TaskX server. Check your connection.', 0);
    }
    if (!res.ok) {
      const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
      throw new ApiError(msg ?? `Couldn’t make the PDF (${res.status}).`, res.status);
    }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `${inv.number} ${inv.client.name}.pdf` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
