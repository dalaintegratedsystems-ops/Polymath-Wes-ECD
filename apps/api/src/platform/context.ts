import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { AppError, can, type Permission, type Role } from '@wes/shared';
import { schema, withRequestContext, type RequestContext, type Transaction } from '@wes/db';
import type { AppDeps } from './deps';
import type { TokenService } from './tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string };
  }
}

/** Verify the bearer token on routes declared `auth: 'user'`. */
export function registerAuthentication(app: FastifyInstance, tokens: TokenService): void {
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config.auth !== 'user') return;
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('unauthenticated', 'Please sign in.');
    }
    const claims = await tokens.verifyAccess(header.slice(7));
    request.user = { id: claims.userId };
  });
}

export function requireUser(req: FastifyRequest): { id: string } {
  if (!req.user) throw new AppError('unauthenticated', 'Please sign in.');
  return req.user;
}

/** Context for actions that belong to the user but no centre (e.g. "my centres"). */
export function userContext(req: FastifyRequest): RequestContext {
  return { userId: requireUser(req).id, centreId: null, role: null };
}

/**
 * Resolve the caller's role in a centre and check a permission. Throws 404 (not 403) when the
 * user is not a member, so centre ids can't be probed. The returned context is what RLS sees.
 */
export async function centreContext(
  deps: AppDeps,
  req: FastifyRequest,
  centreId: string,
  permission: Permission,
): Promise<RequestContext> {
  const userId = requireUser(req).id;
  const role = await withRequestContext(
    deps.db,
    { userId, centreId: null, role: null },
    async (tx) => {
      const [m] = await tx
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(
          and(eq(schema.memberships.userId, userId), eq(schema.memberships.centreId, centreId)),
        );
      if (m) return m.role as Role;
      const [u] = await tx
        .select({ admin: schema.users.isPlatformAdmin })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      return u?.admin ? ('admin' as const) : null;
    },
  );
  if (!role) throw new AppError('not_found', 'Centre not found.');
  if (!can(role, permission)) throw new AppError('forbidden', 'Your role cannot do this.');
  return { userId, centreId, role };
}

/** Append to the audit log. Required for every read or write of child data (CLAUDE.md §7). */
export async function audit(
  tx: Transaction,
  req: FastifyRequest,
  ctx: RequestContext,
  entry: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(schema.auditLog).values({
    centreId: ctx.centreId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    requestId: req.id,
    channel: 'web',
    metadata: entry.metadata ?? {},
  });
}
