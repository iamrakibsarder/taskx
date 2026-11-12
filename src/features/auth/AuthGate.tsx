import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, MailCheck, RefreshCw, Users } from 'lucide-react';
import { apiRequest, apiUrl, ApiError } from '@/data/gateway';
import { session, SIGNED_OUT, type Account } from '@/data/session';
import { teamApi, type InviteInfo } from '@/data/teamApi';
import { bootstrap } from '@/store';

// Clients open this without an account; it loads on its own.
const ClientPortal = lazy(() => import('@/features/portal/ClientPortal'));

/* ---------------- Auth API ---------------- */

interface SessionReply {
  token: string;
  user: { id: string; email: string; name: string; workspaceId: string };
}

export const authApi = {
  me: () => apiRequest<{ authRequired: boolean; user: Account | null; mailEnabled?: boolean }>(apiUrl!, 'GET', '/api/auth/me'),
  login: (email: string, password: string) => apiRequest<SessionReply>(apiUrl!, 'POST', '/api/auth/login', { email, password }),
  signup: (b: { email: string; password: string; name: string; businessName: string; invite?: string }) =>
    apiRequest<SessionReply>(apiUrl!, 'POST', '/api/auth/signup', b),
  logout: () => apiRequest<void>(apiUrl!, 'POST', '/api/auth/logout'),
  changePassword: (current: string, next: string) => apiRequest<void>(apiUrl!, 'POST', '/api/auth/password', { current, next }),
  forgot: (email: string) => apiRequest<void>(apiUrl!, 'POST', '/api/auth/forgot', { email }),
  reset: (token: string, password: string) => apiRequest<SessionReply>(apiUrl!, 'POST', '/api/auth/reset', { token, password }),
};

