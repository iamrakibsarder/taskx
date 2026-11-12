import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Camera, CameraOff, CalendarRange, ChartColumn, Check, ChevronsUpDown, CloudOff, Command, Ellipsis, FileText, History, House, ListChecks,
  LoaderCircle, LogOut, Monitor, Moon, Play, Plus, Search, Settings, Sparkles, Square, Sun, Timer, TriangleAlert, Users, Wallet, X,
} from 'lucide-react';
import { useAppSelector, useData } from '@/store';
import { ClientAvatar, Menu, type MenuItem } from '@/components/ui';
import { useAccount } from '@/data/session';
import { gateway } from '@/data/gateway';
import { signOut } from '@/features/auth/AuthGate';
import { useSyncStatus } from '@/store/syncStatus';
import { setTheme, useTheme, type ThemePref } from '@/lib/theme';
import { useModal, Dialog } from '@/components/ui/Modal';
import { CommandPalette, type PaletteAction } from './CommandPalette';
import { clock, useElapsed, useGlobalActions } from '@/features/global';
import { stopCapture, useCapture } from '@/features/capture/capture';
import { JournalDialog } from '@/features/tasks/TaskDialogs';
import { useProjectLabel } from '@/components/ProjectSelect';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Home', icon: House, key: 'h' },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, key: 't' },
  { to: '/timesheet', label: 'Timesheet', icon: CalendarRange, key: 'w' },
  { to: '/billing', label: 'Billing', icon: Wallet, key: 'b' },
  { to: '/invoices', label: 'Invoices', icon: FileText, key: 'i' },
  { to: '/reports', label: 'Reports', icon: ChartColumn, key: 'r' },
  { to: '/clients', label: 'Clients', icon: Users, key: 'c' },
  { to: '/activity', label: 'Activity', icon: History, key: 'a' },
] as const;

const THEMES: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
];

/** Theme choices plus sign out, shared by the sidebar account menu and the mobile sheet. */
function useAccountItems(): MenuItem[] {
  const theme = useTheme();
  const account = useAccount();
  const items: MenuItem[] = THEMES.map((t) => ({
    label: t.label,
    icon: theme === t.value ? <Check /> : <t.icon />,
    onSelect: () => setTheme(t.value),
  }));
  if (account) items.push({ label: 'Sign out', icon: <LogOut />, onSelect: () => void signOut(), danger: true });
  return items;
}

function AccountBox() {
  const s = useData();
  const account = useAccount();
  const items = useAccountItems();
  const name = account?.name || s.workspace.ownerName || 'You';
  return (
    <Menu
      side="top"
      align="left"
      items={items}
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="mt-2 flex w-[220px] items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left transition hover:bg-surface-2"
        >
          <span className="grid size-7 flex-none place-items-center rounded-full bg-night text-[11px] font-semibold text-white">
            {initials(name || s.workspace.businessName || 'Me')}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium">{name}</span>
            <span className="block truncate text-[11.5px] text-faint">{account?.email || s.workspace.businessName}</span>
          </span>
          <ChevronsUpDown className="size-4 flex-none text-faint" />
        </button>
      )}
    />
  );
}

/** API mode: Saving… / Saved / Not saved, so a refused or lost write is never silent. */
function SyncBadge() {
  const st = useSyncStatus();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!st.savedAt) return;
    const t = setTimeout(() => tick((n) => n + 1), 2600);
    return () => clearTimeout(t);
  }, [st.savedAt]);
  if (gateway.kind !== 'http') return null;
  const base = 'hidden h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] sm:flex';
  if (st.pending > 0)
    return (
      <span className={cn(base, 'text-faint')} aria-live="polite">
        <LoaderCircle className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  if (st.offline)
    return (
      <span className={cn(base, 'text-danger')} title={st.error ?? ''}>
        <CloudOff className="size-3.5" /> Offline
      </span>
    );
  if (st.error)
    return (
      <span className={cn(base, 'text-danger')} title={st.error}>
        <TriangleAlert className="size-3.5" /> Not saved
      </span>
    );
  if (st.savedAt && Date.now() - st.savedAt < 2500)
    return (
      <span className={cn(base, 'text-invoiced')}>
        <Check className="size-3.5" /> Saved
      </span>
    );
  return null;
}

