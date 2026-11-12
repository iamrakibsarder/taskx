import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Ellipsis, FolderKanban, Globe, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Client, Project } from '@/types/domain';
import { ClientAvatar, Empty, Menu, PageHeader, Progress } from '@/components/ui';
import { Confirm, useModal } from '@/components/ui/Modal';
import { useAppDispatch, useData } from '@/store';
import { deleteClient, deleteProject, saveProject } from '@/store/operations';
import { ClientDialog, ProjectDialog } from '@/features/clients/ClientDialogs';
import { PortalDialog } from '@/features/portal/PortalDialog';
import { gateway } from '@/data/gateway';
import { clientIdOf, projectUsedMinutes, sumMinutes } from '@/domain/billing';
import { fmtH, money, num } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

function ProjectRow({ p }: { p: Project }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const used = projectUsedMinutes(s, p.id);
  const bud = num(p.budgetHours) * 60;
  return (
    <div className={cn('flex items-center gap-3 px-5 py-2.5', p.archived && 'opacity-55')}>
      <FolderKanban className="size-4 flex-none text-faint" />
      <Link to={`/tasks?project=${p.id}`} className="min-w-0 flex-1 truncate text-[13.5px] hover:text-brand-700">
        {p.name}
        {p.archived && <span className="ml-2 text-[12px] text-faint">archived</span>}
      </Link>
      {num(p.rate) > 0 && <span className="num text-[12px] text-faint max-sm:hidden">{money(num(p.rate), s.workspace.currency)}/h</span>}
      {bud > 0 ? (
        <div className="flex w-[150px] items-center gap-2 max-sm:w-[90px]">
          <div className="flex-1"><Progress value={used} max={bud} hot={used > bud} /></div>
          <span className={cn('num text-[11.5px] text-faint', used > bud && 'text-danger')}>{Math.round((used / bud) * 100)}%</span>
        </div>
      ) : (
        <span className="num w-[150px] text-right text-[12.5px] text-muted max-sm:w-[90px]">{fmtH(used)}</span>
      )}
      <Menu
        items={[
          { label: 'Edit', icon: <Pencil />, onSelect: () => modal.open((c) => <ProjectDialog project={p} onClose={c} />) },
          { label: p.archived ? 'Unarchive' : 'Archive', icon: <Archive />, onSelect: () => (dispatch(saveProject({ ...p, archived: !p.archived })), toast(p.archived ? 'Unarchived' : 'Archived')) },
          {
            label: 'Delete', icon: <Trash2 />, danger: true,
            onSelect: () => modal.open((c) => <Confirm title={`Delete ${p.name}?`} body="Only projects without logged time can be deleted." confirm="Delete" danger onClose={c} onConfirm={() => dispatch(deleteProject(p.id)) && toast('Project deleted')} />),
          },
        ]}
        trigger={(_, t) => <button type="button" className="btn-icon" onClick={t} aria-label="Project actions"><Ellipsis /></button>}
      />
    </div>
  );
}

