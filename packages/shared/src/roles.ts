import { z } from 'zod';

/** Membership roles. A user holds one role per centre (platform admins hold none). */
export const ROLES = ['principal', 'practitioner', 'parent', 'funder', 'admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Coarse permission matrix. Fine-grained rules (e.g. parents only see their own
 * children) are enforced again in Postgres row-level security — see ADR-0003.
 * Platform admins deliberately cannot read child-level data (POPIA minimisation).
 */
export const PERMISSIONS = {
  'centre:read': ['principal', 'practitioner', 'parent', 'funder', 'admin'],
  'centre:update': ['principal', 'admin'],
  'staff:read': ['principal', 'practitioner', 'admin'],
  'staff:manage': ['principal'],
  'child:read': ['principal', 'practitioner', 'parent'],
  'child:write': ['principal', 'practitioner'],
  'consent:write': ['principal', 'practitioner', 'parent'],
  'attendance:write': ['principal', 'practitioner'],
  'attendance:export': ['principal'],
  'compliance:read': ['principal', 'practitioner', 'admin'],
  'compliance:write': ['principal'],
  'policy:write': ['principal'],
  'plan:write': ['principal', 'practitioner'],
  'assistant:use': ['principal', 'practitioner', 'parent'],
  'aggregate:read': ['funder', 'admin'],
  'dashboard:read': ['principal', 'practitioner'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
