import type { DataState, Workspace } from '@/types/domain';
import { addDays, monthLabel, toISO } from '@/lib/format';

export const CLIENT_COLORS = ['#7d22f2', '#ff8a3d', '#13b5a6', '#e85dd0', '#2f6bff', '#f2b200', '#e5484d', '#2ead5b'];

export const defaultWorkspace = (): Workspace => ({
  businessName: '',
  ownerName: '',
  email: '',
  address: '',
  currency: 'USD',
  defaultRate: 50,
  invoicePrefix: 'INV-',
  termsDays: 14,
  taxRate: 0,
  taxLabel: 'Tax',
  paymentInfo: '',
  invoiceNote: 'Thank you for your business.',
  autoApprove: false,
  team: false,
  members: [],
  rounding: 'nearest',
  lockedThrough: '',
  screenshotMinutes: 5,
});

/** Example data shown on first run. Every record is marked `sample: true` so it can be cleared. */
export function sampleData(): DataState {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const td = now.getDate();
  const cur = (day: number) => toISO(new Date(y, m, Math.min(day, td)));
  const prev = (day: number) => toISO(new Date(y, m - 1, day));
  const pm = toISO(new Date(y, m - 1, 1)).slice(0, 7);
  const prevEnd = toISO(new Date(y, m, 0));
  const ts = Date.now();

  const workspace: Workspace = {
    ...defaultWorkspace(),
    businessName: 'Your Studio',
    ownerName: 'Alex',
    email: 'billing@yourstudio.example',
    address: '12 Example Street\nSpringfield',
    defaultRate: 60,
    paymentInfo: 'Bank transfer to Your Studio, account details on request.\nCard payments: reply for a payment link.',
    team: true,
    members: ['Alex', 'Sam', 'Rina'],
  };

  const clients: DataState['clients'] = [
    { id: 's-c1', sample: true, name: 'Northwind Bakery', color: '#ff8a3d', contact: 'Maria', email: 'accounts@northwind.example', address: '14 Mill Lane\nPortland, OR', billing: 'hourly', rate: 65, retainerFee: 0, includedHours: 0, cap: 20, active: true, createdAt: ts },
    { id: 's-c2', sample: true, name: 'Harbor & Pine Dental', color: '#13b5a6', contact: 'Dr. Osei', email: 'office@harborpine.example', address: '200 Harbor Road\nSeattle, WA', billing: 'retainer', retainerFee: 1200, includedHours: 15, rate: 75, cap: 25, active: true, createdAt: ts },
    { id: 's-c3', sample: true, name: 'Lumen Yoga Studio', color: '#e85dd0', contact: 'Priya', email: 'hello@lumenyoga.example', address: '', billing: 'hourly', rate: 55, retainerFee: 0, includedHours: 0, cap: 6, active: true, createdAt: ts },
  ];

  const P = (id: string, clientId: string | null, name: string, rate: number | null, budgetHours: number | null = null) => ({
    id, sample: true, clientId, name, rate, internal: clientId === null, archived: false, budgetHours,
  });
  const projects: DataState['projects'] = [
    P('s-p1', 's-c1', 'Website refresh', null, 10),
    P('s-p2', 's-c1', 'Holiday campaign', 70, 12),
    P('s-p3', 's-c2', 'Patient portal', null, 20),
    P('s-p4', 's-c2', 'Monthly SEO', null),
    P('s-p5', 's-c3', 'Class booking app', null, 10),
    P('s-p6', null, 'Admin & bookkeeping', null),
    P('s-p7', null, 'Skills & training', null),
  ];

  const T = (n: number, projectId: string, memo: string, minutes: number, date: string, status: DataState['tasks'][number]['status'], invoiceId: string | null = null, by = 'Alex') => ({
    id: `s-t${n}`, sample: true, projectId, memo, minutes, date, status, invoiceId, link: '', by, createdAt: ts - n * 1000,
  });
  const tasks: DataState['tasks'] = [
    T(1, 's-p1', 'Homepage hero redesign and new product grid', 150, prev(6), 'invoiced', 's-i1'),
    T(2, 's-p1', 'Rebuilt menu pages with seasonal pricing', 120, prev(13), 'invoiced', 's-i1', 'Sam'),
    T(3, 's-p1', 'Fixed tax rounding on pastry box checkout', 45, prev(20), 'invoiced', 's-i1'),
    T(4, 's-p2', 'Drafted holiday email sequence (3 emails)', 90, prev(27), 'invoiced', 's-i1', 'Rina'),
    T(5, 's-p1', 'Quick call about logo files', 15, prev(9), 'waived'),
    T(6, 's-p3', 'Appointment form: insurance field and validation', 210, prev(8), 'invoiced', 's-i2', 'Sam'),
    T(7, 's-p4', 'Keyword report and 4 meta description rewrites', 120, prev(15), 'invoiced', 's-i2', 'Rina'),
    T(8, 's-p3', 'Accessibility fixes on the portal login page', 180, prev(22), 'invoiced', 's-i2', 'Sam'),
    T(9, 's-p4', 'Refreshed Google Business profile photos', 60, prev(29), 'invoiced', 's-i2', 'Rina'),
    T(21, 's-p5', 'Teacher profile pages with photos and bios', 120, prev(24), 'billable'),
    T(10, 's-p2', 'Holiday landing page layout and countdown banner', 165, cur(1), 'billable'),
    T(11, 's-p1', 'Moved catering form to the new booking widget', 60, cur(2), 'billable', null, 'Sam'),
    T(12, 's-p2', 'Set up 25 gift card promo codes', 45, cur(3), 'review', null, 'Rina'),
    T(13, 's-p1', 'Homepage speed audit, compressed 38 images', 90, cur(4), 'review'),
    T(14, 's-p1', 'Answered email about hosting renewal', 15, cur(4), 'waived'),
    T(15, 's-p3', 'Insurance card upload with storage and preview', 240, cur(2), 'billable', null, 'Sam'),
    T(16, 's-p4', 'Published 2 blog posts for the month', 75, cur(3), 'review', null, 'Rina'),
    T(17, 's-p5', 'Class schedule filter by teacher and level', 150, cur(1), 'billable'),
    T(18, 's-p5', 'Stripe test checkout for the 10-class pass', 105, cur(5), 'review'),
    T(22, 's-p5', 'Waitlist emails when a class fills up', 90, cur(5), 'review', null, 'Sam'),
    T(19, 's-p6', "Sent last month's invoices and reconciled payments", 45, cur(1), 'internal'),
    T(20, 's-p7', 'Tried new invoice email templates', 60, cur(3), 'internal', null, 'Rina'),
  ];

  const invoices: DataState['invoices'] = [
    {
      id: 's-i1', sample: true, seq: 1, number: 'INV-0001', clientId: 's-c1',
      client: { name: 'Northwind Bakery', contact: 'Maria', email: 'accounts@northwind.example', address: '14 Mill Lane\nPortland, OR' },
      period: pm, issueDate: prevEnd, dueDate: addDays(prevEnd, 14), currency: 'USD',
      lines: [
        { kind: 'hours', desc: 'Website refresh', detail: `3 tasks · ${monthLabel(pm)}`, minutes: 315, rate: 65, amount: 341.25, taskIds: ['s-t1', 's-t2', 's-t3'] },
        { kind: 'hours', desc: 'Holiday campaign', detail: `1 task · ${monthLabel(pm)}`, minutes: 90, rate: 70, amount: 105, taskIds: ['s-t4'] },
      ],
      discount: 0, taxRate: 0, taxLabel: 'Tax', notes: 'Thank you for your business.', status: 'paid',
      sentAt: prevEnd, paidAt: cur(3), paidNote: 'Bank transfer', createdAt: ts,
    },
    {
      id: 's-i2', sample: true, seq: 2, number: 'INV-0002', clientId: 's-c2',
      client: { name: 'Harbor & Pine Dental', contact: 'Dr. Osei', email: 'office@harborpine.example', address: '200 Harbor Road\nSeattle, WA' },
      period: pm, issueDate: prevEnd, dueDate: addDays(prevEnd, 3), currency: 'USD',
      lines: [
        { kind: 'retainer', desc: `Monthly retainer · ${monthLabel(pm)}`, detail: 'Includes 15:00 h · 9:30 used', minutes: 570, rate: 1200, amount: 1200, taskIds: ['s-t6', 's-t7', 's-t8', 's-t9'] },
      ],
      discount: 0, taxRate: 0, taxLabel: 'Tax', notes: 'Thank you for your business.', status: 'sent', sentAt: prevEnd, createdAt: ts,
    },
  ];

  const expenses: DataState['expenses'] = [
    { id: 's-e1', sample: true, date: cur(2), clientId: 's-c1', desc: 'Stock photo licence for holiday banner', amount: 39, markup: 0, billable: true, status: 'unbilled', invoiceId: null },
    { id: 's-e2', sample: true, date: cur(1), clientId: 's-c2', desc: 'Portal hosting, 12 months', amount: 240, markup: 10, billable: true, status: 'unbilled', invoiceId: null },
    { id: 's-e3', sample: true, date: cur(3), clientId: null, desc: 'Design tool seat', amount: 15, markup: 0, billable: false, status: 'unbilled', invoiceId: null },
  ];

  return { workspace, clients, projects, tasks, invoices, expenses };
}
