# TaskX — frontend

Time tracking, review and client invoicing for freelancers and small teams. Log time in 15-minute steps, approve or waive it, preview each client's bill, and send invoices from one dashboard.

React 19 + TypeScript + Vite + Tailwind CSS v4 + Redux Toolkit. The Rust API lives in a separate repo (`taskx-backend`).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # billing and parsing unit tests
```

The app starts with sample data that's stored in your browser. **Settings → Data** has options to clear the samples or reset them.

## Connect the API

Copy `.env.example` to `.env` and set:

```
VITE_API_URL=http://localhost:8080
```

In `npm run dev`, the dev server forwards `/api` to that URL, so the browser only ever talks to `localhost:5173`. That avoids CORS and browser blocking. Production builds call the URL directly.

When `VITE_API_URL` is empty the app uses browser storage (`LocalGateway`). When it's set, every change goes to the API instead (`HttpGateway`). Nothing in the UI changes.

To move browser data to the server:

1. Before setting the URL, go to **Settings → Export backup**.
2. Set `VITE_API_URL` and restart.
3. Go to **Settings → Import backup**.

In API mode, writes are sent one at a time in order. If the server rejects a change, its message is shown as a toast.

### API contract the backend must implement

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/bootstrap` | — | `{ workspace, clients, projects, tasks, invoices, expenses }` |
| PUT | `/api/{collection}/{id}` | full entity | entity |
| PATCH | `/api/{collection}/{id}` | partial entity | entity |
| DELETE | `/api/{collection}/{id}` | — | 204 |
| PUT | `/api/workspace` | workspace | workspace |
| POST | `/api/import` | `{ workspace, clients, … }` | same, as saved |
| POST | `/api/screenshots?user=&client=&project=&takenAt=` | image bytes | `{ path }` |

`collection` is one of `clients`, `projects`, `tasks`, `invoices` or `expenses`. The shapes are defined in `src/types/domain.ts`, and that file is the source of truth for the database tables. A few rules for the backend:

- Minutes are always whole multiples of 15.
- Dates are `YYYY-MM-DD` and months are `YYYY-MM`.
- `overdue` is never stored. It is derived from `sent` plus a due date in the past.

## Structure

```
src/
  types/domain.ts         Domain model (mirrors the API / DB)
  domain/                 Pure logic, no React: billing math, insights, invoice export, journal parser (+ tests)
  data/gateway.ts         LocalGateway (browser) / HttpGateway (Rust API)
  data/sample.ts          Demo workspace
  store/                  Redux: data + ui slices, sync middleware, thunks in operations.ts
  components/ui/          Design-system primitives: Modal, Toaster, TimeWheel, Pill, StatGrid, Menu…
  components/layout/      App shell, sidebar, top bar, command palette
  features/               Dialogs and widgets by area (tasks, billing, invoices, clients)
  pages/                  One file per route
  styles/index.css        Design tokens + component classes
```

## Design system

All colors, fonts, radii, shadows and motion live as tokens in `src/styles/index.css` (`@theme`). Tailwind turns each token into a utility class, for example `bg-surface`, `text-muted`, `rounded-lg`, `shadow-card` or `bg-billable-bg`. To retheme the app, change a token there.

- **Type:** Be Vietnam Pro for UI, JetBrains Mono for numbers (`.num`). Both are bundled, so no font CDN is needed.
- **Brand:** violet gradient `#6A0BE4 → #9747FE` (`--brand-gradient`), with a soft glow on primary buttons.
- **Status colors:** `review` amber, `billable` violet, `invoiced` green, `waived` grey, `internal` teal, `danger` red.
- **Components:** `.btn` (with `-primary`, `-dark`, `-soft`, `-ghost`, `-danger`, `-sm`, `-icon` variants), `.input`, `.card`, `.pill`, `.chip`, `.table`, `.track`, `.kbd`.

## Features

- **Tasks:** one-line quick add, a −/+ stepper with a watch-style time wheel (15-minute steps), and one-click repeats of recent tasks.
  - "Write my day" turns free text into several tasks at once.
  - The list groups by day, project or status. A board view lets you drag tasks between statuses.
  - Bulk approve, waive with a reason, merge and split, and "log again today".
- **Timer:** start/stop from the top bar (or press `T`). Stopping opens the task rounded to 15 minutes.
- **Screenshots:** the timer can ask to share your screen and save a screenshot every 5 minutes. You can change the interval in Settings.
  - Files are saved as `Name/clients/Client/Project/YYYY-MM/week-N/YYYY-MM-DD_HH-MM-SS.jpg`.
  - Without the API, they go to a folder you pick once. That needs Chrome or Edge.
  - With the API, the server saves them.
  - On a Mac, the first time, allow the browser under **System Settings → Privacy & Security → Screen Recording**.
- **Home:** this week's hours, money ready to invoice, outstanding and paid totals, a 14-day chart, a to-do list (old reviews, overdue invoices, caps, budgets), clients and budgets.
- **Timesheet:** week grid. Click a cell to add or remove time. Copy last week.
- **Billing:** a monthly card per client.
  - Each card shows time in review, approved, waived and invoiced, the invoice preview, a per-project breakdown and progress against the monthly cap.
  - Expenses (with markup) go on the next invoice.
  - You can lock a month.
- **Invoices:**
  - Status tabs; drafts are editable (lines, discount, tax, notes, dates).
  - Sending works through your mail app with the invoice file attached.
  - Record payments, mark unpaid, issue credit notes, void.
  - Download the invoice as HTML or the timesheet as CSV.
- **Pricing:** hourly or retainer (fee + included hours + overage). Rates come from the project override first, then the client rate, then the workspace default.
- **Reports:** by client, project or person across month, quarter, year or all time. Includes effective rate and CSV export.
- **Clients & projects:** logos (uploaded images are shrunk to a small file stored with the client), colors, rates, caps, budgets, archive, internal projects.
- **Settings:** business details, invoice defaults, rounding (nearest, up or down), skip review, team names, locked months, screenshots, backup export and import.
- **Keyboard:**

  | Key | Action |
  |---|---|
  | `N` | New task |
  | `T` | Start or stop the timer |
  | `⌘K` / `Ctrl+K` | Search and jump |
  | `G` then `H` / `T` / `W` / `B` / `I` / `R` / `C` | Go to a page |
  | `?` | List of shortcuts |

## Not yet (needs the backend)

- Sign-in and real user accounts.
- Sending email from the server, with a PDF attached.
- Online payments (Stripe).
- Multi-device sync.
- A client portal. It is intentionally out of scope for now; everything is managed from one dashboard.