/** Ends the session on the server, forgets the token and starts fresh. */
export async function signOut(then = '/') {
  await authApi.logout().catch(() => undefined);
  session.clear();
  window.location.assign(then);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------------- Gate ---------------- */

type GateState = 'checking' | 'signedOut' | 'ready' | 'unreachable';

/** Pages that work before sign-in: `/reset-password?token=…`, `/invite/<token>` and a client's `/portal/<token>`. */
function publicPage(): { kind: 'reset' | 'invite' | 'portal'; token: string } | null {
  const { pathname, search } = window.location;
  if (pathname === '/reset-password') return { kind: 'reset', token: new URLSearchParams(search).get('token') ?? '' };
  const portal = pathname.match(/^\/portal\/([^/]+)\/?$/);
  if (portal) return { kind: 'portal', token: decodeURIComponent(portal[1]!) };
  const m = pathname.match(/^\/invite\/([^/]+)$/);
  return m ? { kind: 'invite', token: decodeURIComponent(m[1]!) } : null;
}

/**
 * Decides what to show before the app:
 * - browser mode, or a server with accounts off → the app straight away
 * - a reset or invite link → that page
 * - accounts on and no valid session → sign-in screen
 * - server down → a retry screen
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [page] = useState(() => (apiUrl ? publicPage() : null));
  const [state, setState] = useState<GateState>(apiUrl ? 'checking' : 'ready');

  const check = useCallback(async () => {
    if (!apiUrl) return void bootstrap();
    setState('checking');
    try {
      const me = await authApi.me();
      session.setAccount(me.user, !!me.mailEnabled);
      setState('ready');
      void bootstrap();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        session.clear();
        setState('signedOut');
      } else setState('unreachable');
    }
  }, []);

  useEffect(() => {
    if (page) return;
    void check();
    const onSignedOut = () => {
      session.clear();
      setState('signedOut');
    };
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, [check, page]);

  if (page?.kind === 'reset') return <ResetPassword token={page.token} />;
  if (page?.kind === 'invite') return <AcceptInvite token={page.token} />;
  if (page?.kind === 'portal')
    return (
      <Suspense fallback={null}>
        <ClientPortal token={page.token} />
      </Suspense>
    );
  if (state === 'ready') return <>{children}</>;
  if (state === 'signedOut')
    return (
      <Shell>
        <SignIn onDone={() => void check()} />
      </Shell>
    );
  return (
    <Shell>
      {state === 'checking' ? (
        <Connecting />
      ) : (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <h1 className="text-[20px] font-semibold">Can’t reach the TaskX server</h1>
          <p className="text-[13.5px] text-muted">Check that the API is running and you’re online, then try again.</p>
          <button type="button" className="btn btn-primary mt-2" onClick={check}>
            <RefreshCw /> Try again
          </button>
        </div>
      )}
    </Shell>
  );
}

const Connecting = () => (
  <div className="flex items-center justify-center gap-2 py-6 text-muted">
    <LoaderCircle className="size-4 animate-spin" /> Connecting…
  </div>
);

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <a href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] text-white shadow-brand" style={{ background: 'var(--brand-gradient)' }}>
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
          <span className="text-[20px] font-semibold tracking-tight">TaskX</span>
        </a>
        <div className="card p-6 md:p-7">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Sign in / sign up / forgot ---------------- */

type Mode = 'in' | 'up' | 'forgot';

/**
 * `invite`: sign-up joins that team; the email is fixed to the invited address.
 * `onDone` runs once a session token is saved.
 */
function SignIn({ onDone, invite, startMode = 'in', heading }: {
  /** `mode`: how they got in, `in` (signed in) or `up` (new account). */
  onDone: (mode: 'in' | 'up') => void;
  invite?: { token: string; email: string };
  startMode?: Mode;
  heading?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [f, setF] = useState({ email: invite?.email ?? '', password: '', name: '', businessName: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = (m: Mode) => (setMode(m), setError(null), setSent(false));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'up' && f.password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await authApi.forgot(f.email);
        setSent(true);
      } else {
        const r = mode === 'in' ? await authApi.login(f.email, f.password) : await authApi.signup({ ...f, invite: invite?.token });
        session.saveToken(r.token);
        onDone(mode);
      }
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };

  const title = { in: 'Welcome back', up: 'Create your account', forgot: 'Reset your password' }[mode];
  const sub = {
    in: 'Sign in to track time and send invoices.',
    up: invite ? 'Then you’ll join the team straight away.' : 'Track time, review it and bill clients from one place.',
    forgot: 'Enter your email and we’ll send you a link to choose a new password.',
  }[mode];

  if (mode === 'forgot' && sent)
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-invoiced-bg text-invoiced"><MailCheck className="size-5" /></span>
        <h1 className="text-[20px] font-semibold">Check your email</h1>
        <p className="text-[13.5px] text-muted">
          If there’s an account for <span className="font-medium text-ink">{f.email}</span>, a reset link is on its way. It works for one hour.
        </p>
        <button type="button" className="btn mt-2" onClick={() => go('in')}><ArrowLeft /> Back to sign in</button>
      </div>
    );

  return (
    <>
      {heading}
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
        {mode === 'up' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label="Your name">
              <input className="input" value={f.name} onChange={set('name')} autoComplete="name" autoFocus />
            </AuthField>
            {!invite && (
              <AuthField label="Business name">
                <input className="input" value={f.businessName} onChange={set('businessName')} autoComplete="organization" placeholder="Optional" />
              </AuthField>
            )}
          </div>
        )}
        <AuthField label="Email">
          <input
            className="input read-only:bg-surface-2 read-only:text-muted"
            type="email"
            value={f.email}
            onChange={set('email')}
            autoComplete="email"
            readOnly={!!invite}
            required
            autoFocus={mode !== 'up' && !invite}
          />
        </AuthField>
        {mode !== 'forgot' && (
          <AuthField
            label="Password"
            hint={mode === 'up' ? 'At least 8 characters.' : undefined}
            action={mode === 'in' && <button type="button" className="text-[12.5px] font-medium text-brand-700 hover:underline" onClick={() => go('forgot')}>Forgot password?</button>}
          >
            <span className="relative">
              <input
                className="input pr-10"
                type={show ? 'text' : 'password'}
                value={f.password}
                onChange={set('password')}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                required
                autoFocus={!!invite && mode === 'in'}
              />
              <button type="button" className="btn-icon absolute top-0.5 right-0.5" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </AuthField>
        )}
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary h-10" disabled={busy || !f.email || (mode !== 'forgot' && !f.password)}>
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
          {{ in: 'Sign in', up: 'Create account', forgot: 'Send reset link' }[mode]}
        </button>
      </form>
      <p className="mt-5 text-center text-[13px] text-muted">
        {mode === 'forgot' ? (
          <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => go('in')}>Back to sign in</button>
        ) : (
          <>
            {mode === 'in' ? 'New to TaskX?' : 'Already have an account?'}{' '}
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => go(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? 'Create an account' : 'Sign in'}
            </button>
          </>
        )}
      </p>
    </>
  );
}

