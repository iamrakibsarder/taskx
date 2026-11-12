import { apiRequest, apiUrl } from './gateway';

/** A client's private invoice page (`taskx-backend/src/portal.rs`). */
export interface PortalLink {
  enabled: boolean;
  url: string | null;
  lastViewedAt: string | null;
}

export interface PortalInvoice {
  id: string;
  number: string;
  period: string;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  currency: string;
  total: number;
  paid: number;
  balance: number;
  /** Minutes of work billed. */
  hours: number;
  status: 'open' | 'overdue' | 'paid';
}

export interface PortalPage {
  business: { name: string; ownerName: string; email: string; address: string; paymentInfo: string };
  client: { name: string; contact: string; logo: string; color: string };
  owed: { currency: string; balance: number; overdue: number }[];
  invoices: PortalInvoice[];
}

const client = (id: string) => `/api/clients/${encodeURIComponent(id)}/portal`;

export const portalApi = {
  link: (clientId: string) => apiRequest<PortalLink>(apiUrl!, 'GET', client(clientId)),
  enable: (clientId: string, regenerate = false) => apiRequest<PortalLink>(apiUrl!, 'POST', client(clientId), { regenerate }),
  disable: (clientId: string) => apiRequest<PortalLink>(apiUrl!, 'DELETE', client(clientId)),

  /** The public page; works without signing in. */
  page: (token: string) => apiRequest<PortalPage>(apiUrl!, 'GET', `/api/portal/${encodeURIComponent(token)}`),
  pdfUrl: (token: string, invoiceId: string) =>
    `${apiUrl!.replace(/\/$/, '')}/api/portal/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/pdf`,
};
