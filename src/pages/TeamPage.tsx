import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, LogOut, Mail, RefreshCw, Send, Trash2, UserPlus, X } from 'lucide-react';
import { Card, Empty, PageHeader } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { can, session, useAccount, type Role } from '@/data/session';
import { teamApi, type PendingInvite, type TeamMember } from '@/data/teamApi';
import { gateway } from '@/data/gateway';
import { initials, longDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, including roles',
  admin: 'Invite people, change settings',
  member: 'Log time, bill, invoice',
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function TeamPage() {
  const account = useAccount();
  if (gateway.kind !== 'http' || !account)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Team" />
        <div className="card">
          <Empty title="Teams need the TaskX server">
            <p className="max-w-md text-[13.5px]">Connect the app to the API with accounts turned on to invite people into your workspace.</p>
          </Empty>
        </div>
      </div>
    );
  return <Team />;
}

function Team() {
  const account = useAccount()!;
  const modal = useModal();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const admin = can(account, 'admin');
  const owner = can(account, 'owner');

  const load = useCallback(async () => {
    try {
      const t = await teamApi.team();
      setMembers(t.members);
      setInvites(t.invites);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = (p: Promise<unknown>, ok: string) =>
    p.then(() => (toast(ok), load())).catch((e: unknown) => toast(message(e), 'error'));

  const leave = () =>
    modal.open((c) => (
      <Confirm
        title={`Leave ${account.workspaceName}?`}
        body="You’ll lose access to its clients, tasks and invoices until someone invites you again."
        confirm="Leave"
        danger
        onClose={c}
        onConfirm={() =>
          void teamApi
            .removeMember(account.id)
            .then(() => window.location.assign('/'))
            .catch((e: unknown) => toast(message(e), 'error'))
        }
      />
    ));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team"
        sub={`People in ${account.workspaceName}. You’re ${{ owner: 'an owner', admin: 'an admin', member: 'a member' }[account.role]}.`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => void load()}><RefreshCw /> Refresh</button>
            <button type="button" className="btn btn-danger" onClick={leave}><LogOut /> Leave</button>
          </>
        }
      />

      {admin && <InviteForm onSent={load} />}

      <Card title={<>Members <span className="num text-[12px] font-normal text-faint">{members.length}</span></>} bodyClass="px-0 pb-1 pt-2">
        {state === 'error' ? (
          <Empty title="Couldn’t load the team"><button type="button" className="btn mt-2" onClick={() => void load()}>Try again</button></Empty>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const me = m.userId === account.id;
              const canRemove = !me && admin && (m.role !== 'owner' || owner);
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="grid size-9 flex-none place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2">
                    {initials(m.name || m.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {m.name || m.email} {me && <span className="font-normal text-faint">(you)</span>}
                    </span>
                    <span className="block truncate text-[12px] text-faint">{m.email} · joined {longDate(m.joinedAt.slice(0, 10))}</span>
                  </span>
                  {owner ? (
                    <select
                      className="input h-8 w-[120px] text-[13px]"
                      value={m.role}
                      aria-label={`Role for ${m.name || m.email}`}
                      onChange={(e) => void act(teamApi.setRole(m.userId, e.target.value as Role), `${m.name || m.email} is now ${ROLE_LABEL[e.target.value as Role].toLowerCase()}`)}
                    >
                      {(['owner', 'admin', 'member'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                  {canRemove ? (
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`Remove ${m.name || m.email}`}
                      onClick={() =>
                        modal.open((c) => (
                          <Confirm
                            title={`Remove ${m.name || m.email}?`}
                            body="They lose access to this workspace. The time they logged stays."
                            confirm="Remove"
                            danger
                            onClose={c}
                            onConfirm={() => void act(teamApi.removeMember(m.userId), `${m.name || m.email} removed`)}
                          />
                        ))
                      }
                    >
                      <Trash2 />
                    </button>
                  ) : (
                    <span className="w-8" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {admin && invites.length > 0 && (
        <Card title="Waiting to join" bodyClass="px-0 pb-1 pt-2">
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-9 flex-none place-items-center rounded-full border border-dashed border-line-2 text-faint"><Mail className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{i.email}</span>
                  <span className={cn('block truncate text-[12px]', i.expired ? 'text-danger' : 'text-faint')}>
                    {i.expired ? 'Expired' : `Expires ${longDate(i.expiresAt.slice(0, 10))}`} · invited by {i.invitedBy || 'someone'}
                  </span>
                </span>
                <RoleBadge role={i.role} />
                <button type="button" className="btn btn-sm" onClick={() => void act(teamApi.invite(i.email, i.role), `New invite sent to ${i.email}`)}>
                  <Send /> Resend
                </button>
                <button type="button" className="btn-icon" aria-label={`Cancel invite for ${i.email}`} onClick={() => void act(teamApi.revokeInvite(i.id), 'Invite cancelled')}>
                  <X />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="What each role can do">
        <dl className="grid gap-3 sm:grid-cols-3">
          {(['owner', 'admin', 'member'] as const).map((r) => (
            <div key={r} className="rounded-lg bg-surface-2 p-3">
              <dt className="text-[13px] font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-[12.5px] text-muted">{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={cn('pill', role === 'owner' ? 'bg-brand-50 text-brand-700' : role === 'admin' ? 'bg-internal-bg text-internal' : 'bg-surface-3 text-ink-2')}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function InviteForm({ onSent }: { onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await teamApi.invite(email, role);
      setSent({ email: r.invite.email, link: r.link, emailed: r.emailed });
      setCopied(false);
      setEmail('');
      onSent();
    } catch (err) {
      toast(message(err), 'error');
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent!.link);
      setCopied(true);
    } catch {
      toast('Couldn’t copy. Select the link and copy it.', 'error');
    }
  };

  return (
    <Card title={<><UserPlus className="size-4 text-brand-600" /> Invite someone</>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
        <input className="input" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" required />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')} aria-label="Role">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={busy || !email}><Send /> Send invite</button>
      </form>
      {sent && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-3">
          <p className="text-[13px] text-ink-2">
            {sent.emailed ? (
              <>Invite emailed to <span className="font-medium">{sent.email}</span>. You can also share this link with them:</>
            ) : (
              <>Email isn’t set up on this server, so send this link to <span className="font-medium">{sent.email}</span> yourself:</>
            )}
          </p>
          <div className="flex gap-2">
            <input className="input num flex-1 text-[12px]" readOnly value={sent.link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button type="button" className="btn" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="text-[12px] text-faint">The link works once, for {sent.email}, for 7 days.</p>
        </div>
      )}
      {!session.mailEnabled() && !sent && (
        <p className="mt-3 text-[12px] text-faint">Email isn’t set up on this server (SMTP_URL). You’ll get a link to share after inviting.</p>
      )}
    </Card>
  );
}

