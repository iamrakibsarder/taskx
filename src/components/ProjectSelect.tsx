import type { ID } from '@/types/domain';
import { useData } from '@/store';
import { activeProjects, findClient } from '@/domain/billing';
import { cn } from '@/lib/utils';

/** Project picker grouped by client, internal projects last. */
export function ProjectSelect({
  value, onChange, className, soft, includeId, placeholder = 'Project',
}: { value: ID | ''; onChange: (id: ID) => void; className?: string; soft?: boolean; includeId?: ID; placeholder?: string }) {
  const s = useData();
  const list = activeProjects(s);
  const extra = includeId && !list.some((p) => p.id === includeId) ? s.projects.filter((p) => p.id === includeId) : [];
  const all = [...list, ...extra];
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const key = p.internal ? 'Internal' : findClient(s, p.clientId)?.name ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'Internal' ? 1 : b === 'Internal' ? -1 : a.localeCompare(b)));
  return (
    <select
      className={cn('input', soft && 'input-soft', !value && 'text-faint', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Project"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {ordered.map(([label, ps]) => (
        <optgroup key={label} label={label}>
          {ps.map((p) => (
            <option key={p.id} value={p.id} className="text-ink">
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** "Client · Project" for a project id. */
export function useProjectLabel() {
  const s = useData();
  return (id: ID) => {
    const p = s.projects.find((x) => x.id === id);
    if (!p) return { project: 'Deleted project', client: '', color: '#9a96a5' };
    const c = p.internal ? null : findClient(s, p.clientId);
    return { project: p.name, client: c?.name ?? 'Internal', color: c?.color ?? 'var(--color-internal)' };
  };
}
