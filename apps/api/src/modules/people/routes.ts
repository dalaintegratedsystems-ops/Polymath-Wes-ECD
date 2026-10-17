import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  ManagedUserCreateSchema,
  ManagedUserCreatedSchema,
  ManagedUserListSchema,
  TemporaryPasswordSchema,
  UserStatusUpdateSchema,
  type ManagedUser,
} from '@wes/shared';
import { withRequestContext, type RequestContext } from '@wes/db';
import { audit, userContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { hashPassword, temporaryPassword } from '../../platform/passwords';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';
import { requirePhone } from '../auth/service';

const UserParams = z.object({ id: z.uuid() });
const ListQuery = z.object({ centreId: z.uuid().optional() });

interface ManagedRow {
  user_id: string;
  display_name: string;
  username: string | null;
  phone_masked: string | null;
  role: ManagedUser['role'];
  centre_id: string;
  centre_name: string;
  status: ManagedUser['status'];
  last_seen_at: Date | string | null;
  must_change: boolean;
}

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

/**
 * People management for platform admins (any centre) and principals (their own centre;
 * practitioners and parents only). Every rule is enforced again inside the database functions.
 */
export async function peopleRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;
  const ctxFor = (
    raw: Parameters<typeof userContext>[0],
    centreId: string | null,
  ): RequestContext => ({
    ...userContext(raw),
    centreId,
  });

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/admin/users',
      operationId: 'listManagedUsers',
      summary: 'People you can manage (masked phone numbers only)',
      tags: ['people'],
      auth: 'user',
      query: ListQuery,
      responses: { 200: { description: 'People', schema: ManagedUserListSchema } },
    },
    async ({ query, raw }) =>
      withRequestContext(deps.db, userContext(raw), async (tx) => {
        const rows = rowsOf<ManagedRow>(
          await tx.execute(
            sql`select * from app.manage_list_users(${query.centreId ?? null}::uuid)`,
          ),
        );
        return {
          items: rows.map((r) => ({
            userId: r.user_id,
            displayName: r.display_name,
            username: r.username,
            phoneMasked: r.phone_masked,
            role: r.role,
            centreId: r.centre_id,
            centreName: r.centre_name,
            status: r.status,
            lastSeenAt: iso(r.last_seen_at),
            mustChangePassword: r.must_change,
          })),
        };
      }),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/admin/users',
      operationId: 'createManagedUser',
      summary: 'Add a person to a centre; a username gets a one-time temporary password',
      tags: ['people'],
      auth: 'user',
      idempotent: true,
      body: ManagedUserCreateSchema,
      responses: { 201: { description: 'Created', schema: ManagedUserCreatedSchema } },
    },
    async ({ body, raw }, reply) => {
      const phone = body.phone ? requirePhone(body.phone) : null;
      const temp = body.username ? temporaryPassword() : null;
      const hash = temp ? await hashPassword(temp) : null;
      const userId = await withRequestContext(deps.db, ctxFor(raw, body.centreId), async (tx) => {
        const [row] = rowsOf<{ id: string }>(
          await tx.execute(
            sql`select app.manage_create_user(${body.displayName}, ${body.username ?? null}, ${phone}, ${hash}, ${body.centreId}::uuid, ${body.role}::role) id`,
          ),
        );
        if (!row) throw new AppError('internal', 'Could not add this person.');
        await audit(tx, raw, ctxFor(raw, body.centreId), {
          action: 'user.create',
          resourceType: 'user',
          resourceId: row.id,
          metadata: {
            role: body.role,
            withUsername: Boolean(body.username),
            withPhone: Boolean(phone),
          },
        });
        return row.id;
      });
      return reply.status(201).send({ userId, temporaryPassword: temp });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/admin/users/:id/reset-password',
      operationId: 'resetManagedUserPassword',
      summary: 'Give someone a new temporary password and sign them out everywhere',
      tags: ['people'],
      auth: 'user',
      idempotent: true,
      params: UserParams,
      responses: {
        200: { description: 'New temporary password', schema: TemporaryPasswordSchema },
      },
    },
    async ({ params, raw }) => {
      const temp = temporaryPassword();
      const hash = await hashPassword(temp);
      await withRequestContext(deps.db, userContext(raw), async (tx) => {
        const [r] = rowsOf<{ ok: boolean }>(
          await tx.execute(sql`select app.manage_set_password(${params.id}::uuid, ${hash}) ok`),
        );
        if (!r?.ok) {
          throw new AppError(
            'bad_request',
            'This person signs in with a phone PIN, so there is no password to reset.',
          );
        }
        await audit(tx, raw, userContext(raw), {
          action: 'user.reset_password',
          resourceType: 'user',
          resourceId: params.id,
        });
      });
      return { temporaryPassword: temp };
    },
  );

  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/v1/admin/users/:id/status',
      operationId: 'setManagedUserStatus',
      summary: 'Switch an account off (signs them out everywhere) or back on',
      tags: ['people'],
      auth: 'user',
      idempotent: true,
      params: UserParams,
      body: UserStatusUpdateSchema,
      responses: { 204: { description: 'Updated' } },
    },
    async ({ params, body, raw }, reply) => {
      await withRequestContext(deps.db, userContext(raw), async (tx) => {
        await tx.execute(
          sql`select app.manage_set_status(${params.id}::uuid, ${body.status}::user_status)`,
        );
        await audit(tx, raw, userContext(raw), {
          action: body.status === 'deactivated' ? 'user.deactivate' : 'user.reactivate',
          resourceType: 'user',
          resourceId: params.id,
        });
      });
      return reply.status(204).send();
    },
  );
}
