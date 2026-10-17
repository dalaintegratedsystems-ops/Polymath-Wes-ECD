import 'server-only';
import type { Centre, ChildListItem } from '@wes/shared';
import { api } from './api';

export async function getCentre(token: string, centreId: string) {
  return api<Centre>(`/v1/centres/${centreId}`, { token });
}

export async function getChildren(token: string, centreId: string) {
  return (await api<{ children: ChildListItem[] }>(`/v1/centres/${centreId}/children`, { token }))
    .children;
}

/** Distinct groups seen in the register, for filters and the add-child form. */
export function groupsOf(children: ChildListItem[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const c of children) if (c.groupId && c.groupName) map.set(c.groupId, c.groupName);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
