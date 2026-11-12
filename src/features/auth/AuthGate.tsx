import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, RefreshCw } from 'lucide-react';
import { apiRequest, apiUrl, ApiError } from '@/data/gateway';
import { session, SIGNED_OUT, type Account } from '@/data/session';
import { bootstrap } from '@/store';
import { cn } from '@/lib/utils';

/* ---------------- Auth API ---------------- */

interface SessionReply {
  token: string;
  user: Account;
}

export const authApi = {
  me: () => apiRequest<{ authRequired: boolean; user: Account | null }>(apiUrl!, 'GET', '/api/auth/me'),
  login: (email: string, password: string) => apiRequest<SessionReply>(apiUrl!, 'POST', '/api/auth/login', { email, password }),
  signup: (b: { email: string; password: string; name: string; businessName: string }) =>
    apiRequest<SessionReply>(apiUrl!, 'POST', '/api/auth/signup', b),
  logout: () => apiRequest<void>(apiUrl!, 'POST', '/api/auth/logout'),
  changePassword: (current: string, next: string) => apiRequest<void>(apiUrl!, 'POST', '/api/auth/password', { current, next }),
};

/** Ends the session on the server, forgets the token and starts fresh. */
export async function signOut() {
  await authApi.logout().catch(() => undefined);
  session.clear();
  window.location.assign('/');
}

/* ---------------- Gate ---------------- */

type GateState = 'checking' | 'signedOut' | 'ready' | 'unreachable';

/**
 * Decides what to show before the app:
 * - browser mode, or a server with accounts off → the app straight away
 * - accounts on and no valid session → sign-in screen
 * - server down → a retry screen
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(apiUrl ? 'checking' : 'ready');

  const check = useCallback(async () => {
    if (!apiUrl) return void bootstrap();
    setState('checking');
    try {
      const me = await authApi.me();
      session.setAccount(me.user);
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
    void check();
    const onSignedOut = () => {
      session.clear();
      setState('signedOut');
    };
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, [check]);

  if (state === 'ready') return <>{children}</>;
  if (state === 'signedOut')
    return (
      <SignIn
        onDone={() => {
          setState('ready');
          void bootstrap();
        }}
      />
    );
  return (
    <Shell>
      {state === 'checking' ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Connecting…
        </div>
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] text-white shadow-brand" style={{ background: 'var(--brand-gradient)' }}>
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
          <span className="text-[20px] font-semibold tracking-tight">TaskX</span>
        </div>
        <div className="card p-6 md:p-7">{children}</div>
      </div>
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [f, setF] = useState({ email: '', password: '', name: '', businessName: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'up' && f.password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      const r = mode === 'in' ? await authApi.login(f.email, f.password) : await authApi.signup(f);
      session.signIn(r.token, r.user);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="mt-1 text-[13.5px] text-muted">
        {mode === 'in' ? 'Sign in to track time and send invoices.' : 'Track time, review it and bill clients from one place.'}
      </p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
        {mode === 'up' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label="Your name">
              <input className="input" value={f.name} onChange={set('name')} autoComplete="name" autoFocus />
            </AuthField>
            <AuthField label="Business name">
              <input className="input" value={f.businessName} onChange={set('businessName')} autoComplete="organization" placeholder="Optional" />
            </AuthField>
          </div>
        )}
        <AuthField label="Email">
          <input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required autoFocus={mode === 'in'} />
        </AuthField>
        <AuthField label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}>
          <span className="relative">
            <input
              className="input pr-10"
              type={show ? 'text' : 'password'}
              value={f.password}
              onChange={set('password')}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              required
            />
            <button
              type="button"
              className="btn-icon absolute top-0.5 right-0.5"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </span>
        </AuthField>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary h-10" disabled={busy || !f.email || !f.password}>
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-5 text-center text-[13px] text-muted">
        {mode === 'in' ? 'New to TaskX?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className={cn('font-medium text-brand-700 hover:underline')}
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setError(null);
          }}
        >
          {mode === 'in' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </Shell>
  );
}

function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  );
}
