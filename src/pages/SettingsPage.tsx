import { useState, type FormEvent, type ReactNode } from 'react';
import { Download, FolderOpen, KeyRound, LogOut, Monitor, Moon, Sun, Upload, Lock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { setTheme, useTheme } from '@/lib/theme';
import { can, session, useAccount } from '@/data/session';
import { authApi, signOut } from '@/features/auth/AuthGate';
import type { DataState, RoundingMode, Workspace } from '@/types/domain';
import { Field, PageHeader, Segmented } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { importData, loadSampleIntoServer, resetToSample, store, useAppDispatch, useData } from '@/store';
import { dataActions } from '@/store/dataSlice';
import { clearSampleData } from '@/store/operations';
import { gateway } from '@/data/gateway';
import { useScreenshotFolder } from '@/features/global';
import { folderSupported } from '@/features/capture/storage';
import { SCREENSHOTS } from '@/lib/flags';
import { monthLabel, num } from '@/lib/format';
import { toast } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-7 first:border-t-0 first:pt-0 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
      </div>
      <div className="flex max-w-[560px] flex-col gap-4">{children}</div>
    </section>
  );
}

function ScreenshotFolder() {
  const f = useScreenshotFolder();
  const pattern = 'Name / clients / Client / Project / 2026-11 / week-1 / 2026-11-06_14-05-00.jpg';
  if (!f.needsFolder)
    return <p className="text-[13px] text-muted">Saved by the TaskX server, as <span className="font-mono text-[12px]">{pattern}</span></p>;
  if (!folderSupported())
    return <p className="rounded-lg bg-review-bg px-3 py-2 text-[13px] text-review">Saving to a folder needs Chrome or Edge. Safari and Firefox can’t write to folders.</p>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FolderOpen className="size-4 text-faint" />
        <span className="flex-1 text-[13.5px]">
          {f.access.state === 'missing' || f.access.state === 'checking' ? <span className="text-muted">No folder chosen</span> : <span className="font-medium">{f.access.name}</span>}
          {f.access.state === 'prompt' && <span className="ml-2 text-[12px] text-review">needs permission again</span>}
        </span>
        {f.access.state === 'prompt' && <button type="button" className="btn btn-sm" onClick={f.allow}>Allow</button>}
        <button type="button" className="btn btn-sm" onClick={f.choose}>{f.access.state === 'missing' ? 'Choose folder' : 'Change'}</button>
      </div>
      <p className="font-mono text-[11.5px] break-all text-faint">{pattern}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-5 w-9 flex-none rounded-full bg-line-2 transition aria-checked:bg-brand-600"
      >
        <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function PasswordForm() {
  const [f, setF] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.next.length < 8) return toast.error('Use a new password of at least 8 characters.');
    setBusy(true);
    try {
      await authApi.changePassword(f.current, f.next);
      setF({ current: '', next: '' });
      toast('Password changed. Other devices were signed out.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Current password">
        <input type="password" className="input" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field label="New password">
        <input type="password" className="input" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      </Field>
      <button type="submit" className="btn" disabled={busy || !f.current || !f.next}>
        <KeyRound /> Change
      </button>
    </form>
  );
}

const REMINDER_CHOICES = [-7, -3, -1, 0, 1, 3, 7, 14, 30];
export const reminderLabel = (d: number) =>
  d === 0 ? 'On the due date' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} before` : `${d} day${d === 1 ? '' : 's'} late`;

function RemindersSection({ w, set }: { w: Workspace; set: (p: Partial<Workspace>) => void }) {
  const days = w.reminderDays ?? [];
  const toggle = (d: number) =>
    set({ reminderDays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b) });
  return (
    <Section title="Payment reminders" sub="TaskX emails clients about unpaid invoices, with the invoice PDF attached. You can turn it off for a client in their details.">
      <Toggle
        checked={w.remindersOn}
        onChange={(remindersOn) => set({ remindersOn, reminderDays: days.length ? days : [-3, 0, 7, 14] })}
        label="Send payment reminders"
        hint={session.mailEnabled() ? 'Only invoices that are sent and not fully paid.' : 'Email isn’t set up on the server yet, so nothing will be sent until it is.'}
      />
      {w.remindersOn && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Send one</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reminder days">
            {REMINDER_CHOICES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() => toggle(d)}
                className="chip border border-line bg-surface text-ink-2 aria-pressed:border-brand-600 aria-pressed:bg-brand-50 aria-pressed:text-brand-700"
              >
                {reminderLabel(d)}
              </button>
            ))}
          </div>
          {!days.length && <p className="text-[12.5px] text-danger">Pick at least one.</p>}
          <p className="text-[12.5px] text-faint">Times are in UTC. A reminder more than 3 days past its date is skipped, so turning this on never sends a burst of old reminders.</p>
        </div>
      )}
    </Section>
  );
}

export default function SettingsPage() {
  const theme = useTheme();
  const account = useAccount();
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const [w, setW] = useState<Workspace>(s.workspace);
  const [member, setMember] = useState('');
  // Members see the workspace settings but only owners and admins change them.
  const admin = can(account, 'admin');
  const dirty = admin && JSON.stringify(w) !== JSON.stringify(s.workspace);
  const invalid = w.remindersOn && !w.reminderDays?.length;
  const set = (p: Partial<Workspace>) => setW((x) => ({ ...x, ...p }));
  const save = () => {
    dispatch(dataActions.setWorkspace({ ...w, defaultRate: num(w.defaultRate), termsDays: num(w.termsDays), taxRate: num(w.taxRate), screenshotMinutes: num(w.screenshotMinutes) }));
    toast('Settings saved');
  };
  const hasSample = [...s.clients, ...s.projects, ...s.tasks, ...s.invoices, ...s.expenses].some((x) => x.sample);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        sub={admin ? 'Your business, invoices and how time is counted.' : `Only owners and admins of ${account?.workspaceName ?? 'this workspace'} can change these. Your appearance and password are yours to change.`}
        actions={dirty && (
          <>
            <button type="button" className="btn" onClick={() => setW(s.workspace)}>Discard</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={invalid}>Save changes</button>
          </>
        )}
      />
      <div className="card px-5 py-7 md:px-8">
        <fieldset disabled={!admin} className="contents">
        <Section title="Business" sub="Shown on every invoice you send.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><input className="input" value={w.businessName} onChange={(e) => set({ businessName: e.target.value })} /></Field>
            <Field label="Your name"><input className="input" value={w.ownerName} onChange={(e) => set({ ownerName: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input type="email" className="input" value={w.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Address"><textarea className="input" rows={2} value={w.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        </Section>

        <Section title="Invoices" sub="Defaults for new invoices. Each invoice can still be edited while it’s a draft.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Currency">
              <select className="input" value={w.currency} onChange={(e) => set({ currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BDT', 'INR', 'SGD', 'AED'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Default rate"><input type="number" min="0" className="input num" value={w.defaultRate} onChange={(e) => set({ defaultRate: +e.target.value })} /></Field>
            <Field label="Number prefix"><input className="input" value={w.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} /></Field>
            <Field label="Due in (days)"><input type="number" min="0" className="input num" value={w.termsDays} onChange={(e) => set({ termsDays: +e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax label"><input className="input" value={w.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} placeholder="VAT, GST…" /></Field>
            <Field label="Tax %"><input type="number" min="0" step="0.1" className="input num" value={w.taxRate || ''} onChange={(e) => set({ taxRate: +e.target.value })} placeholder="0" /></Field>
          </div>
          <Field label="How to pay"><textarea className="input" rows={3} value={w.paymentInfo} onChange={(e) => set({ paymentInfo: e.target.value })} placeholder="Bank details, payment link…" /></Field>
          <Field label="Default note"><textarea className="input" rows={2} value={w.invoiceNote} onChange={(e) => set({ invoiceNote: e.target.value })} placeholder="Thank you for your business." /></Field>
        </Section>

        {gateway.kind === 'http' && <RemindersSection w={w} set={set} />}

        <Section title="Time" sub="All time is kept in 15-minute steps.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">Rounding</span>
            <Segmented<RoundingMode>
              label="Rounding"
              value={w.rounding}
              onChange={(rounding) => set({ rounding })}
              options={[{ value: 'nearest', label: 'Nearest' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }]}
            />
          </div>
          <Toggle checked={w.autoApprove} onChange={(autoApprove) => set({ autoApprove })} label="Skip review" hint="New client tasks go straight to approved. Good if you work alone." />
        </Section>

        {SCREENSHOTS && (
        <Section title="Screenshots" sub="While the timer runs, TaskX can save a screenshot of the screen you share. You choose the screen each time.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">Take one every</span>
            <select className="input w-auto" value={w.screenshotMinutes} onChange={(e) => set({ screenshotMinutes: +e.target.value })} aria-label="Screenshot interval">
              <option value={0}>Off</option>
              {[2, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          {w.screenshotMinutes > 0 && <ScreenshotFolder />}
        </Section>
        )}

        <Section title="Team" sub="Track who logged each task by name.">
          <Toggle checked={w.team} onChange={(team) => set({ team })} label="Show who logged time" />
          {w.team && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="chip bg-surface-2 text-ink">{w.ownerName || 'You'}</span>
                {w.members.map((m) => (
                  <span key={m} className="chip bg-surface-2 pr-1 text-ink">
                    {m}
                    <button type="button" className="grid size-5 place-items-center rounded-full hover:bg-surface-3" onClick={() => set({ members: w.members.filter((x) => x !== m) })} aria-label={`Remove ${m}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = member.trim();
                  if (n && !w.members.includes(n) && n !== w.ownerName) set({ members: [...w.members, n] });
                  setMember('');
                }}
              >
                <input className="input max-w-[240px]" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Add a name" />
                <button type="submit" className="btn"><Plus /> Add</button>
              </form>
            </div>
          )}
        </Section>

 </fieldset>
        <Section title="Appearance" sub="Follow your device, or always use light or dark.">
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: <><Monitor /> System</> },
              { value: 'light', label: <><Sun /> Light</> },
              { value: 'dark', label: <><Moon /> Dark</> },
            ]}
          />
        </Section>

        {account && (
          <Section title="Account" sub={`Signed in as ${account.email}.`}>
            <PasswordForm />
            <button type="button" className="btn self-start" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </button>
          </Section>
        )}

        <fieldset disabled={!admin} className="contents">
        <Section title="Locked months" sub="Locked months can’t be edited. Approving, waiving and invoicing still work.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-[13.5px]">
              <Lock className="size-4 text-faint" /> {s.workspace.lockedThrough ? `Through ${monthLabel(s.workspace.lockedThrough)}` : 'Nothing locked'}
            </span>
            <input
              type="month"
              className="input w-auto"
              value={w.lockedThrough}
              onChange={(e) => set({ lockedThrough: e.target.value })}
              aria-label="Lock through month"
            />
            {w.lockedThrough && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ lockedThrough: '' })}>Unlock all</button>}
          </div>
        </Section>

        </fieldset>
        <Section title="Data" sub={gateway.snapshot ? 'Stored in this browser for now. The server version keeps it in your database.' : 'Stored on your server.'}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const { workspace, clients, projects, tasks, invoices, expenses } = s;
                downloadFile(`taskx-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ workspace, clients, projects, tasks, invoices, expenses }, null, 2), 'application/json');
              }}
            >
              <Download /> Export backup
            </button>
            {admin && <label className="btn cursor-pointer">
              <Upload /> Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void file.text().then((text) => {
                    let data: DataState;
                    try {
                      data = JSON.parse(text) as DataState;
                      if (!data.workspace || !Array.isArray(data.tasks)) throw new Error();
                    } catch {
                      return toast.error('That file isn’t a TaskX backup.');
                    }
                    modal.open((c) => (
                      <Confirm
                        title="Replace everything with this backup?"
                        body={`${data.clients?.length ?? 0} clients, ${data.tasks.length} tasks and ${data.invoices?.length ?? 0} invoices. What's here now is replaced.`}
                        confirm="Import"
                        danger
                        onClose={c}
                        onConfirm={() =>
                          void importData(data)
                            .then(() => (setW(store.getState().data.workspace), toast('Backup imported')))
                            .catch((err: unknown) => toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`))
                        }
                      />
                    ));
                  });
                }}
              />
            </label>}
            {hasSample && (
              <button
                type="button"
                className="btn"
                onClick={() => modal.open((c) => <Confirm title="Clear sample data?" body="Removes the demo clients, projects, tasks and invoices. Anything you added stays." confirm="Clear" onClose={c} onConfirm={() => dispatch(clearSampleData())} />)}
              >
                <Trash2 /> Clear sample data
              </button>
            )}
            {!gateway.reset && !s.clients.length && !s.tasks.length && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void loadSampleIntoServer()
                    .then(() => toast('Sample data added. Clear it any time from here.'))
                    .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)))
                }
              >
                <RotateCcw /> Load sample data
              </button>
            )}
            {gateway.reset && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() =>
                  modal.open((c) => (
                    <Confirm title="Start over with sample data?" body="Everything in this browser is replaced with the demo data. Export a backup first if you need it." confirm="Reset" danger onClose={c}
                      onConfirm={() => void resetToSample().then(() => (setW(defaultsAfterReset()), toast('Sample data restored')))} />
                  ))
                }
              >
                <RotateCcw /> Reset to sample
              </button>
            )}
          </div>
        </Section>
      </div>
      {dirty && (
        <div className="sticky bottom-6 z-10 flex animate-pop items-center justify-between gap-3 self-center rounded-xl bg-night py-2 pr-2 pl-4 text-white shadow-pop max-md:bottom-20">
          <span className="text-[13px]">Unsaved changes</span>
          <button type="button" className="btn btn-sm border-white/10 bg-white/10 text-white shadow-none hover:bg-white/20" onClick={() => setW(s.workspace)}>Discard</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button>
        </div>
      )}
    </div>
  );
}

const defaultsAfterReset = () => store.getState().data.workspace;
