/**
 * Domain model shared across the app.
 * These shapes mirror the planned Rust API / Postgres tables, so the API layer can
 * replace browser storage without touching the UI.
 */

export type ID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Calendar month, `YYYY-MM`. */
export type ISOMonth = string;

export type TaskStatus = 'review' | 'billable' | 'invoiced' | 'waived' | 'internal';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
/** `overdue` is derived from `sent` + due date; it is never stored. */
export type InvoiceDisplayStatus = InvoiceStatus | 'overdue';
export type BillingModel = 'hourly' | 'retainer';
export type RoundingMode = 'nearest' | 'up' | 'down';

export interface Workspace {
  businessName: string;
  ownerName: string;
  email: string;
  address: string;
  currency: string;
  defaultRate: number;
  invoicePrefix: string;
  termsDays: number;
  taxRate: number;
  taxLabel: string;
  paymentInfo: string;
  invoiceNote: string;
  /** New client tasks skip review and go straight to billable. */
  autoApprove: boolean;
  /** Show "logged by" on entries. */
  team: boolean;
  members: string[];
  rounding: RoundingMode;
  /** Months up to and including this one are read-only. Empty = nothing locked. */
  lockedThrough: ISOMonth | '';
  /** Minutes between timer screenshots. 0 = never ask to capture. */
  screenshotMinutes: number;
}

export interface Client {
  id: ID;
  name: string;
  color: string;
  /** Small logo image as a data URL (or an https link). Empty = show the initial on `color`. */
  logo?: string;
  contact: string;
  email: string;
  address: string;
  billing: BillingModel;
  /** Hourly rate. For retainers, the rate for hours beyond the included ones. `null` = workspace default. */
  rate: number | null;
  retainerFee: number;
  includedHours: number;
  /** Monthly hours cap. 0 = no cap. */
  cap: number;
  active: boolean;
  createdAt: number;
  sample?: boolean;
}

export interface Project {
  id: ID;
  /** `null` for internal projects. */
  clientId: ID | null;
  name: string;
  /** Overrides the client rate. `null` = use client rate. */
  rate: number | null;
  internal: boolean;
  archived: boolean;
  /** All-time hours budget. `null` = none. */
  budgetHours: number | null;
  sample?: boolean;
}

export interface Task {
  id: ID;
  date: ISODate;
  projectId: ID;
  memo: string;
  link: string;
  /** Always a multiple of 15. */
  minutes: number;
  status: TaskStatus;
  by: string;
  invoiceId: ID | null;
  waiveReason?: string | null;
  /** Original entries when this task was made by merging. */
  mergedFrom?: Task[];
  createdAt: number;
  sample?: boolean;
}

export type InvoiceLineKind = 'hours' | 'retainer' | 'overage' | 'covered' | 'expense' | 'custom';

export interface InvoiceLine {
  kind: InvoiceLineKind;
  desc: string;
  detail: string;
  minutes: number;
  rate: number;
  amount: number;
  taskIds: ID[];
  expenseIds?: ID[];
}

export interface CreditNote {
  id: ID;
  number: string;
  date: ISODate;
  amount: number;
  reason: string;
}

/** Money received against an invoice. Several partial payments can add up to the total. */
export interface Payment {
  id: ID;
  date: ISODate;
  amount: number;
  /** Bank transfer, card, cash… */
  method: string;
  note: string;
}

export interface PartySnapshot {
  name: string;
  contact: string;
  email: string;
  address: string;
}

export interface SenderSnapshot {
  businessName: string;
  ownerName: string;
  email: string;
  address: string;
  paymentInfo: string;
}

export interface Invoice {
  id: ID;
  seq: number;
  number: string;
  clientId: ID;
  /** Client details frozen when the invoice was created / sent. */
  client: PartySnapshot;
  /** Sender details frozen when the invoice was sent. */
  from?: SenderSnapshot;
  period: ISOMonth;
  issueDate: ISODate;
  dueDate: ISODate;
  currency: string;
  lines: InvoiceLine[];
  discount: number;
  taxRate: number;
  taxLabel: string;
  notes: string;
  status: InvoiceStatus;
  sentAt?: ISODate | null;
  paidAt?: ISODate | null;
  paidNote?: string | null;
  credits?: CreditNote[];
  payments?: Payment[];
  createdAt: number;
  sample?: boolean;
}

export interface Expense {
  id: ID;
  date: ISODate;
  /** `null` = the business's own cost, never billed. */
  clientId: ID | null;
  desc: string;
  amount: number;
  /** Handling markup in percent. */
  markup: number;
  billable: boolean;
  status: 'unbilled' | 'invoiced';
  invoiceId: ID | null;
  sample?: boolean;
}

export interface Timer {
  projectId: ID;
  memo: string;
  /** Epoch ms. */
  start: number;
  /** Screenshots were turned on for this timer. */
  capture?: boolean;
}

export interface DataState {
  workspace: Workspace;
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  invoices: Invoice[];
  expenses: Expense[];
}

export type CollectionKey = 'clients' | 'projects' | 'tasks' | 'invoices' | 'expenses';
export type EntityOf<K extends CollectionKey> = DataState[K][number];

/** One line of the change history. */
export interface ActivityEntry {
  id: number;
  /** ISO timestamp. */
  at: string;
  actor: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'settings';
  entity: string;
  entityId: string;
  summary: string;
}
