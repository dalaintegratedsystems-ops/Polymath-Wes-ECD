import 'server-only';
import type {
  AuditResult,
  Centre,
  Checklist,
  ChildListItem,
  ComplianceDocument,
  Policy,
  RegistrationProgress,
  WeeklyPlan,
} from '@wes/shared';
import { ApiError, api } from './api';

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

// ---------- Registration copilot ----------

const inCentre = (token: string, centreId: string) => ({ token, centreId });

export const getProgress = (token: string, centreId: string) =>
  api<RegistrationProgress>('/v1/compliance/progress', inCentre(token, centreId));

export const getChecklist = (token: string, centreId: string) =>
  api<Checklist>('/v1/compliance/checklist', inCentre(token, centreId));

export async function getLatestAudit(token: string, centreId: string) {
  try {
    return await api<AuditResult>('/v1/compliance/audit/latest', inCentre(token, centreId));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getPolicies(token: string, centreId: string) {
  return (
    await api<{ items: Omit<Policy, 'bodyMarkdown' | 'answers'>[] }>(
      '/v1/policies',
      inCentre(token, centreId),
    )
  ).items;
}

export const getPolicy = (token: string, centreId: string, id: string) =>
  api<Policy>(`/v1/policies/${encodeURIComponent(id)}`, inCentre(token, centreId));

export async function getDocuments(token: string, centreId: string) {
  return (
    await api<{ items: ComplianceDocument[] }>(
      '/v1/compliance/documents',
      inCentre(token, centreId),
    )
  ).items;
}

export async function getWeekPlan(token: string, centreId: string, week: string) {
  try {
    return await api<WeeklyPlan>(`/v1/plans/current?week=${week}`, inCentre(token, centreId));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
