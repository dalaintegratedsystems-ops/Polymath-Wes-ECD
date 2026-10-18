import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, can, type Permission, type Role } from '@wes/shared';
import { schema, withRequestContext, type RequestContext, type Transaction } from '@wes/db';
import type { AppDeps } from './deps';
import type { TokenService } from './tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string };
  }
}

/** Routes a user who must choose a new password can still reach. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/v1/me', '/v1/auth/password/change']);

/**
 * Verify the bearer token on routes declared `auth: 'user'`, then check the account itself on
 * every request: deactivation takes effect at once (not when the token expires), and an
 * admin-set temporary password must be replaced before anything else. The same lookup records
 * one activity row per user per day for the dashboards (no content, just "was active").
 */
export function registerAuthentication(
  app: FastifyInstance,
  tokens: TokenService,
  deps: AppDeps,
): void {
  const recorded = new Set<string>();
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config.auth !== 'user') return;
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('unauthenticated', 'Please sign in.');
    }
    const claims = await tokens.verifyAccess(header.slice(7));
    const userId = claims.userId;
    const day = deps.now().toISOString().slice(0, 10);
    const key = `${userId}:${day}`;
    const account = await withRequestContext(
      deps.db,
      { userId, centreId: null, role: null },
      async (tx) => {
        const [u] = await tx
          .select({ status: schema.users.status, mustChange: schema.users.mustChangePassword })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        if (u?.status === 'active' && !recorded.has(key)) {
          await tx.insert(schema.userActivityDays).values({ userId, day }).onConflictDoNothing();
        }
        return u;
      },
    );
    if (!account || account.status !== 'active') {
      throw new AppError('unauthenticated', 'Please sign in again.');
    }
    if (recorded.size > 50_000) recorded.clear();
    recorded.add(key);
    if (account.mustChange && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(request.routeOptions.url ?? '')) {
      throw new AppError('forbidden', 'Choose a new password first.', [
        { path: 'account', message: 'password_change_required' },
      ]);
    }
    request.user = { id: userId };
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

/** Routes not under /v1/centres/{id} name the centre in this header. */
export function centreIdFromHeader(req: FastifyRequest): string {
  const parsed = z.uuid().safeParse(req.headers['x-centre-id']);
  if (!parsed.success) throw new AppError('bad_request', 'Send the X-Centre-Id header.');
  return parsed.data;
}

export const centreHeader = [
  {
    name: 'X-Centre-Id',
    in: 'header' as const,
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];