function AuthField({ label, hint, action, children }: { label: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="label">{label}</span>
        {action}
      </span>
      {children}
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

/* ---------------- Reset password ---------------- */

function ResetPassword({ token }: { token: string }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is incomplete. Ask for a new one.');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      const r = await authApi.reset(token, pw);
      session.saveToken(r.token);
      window.location.assign('/');
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold">Choose a new password</h1>
      <p className="mt-1 text-[13.5px] text-muted">You’ll be signed in, and signed out everywhere else.</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
        <AuthField label="New password" hint="At least 8 characters.">
          <span className="relative">
            <input className="input pr-10" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus disabled={!token} />
            <button type="button" className="btn-icon absolute top-0.5 right-0.5" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff /> : <Eye />}
            </button>
          </span>
        </AuthField>
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary h-10" disabled={busy || !pw || !token}>
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Save and sign in
        </button>
      </form>
      <p className="mt-5 text-center text-[13px]">
        <a href="/" className="font-medium text-brand-700 hover:underline">Back to sign in</a>
      </p>
    </Shell>
  );
}

/* ---------------- Accept an invite ---------------- */

function AcceptInvite({ token }: { token: string }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await teamApi.inviteInfo(token));
    } catch (e) {
      return setError(message(e));
    }
    if (!session.token()) return setMe(null);
    try {
      setMe((await authApi.me()).user);
    } catch {
      session.clear();
      setMe(null);
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  const accept = async () => {
    setBusy(true);
    try {
      await teamApi.acceptInvite(token);
      window.location.assign('/');
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  const heading = info && (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
      <Users className="mt-0.5 size-5 flex-none text-brand-700" />
      <p className="text-[13px] text-ink-2">
        <span className="font-medium">{info.invitedBy || 'Someone'}</span> invited you to join{' '}
        <span className="font-medium">{info.workspaceName}</span> as {info.role === 'admin' ? 'an admin' : 'a member'}.
      </p>
    </div>
  );

  if (error)
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[20px] font-semibold">Can’t use this invite</h1>
          <p className="text-[13.5px] text-muted">{error}</p>
          <a href="/" className="btn mt-2">Go to TaskX</a>
        </div>
      </Shell>
    );
  if (!info || me === undefined) return <Shell><Connecting /></Shell>;

  // Signed in already.
  if (me)
    return (
      <Shell>
        {heading}
        {me.email === info.email ? (
          <>
            <h1 className="text-[22px] font-semibold">Join {info.workspaceName}</h1>
            <p className="mt-1 text-[13.5px] text-muted">You’ll switch to it now. Your other workspaces stay in the account menu.</p>
            <button type="button" className="btn btn-primary mt-6 h-10 w-full" onClick={accept} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Join workspace
            </button>
          </>
        ) : (
          <>
            <h1 className="text-[20px] font-semibold">This invite is for someone else</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              It was sent to <span className="font-medium text-ink">{info.email}</span>, but you’re signed in as {me.email}.
            </p>
            <button type="button" className="btn mt-6 w-full" onClick={() => void signOut(window.location.pathname)}>
              Sign out and continue as {info.email}
            </button>
          </>
        )}
      </Shell>
    );

  // Signed out: sign in (then accept) or create the account with the invite.
  return (
    <Shell>
      <SignIn
        heading={heading}
        invite={{ token, email: info.email }}
        startMode={info.hasAccount ? 'in' : 'up'}
        // A new account made with the invite is already in the team; signing in still has to accept.
        onDone={(how) => (how === 'up' ? window.location.assign('/') : void accept())}
      />
    </Shell>
  );
}
