import { apiRequest, apiUrl } from './gateway';
import type { Role } from './session';

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  members: number;
  current: boolean;
}
export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}
export interface PendingInvite {
  id: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}
export interface InviteInfo {
  workspaceName: string;
  invitedBy: string;
  email: string;
  role: Role;
  hasAccount: boolean;
}

const req = <T,>(method: string, path: string, body?: unknown) => apiRequest<T>(apiUrl!, method, path, body);

/** Team workspaces, members and invites (`taskx-backend/src/team.rs`). */
export const teamApi = {
  workspaces: () => req<WorkspaceSummary[]>('GET', '/api/workspaces'),
  createWorkspace: (name: string) => req<{ id: string }>('POST', '/api/workspaces', { name }),
  switchWorkspace: (workspaceId: string) => req<void>('POST', '/api/workspaces/switch', { workspaceId }),
  team: () => req<{ members: TeamMember[]; invites: PendingInvite[]; role: Role }>('GET', '/api/team'),
  invite: (email: string, role: 'admin' | 'member') =>
    req<{ invite: { id: string; email: string; role: Role }; link: string; emailed: boolean }>('POST', '/api/team/invites', { email, role }),
  revokeInvite: (id: string) => req<void>('DELETE', `/api/team/invites/${id}`),
  setRole: (userId: string, role: Role) => req<void>('PATCH', `/api/team/members/${userId}`, { role }),
  removeMember: (userId: string) => req<void>('DELETE', `/api/team/members/${userId}`),
  inviteInfo: (token: string) => req<InviteInfo>('GET', `/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) => req<void>('POST', `/api/invites/${encodeURIComponent(token)}/accept`),
};

/** Switches workspace and reloads the app on it. */
export async function switchTo(workspaceId: string) {
  await teamApi.switchWorkspace(workspaceId);
  window.location.assign('/');
}
