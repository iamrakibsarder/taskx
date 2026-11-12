import { useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import type { Client, ID, Project } from '@/types/domain';
import { Dialog } from '@/components/ui/Modal';
import { ClientAvatar, Field, Segmented } from '@/components/ui';
import { useAppDispatch, useData } from '@/store';
import { saveClient, saveProject } from '@/store/operations';
import { CLIENT_COLORS } from '@/data/sample';
import { gateway } from '@/data/gateway';
import { num } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn, uid } from '@/lib/utils';
import { fileToLogo } from '@/lib/image';

const numOrNull = (v: string) => (v.trim() === '' ? null : num(v));

export function ClientDialog({ client, onClose }: { client?: Client; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [f, setF] = useState<Client>(
    client ?? {
      id: uid(), name: '', color: CLIENT_COLORS[s.clients.length % CLIENT_COLORS.length]!, logo: '', contact: '', email: '', address: '',
      billing: 'hourly', rate: null, retainerFee: 0, includedHours: 0, cap: 0, active: true, createdAt: Date.now(),
    },
  );
  const [rate, setRate] = useState(f.rate == null ? '' : String(f.rate));
  const set = (p: Partial<Client>) => setF((x) => ({ ...x, ...p }));
  const uploadLogo = async (file: File) => {
    try {
      set({ logo: await fileToLogo(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t use that image.');
    }
  };
  const save = () => {
    if (!f.name.trim()) return toast.error('Give the client a name.');
    if (f.billing === 'retainer' && !(num(f.retainerFee) > 0)) return toast.error('Set the monthly retainer fee.');
    dispatch(saveClient({ ...f, name: f.name.trim(), rate: numOrNull(rate), retainerFee: num(f.retainerFee), includedHours: num(f.includedHours), cap: num(f.cap) }));
    if (!client && !s.projects.some((p) => p.clientId === f.id))
      dispatch(saveProject({ id: uid(), clientId: f.id, name: 'General', rate: null, internal: false, archived: false, budgetHours: null }));
    toast(client ? 'Client saved' : `${f.name.trim()} added`);
    onClose();
  };
  return (
    <Dialog
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{client ? 'Save' : 'Add client'}</button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Acme Inc." data-autofocus />
      </Field>
      <div className="flex items-center gap-4">
        <label
          className="group relative cursor-pointer rounded-xl"
          title="Upload logo"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void uploadLogo(file);
          }}
        >
          <ClientAvatar client={{ name: f.name || '?', color: f.color, logo: f.logo }} size={64} />
          <span className="absolute inset-0 grid place-items-center rounded-[10px] bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
            <ImagePlus className="size-5" />
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void uploadLogo(file);
          }} />
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn btn-sm cursor-pointer">
              <ImagePlus /> {f.logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadLogo(file);
              }} />
            </label>
            {f.logo && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ logo: '' })}>
                <Trash2 /> Remove
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.color === c}
                aria-label={c}
                onClick={() => set({ color: c })}
                className={cn('grid size-6 place-items-center rounded-full text-white transition', f.color === c && 'ring-2 ring-offset-2')}
                style={{ background: c, ['--tw-ring-color' as string]: c }}
              >
                {f.color === c && <Check className="size-3" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person"><input className="input" value={f.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
        <Field label="Billing email"><input type="email" className="input" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
      </div>
      <Field label="Address"><textarea className="input" rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="label">How you bill</span>
        <Segmented<'hourly' | 'retainer'>
          label="Billing model"
          value={f.billing}
          onChange={(billing) => set({ billing })}
          options={[{ value: 'hourly', label: 'Hourly' }, { value: 'retainer', label: 'Retainer' }]}
        />
      </div>
      {f.billing === 'retainer' ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Monthly fee"><input type="number" min="0" className="input num" value={f.retainerFee || ''} onChange={(e) => set({ retainerFee: +e.target.value })} /></Field>
          <Field label="Hours included"><input type="number" min="0" className="input num" value={f.includedHours || ''} onChange={(e) => set({ includedHours: +e.target.value })} /></Field>
          <Field label="Extra hour rate"><input type="number" min="0" className="input num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={String(s.workspace.defaultRate)} /></Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hourly rate"><input type="number" min="0" className="input num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={`${s.workspace.defaultRate} (default)`} /></Field>
          <Field label="Monthly cap (hours)"><input type="number" min="0" className="input num" value={f.cap || ''} onChange={(e) => set({ cap: +e.target.value })} placeholder="No cap" /></Field>
        </div>
      )}
      {gateway.kind === 'http' && (
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" className="size-4" checked={f.reminders !== false} onChange={(e) => set({ reminders: e.target.checked })} /> Send payment reminders
          {!s.workspace.remindersOn && <span className="text-[12px] text-faint">(off in Settings)</span>}
        </label>
      )}
      {client && (
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" className="size-4" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active (shows in pickers and billing)
        </label>
      )}
    </Dialog>
  );
}

export function ProjectDialog({ project, clientId, internal, onClose }: { project?: Project; clientId?: ID | null; internal?: boolean; onClose: () => void }) {
  const s = useData();
  const dispatch = useAppDispatch();
  const [f, setF] = useState<Project>(
    project ?? { id: uid(), clientId: internal ? null : clientId ?? s.clients[0]?.id ?? null, name: '', rate: null, internal: !!internal, archived: false, budgetHours: null },
  );
  const [rate, setRate] = useState(f.rate == null ? '' : String(f.rate));
  const [budget, setBudget] = useState(f.budgetHours == null ? '' : String(f.budgetHours));
  const set = (p: Partial<Project>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.name.trim()) return toast.error('Name the project.');
    if (!f.internal && !f.clientId) return toast.error('Choose a client.');
    dispatch(saveProject({ ...f, name: f.name.trim(), clientId: f.internal ? null : f.clientId, rate: f.internal ? null : numOrNull(rate), budgetHours: numOrNull(budget) }));
    toast(project ? 'Project saved' : 'Project added');
    onClose();
  };
  return (
    <Dialog
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{project ? 'Save' : 'Add project'}</button>
        </>
      }
    >
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} data-autofocus /></Field>
      <Field label="Belongs to">
        <select
          className="input"
          value={f.internal ? '__internal' : f.clientId ?? ''}
          onChange={(e) => (e.target.value === '__internal' ? set({ internal: true, clientId: null }) : set({ internal: false, clientId: e.target.value }))}
        >
          {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__internal">Internal (never billed)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {!f.internal && (
          <Field label="Rate override"><input type="number" min="0" className="input num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Client rate" /></Field>
        )}
        <Field label="Budget (hours)"><input type="number" min="0" className="input num" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="None" /></Field>
      </div>
      {project && (
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" className="size-4" checked={f.archived} onChange={(e) => set({ archived: e.target.checked })} /> Archived (hidden from pickers)
        </label>
      )}
    </Dialog>
  );
}