function ClientCard({ c }: { c: Client }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const modal = useModal();
  const projects = s.projects.filter((p) => p.clientId === c.id && !p.internal).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const total = sumMinutes(s.tasks.filter((t) => clientIdOf(s, t) === c.id));
  const cur = s.workspace.currency;
  return (
    <section className={cn('card overflow-hidden', !c.active && 'opacity-70')}>
      <div className="flex items-center gap-3 px-5 py-4">
        <ClientAvatar client={c} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 truncate text-[15px] font-semibold">
            {c.name} {!c.active && <span className="rounded-full bg-surface-3 px-2 text-[11px] font-medium text-muted">Inactive</span>}
          </h3>
          <p className="truncate text-[12.5px] text-faint">
            {c.billing === 'retainer' ? `Retainer ${money(num(c.retainerFee), cur)}/mo · ${num(c.includedHours)}h` : `${money(num(c.rate) || num(s.workspace.defaultRate), cur)}/h`}
            {num(c.cap) > 0 && ` · cap ${num(c.cap)}h`} · {fmtH(total)} all time
          </p>
        </div>
        {c.email && (
          <a href={`mailto:${c.email}`} className="btn-icon max-sm:hidden" aria-label={`Email ${c.name}`} title={c.email}><Mail /></a>
        )}
        <Menu
          items={[
            { label: 'Edit client', icon: <Pencil />, onSelect: () => modal.open((x) => <ClientDialog client={c} onClose={x} />) },
            { label: 'Add project', icon: <Plus />, onSelect: () => modal.open((x) => <ProjectDialog clientId={c.id} onClose={x} />) },
            ...(gateway.kind === 'http' ? [{ label: 'Client portal', icon: <Globe />, onSelect: () => modal.open((x) => <PortalDialog client={c} onClose={x} />) }] : []),
            {
              label: 'Delete client', icon: <Trash2 />, danger: true,
              onSelect: () => modal.open((x) => <Confirm title={`Delete ${c.name}?`} body="Clients with logged time can’t be deleted. Make them inactive instead." confirm="Delete" danger onClose={x} onConfirm={() => dispatch(deleteClient(c.id)) && toast('Client deleted')} />),
            },
          ]}
          trigger={(_, t) => <button type="button" className="btn-icon" onClick={t} aria-label="Client actions"><Ellipsis /></button>}
        />
      </div>
      <div className="border-t border-line">
        {projects.map((p) => <ProjectRow key={p.id} p={p} />)}
        <button type="button" className="flex w-full items-center gap-3 px-5 py-2.5 text-[13px] text-faint hover:bg-surface-2 hover:text-ink" onClick={() => modal.open((x) => <ProjectDialog clientId={c.id} onClose={x} />)}>
          <Plus className="size-4" /> Add project
        </button>
      </div>
    </section>
  );
}

export default function ClientsPage() {
  const s = useData();
  const modal = useModal();
  const [showInactive, setShowInactive] = useState(false);
  const clients = s.clients.filter((c) => showInactive || c.active).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const inactive = s.clients.filter((c) => !c.active).length;
  const internal = s.projects.filter((p) => p.internal);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients"
        sub={`${s.clients.filter((c) => c.active).length} active · ${s.projects.filter((p) => !p.archived).length} projects`}
        actions={<button type="button" className="btn btn-primary" onClick={() => modal.open((c) => <ClientDialog onClose={c} />)}><Plus /> New client</button>}
      />
      {clients.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {clients.map((c) => <ClientCard key={c.id} c={c} />)}
        </div>
      ) : (
        <div className="card">
          <Empty title="No clients yet">
            <p className="text-[13.5px]">Add who you work for. Each gets a “General” project to start.</p>
            <button type="button" className="btn btn-primary mt-2" onClick={() => modal.open((c) => <ClientDialog onClose={c} />)}><Plus /> New client</button>
          </Empty>
        </div>
      )}
      {inactive > 0 && (
        <button type="button" className="self-start text-[13px] font-medium text-muted hover:text-ink" onClick={() => setShowInactive((x) => !x)}>
          {showInactive ? 'Hide' : 'Show'} {inactive} inactive
        </button>
      )}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="grid size-10 flex-none place-items-center rounded-xl bg-internal-bg text-internal"><FolderKanban className="size-5" /></span>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold">Internal</h3>
            <p className="text-[12.5px] text-faint">Admin, sales, learning. Tracked, never billed.</p>
          </div>
        </div>
        <div className="border-t border-line">
          {internal.map((p) => <ProjectRow key={p.id} p={p} />)}
          <button type="button" className="flex w-full items-center gap-3 px-5 py-2.5 text-[13px] text-faint hover:bg-surface-2 hover:text-ink" onClick={() => modal.open((x) => <ProjectDialog internal onClose={x} />)}>
            <Plus className="size-4" /> Add internal project
          </button>
        </div>
      </section>
    </div>
  );
}