const MOBILE_MAIN = ['/', '/tasks', '/timesheet', '/invoices'];

function MoreSheet({ onClose }: { onClose: () => void }) {
  const items = useAccountItems();
  const extra = NAV.filter((n) => !MOBILE_MAIN.includes(n.to));
  return (
    <Dialog title="More" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {[...extra, { to: '/settings', label: 'Settings', icon: Settings, key: '' }].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1.5 rounded-lg border border-line py-3 text-[12.5px] font-medium text-muted', isActive && 'border-brand-200 bg-brand-50 text-brand-700')
            }
          >
            <Icon className="size-5" strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
      </div>
      <div className="flex flex-col border-t border-line pt-3">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={() => (it.onSelect(), onClose())}
            className={cn('flex items-center gap-3 rounded-md px-2 py-2.5 text-[14px] text-ink-2 [&_svg]:size-4 [&_svg]:text-faint', it.danger && 'text-danger [&_svg]:text-danger')}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[9px] text-white shadow-brand" style={{ background: 'var(--brand-gradient)' }}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">TaskX</span>
    </div>
  );
}

function Sidebar() {
  const s = useData();
  const reviewCount = s.tasks.filter((t) => t.status === 'review').length;
  const clients = s.clients.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name));
  const loc = useLocation();
  const activeClient = new URLSearchParams(loc.search).get('client');
  return (
    <aside className="sticky top-0 hidden h-screen w-[244px] flex-none flex-col border-r border-line bg-surface px-3 pt-5 pb-4 md:flex">
      <div className="px-2.5 pb-6"><Logo /></div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink',
                isActive && 'bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700',
              )
            }
          >
            <Icon className="size-[18px]" strokeWidth={1.9} />
            <span className="flex-1">{label}</span>
            {to === '/tasks' && reviewCount > 0 && (
              <span className="num rounded-full bg-review-bg px-1.5 text-[11px] font-medium text-review">{reviewCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      {clients.length > 0 && (
        <div className="mt-7 flex min-h-0 flex-col">
          <div className="px-2.5 pb-1.5 text-[11.5px] font-medium text-faint">Clients</div>
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {clients.map((c) => (
              <NavLink
                key={c.id}
                to={`/tasks?client=${c.id}`}
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink',
                  activeClient === c.id && loc.pathname === '/tasks' && 'bg-surface-2 text-ink',
                )}
              >
                <ClientAvatar client={c} size={18} />
                <span className="truncate">{c.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink', isActive && 'bg-brand-50 text-brand-700')
          }
        >
          <Settings className="size-[18px]" strokeWidth={1.9} /> Settings
        </NavLink>
        <AccountBox />
      </div>
    </aside>
  );
}

function CaptureBadge() {
  const { timer, resumeCapture } = useGlobalActions();
  const cap = useCapture();
  if (!timer?.capture) return null;
  if (!cap.active)
    return (
      <button type="button" className="btn-icon text-warning" onClick={resumeCapture} title="Screenshots paused. Click to share your screen again.">
        <CameraOff />
      </button>
    );
  const last = cap.lastAt ? new Date(cap.lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'starting…';
  return (
    <span className="flex h-8 items-center gap-1 rounded-md px-1.5 text-brand-700" title={`Screenshots on · ${cap.shots} saved · last ${last}${cap.lastPath ? `\n${cap.lastPath}` : ''}`}>
      <Camera className="size-4" />
      <span className="num text-[12px]">{cap.shots}</span>
    </span>
  );
}

function TimerWidget() {
  const { timer, toggleTimer, discardTimer } = useGlobalActions();
  const sec = useElapsed(timer?.start);
  const label = useProjectLabel();
  // Timer stopped or discarded anywhere → stop sharing the screen.
  useEffect(() => {
    if (!timer) stopCapture();
  }, [timer]);
  if (!timer)
    return (
      <button type="button" className="btn btn-ghost max-sm:px-2" onClick={toggleTimer} title="Start timer (T)">
        <Play className="text-brand-600" /> <span className="max-sm:hidden">Timer</span>
      </button>
    );
  const l = label(timer.projectId);
  return (
    <div className="flex h-9 items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 pr-1 pl-2.5">
      <span className="relative mr-1 flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
      </span>
      <span className="hidden max-w-[150px] truncate text-[12.5px] text-brand-800 lg:inline">{timer.memo || l.project}</span>
      <span className="num ml-1 text-[13.5px] font-medium text-brand-800">{clock(sec)}</span>
      <CaptureBadge />
      <button type="button" className="btn-icon text-brand-700" onClick={toggleTimer} aria-label="Stop timer and log" title="Stop and log (T)">
        <Square className="fill-current" />
      </button>
      <button type="button" className="btn-icon" onClick={discardTimer} aria-label="Discard timer">
        <X />
      </button>
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['N', 'New task'], ['T', 'Start or stop the timer'], ['⌘ K', 'Search and jump'], ['G then H', 'Home'], ['G then T', 'Tasks'],
    ['G then W', 'Timesheet'], ['G then B', 'Billing'], ['G then I', 'Invoices'], ['G then R', 'Reports'], ['G then C', 'Clients'], ['G then A', 'Activity'], ['?', 'This list'],
  ];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="text-muted">{d}</span>
            <span className="flex gap-1">{k.split(' ').map((x) => (x === 'then' ? <span key={x} className="text-[11px] text-faint">then</span> : <span key={x} className="kbd">{x}</span>))}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function AppShell() {
  const modal = useModal();
  const nav = useNavigate();
  const loc = useLocation();
  const { newTask, toggleTimer } = useGlobalActions();
  const status = useAppSelector((s) => s.data.status);
  const gPressed = useRef(0);

  const paletteExtra = useMemo<PaletteAction[]>(
    () => [
      { id: 'a-new', label: 'New task', hint: 'N', icon: <Plus />, group: 'Actions', run: () => newTask() },
      { id: 'a-timer', label: 'Start or stop timer', hint: 'T', icon: <Timer />, group: 'Actions', run: toggleTimer },
      { id: 'a-day', label: 'Write my day', icon: <Sparkles />, group: 'Actions', run: () => modal.open((c) => <JournalDialog onClose={c} />) },
    ],
    [newTask, toggleTimer, modal],
  );
  const openPalette = () => modal.open((close) => <CommandPalette onClose={close} extra={paletteExtra} />);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable], [role=dialog]')) return;
      const k = e.key.toLowerCase();
      if (Date.now() - gPressed.current < 900) {
        gPressed.current = 0;
        const hit = NAV.find((n) => n.key === k);
        if (hit) (e.preventDefault(), nav(hit.to));
        return;
      }
      if (k === 'g') gPressed.current = Date.now();
      else if (k === 'n') (e.preventDefault(), loc.pathname === '/tasks' ? document.getElementById('quick-memo')?.focus() : newTask());
      else if (k === 't') (e.preventDefault(), toggleTimer());
      else if (e.key === '?') modal.open((c) => <ShortcutsDialog onClose={c} />);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-canvas/85 px-4 backdrop-blur-md md:px-8">
          <div className="md:hidden"><Logo /></div>
          <button
            type="button"
            onClick={openPalette}
            className="ml-auto flex h-9 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-faint transition hover:border-line-2 max-sm:w-9 max-sm:justify-center max-sm:px-0 md:mr-auto md:ml-0 md:w-[300px]"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left max-sm:hidden">Search or jump to…</span>
            <span className="kbd max-sm:hidden"><Command className="inline size-2.5" /> K</span>
          </button>
          <SyncBadge />
          <TimerWidget />
          <button type="button" className="btn btn-primary max-sm:w-9 max-sm:px-0" onClick={() => newTask()} title="New task (N)">
            <Plus /> <span className="max-sm:hidden">New task</span>
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-16">
          {status === 'loading' && <div className="py-20 text-center text-faint">Loading…</div>}
          {status === 'error' && <div className="py-20 text-center text-danger">Couldn’t load your data. Check the API and refresh.</div>}
          {status === 'ready' && <Outlet />}
        </main>
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-faint', isActive && 'text-brand-700')}
          >
            <Icon className="size-5" strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => modal.open((c) => <MoreSheet onClose={c} />)}
          className={cn(
            'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-faint',
            !MOBILE_MAIN.includes(loc.pathname) && !loc.pathname.startsWith('/invoices/') && 'text-brand-700',
          )}
        >
          <Ellipsis className="size-5" strokeWidth={1.9} />
          More
        </button>
      </nav>
    </div>
  );
}
