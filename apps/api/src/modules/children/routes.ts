import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  ChildIntakeCreateSchema,
  ChildListItemSchema,
  ConsentCreateSchema,
  ConsentSchema,
  normaliseSaPhone,
  type ChildListItem,
} from '@wes/shared';
import { schema, withRequestContext } from '@wes/db';
import type { Config } from '../../config';
import { audit, centreContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';
import { createChallenge, maskPhone, verifyChallenge } from '../auth/otp';
import { otpPolicy } from '../auth/service';

const CentreParams = z.object({ id: z.uuid() });
const ChildParams = z.object({ id: z.uuid() });

/** Pending intakes expire if a guardian never consents (privacy.md). */
const INTAKE_TTL_DAYS = 14;

/** Routes under /v1/children/{id} name the centre in this header (the child id alone can't). */
function centreIdFromHeader(req: FastifyRequest): string {
  const value = req.headers['x-centre-id'];
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError('bad_request', 'Send the X-Centre-Id header.');
  return parsed.data;
}

const centreHeader = [
  {
    name: 'X-Centre-Id',
    in: 'header' as const,
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export async function childrenRoutes(
  app: FastifyInstance,
  opts: { deps: AppDeps; config: Config },
) {
  const { deps } = opts;
  const policy = otpPolicy(opts.config);

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id/children',
      operationId: 'listChildren',
      summary:
        'Child register: active children and intakes awaiting consent (parents see their own)',
      tags: ['children'],
      auth: 'user',
      params: CentreParams,
      responses: {
        200: {
          description: 'Children',
          schema: z.object({ children: z.array(ChildListItemSchema) }),
        },
      },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'child:read');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const active = await tx
          .select({
            id: schema.children.id,
            firstName: schema.children.firstName,
            birthMonth: schema.children.birthMonth,
            groupId: schema.children.groupId,
          })
          .from(schema.children)
          .where(and(eq(schema.children.centreId, params.id), eq(schema.children.status, 'active')))
          .orderBy(schema.children.firstName);
        const pending = await tx
          .select({
            id: schema.childIntakes.childId,
            firstName: schema.childIntakes.firstName,
            birthMonth: schema.childIntakes.birthMonth,
            groupId: schema.childIntakes.groupId,
          })
          .from(schema.childIntakes)
          .where(eq(schema.childIntakes.centreId, params.id))
          .orderBy(schema.childIntakes.firstName);
        await audit(tx, raw, ctx, {
          action: 'list',
          resourceType: 'child',
          metadata: { count: active.length + pending.length },
        });
        const children: ChildListItem[] = [
          ...pending.map((c) => ({ ...c, status: 'awaiting_consent' as const })),
          ...active.map((c) => ({ ...c, status: 'active' as const })),
        ];
        return { children };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/centres/:id/children',
      operationId: 'startChildIntake',
      summary:
        'Add a child: creates an intake that becomes a child record once a guardian consents',
      tags: ['children'],
      auth: 'user',
      idempotent: true,
      params: CentreParams,
      body: ChildIntakeCreateSchema,
      responses: {
        201: { description: 'Intake created, awaiting consent', schema: ChildListItemSchema },
      },
    },
    async ({ params, body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, params.id, 'child:write');
      const phone = normaliseSaPhone(body.guardian.phone);
      if (!phone) {
        throw new AppError(
          'validation_failed',
          'Use a South African mobile number for the parent or caregiver.',
          [
            {
              path: 'body.guardian.phone',
              message: 'Use a South African mobile number, e.g. 082 123 4567',
            },
          ],
        );
      }
      const blind = deps.crypto.blindIndex(phone);

      const item = await withRequestContext(deps.db, ctx, async (tx) => {
        const [existing] = await tx
          .select({ id: schema.guardians.id })
          .from(schema.guardians)
          .where(
            and(
              eq(schema.guardians.centreId, params.id),
              eq(schema.guardians.phoneBlindIndex, blind),
            ),
          );
        const guardianId =
          existing?.id ??
          (
            await tx
              .insert(schema.guardians)
              .values({
                centreId: params.id,
                displayName: body.guardian.displayName,
                phoneCiphertext: deps.crypto.encrypt(phone),
                phoneBlindIndex: blind,
              })
              .returning({ id: schema.guardians.id })
          )[0]!.id;

        const childId = crypto.randomUUID();
        await tx.insert(schema.childIntakes).values({
          centreId: params.id,
          firstName: body.firstName,
          birthMonth: body.birthMonth,
          groupId: body.groupId ?? null,
          guardianId,
          guardianRelationship: body.guardian.relationship,
          childId,
          expiresAt: new Date(deps.now().getTime() + INTAKE_TTL_DAYS * 86_400_000),
        });
        await audit(tx, raw, ctx, {
          action: 'create',
          resourceType: 'child_intake',
          resourceId: childId,
        });
        return {
          id: childId,
          firstName: body.firstName,
          birthMonth: body.birthMonth,
          groupId: body.groupId ?? null,
          status: 'awaiting_consent' as const,
        };
      });
      return reply.status(201).send(item);
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/children/:id/consents/otp',
      operationId: 'sendConsentPin',
      summary: 'Send the parent or caregiver a PIN to confirm consent for this child',
      tags: ['consent'],
      auth: 'user',
      params: ChildParams,
      headers: centreHeader,
      responses: {
        202: {
          description: 'PIN sent',
          schema: z.object({ expiresInSeconds: z.int(), sentTo: z.string() }),
        },
      },
    },
    async ({ params, raw }, reply) => {
      const centreId = centreIdFromHeader(raw);
      const ctx = await centreContext(deps, raw, centreId, 'child:write');
      const { phone, code } = await withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .select({ phoneCiphertext: schema.guardians.phoneCiphertext })
          .from(schema.childIntakes)
          .innerJoin(schema.guardians, eq(schema.guardians.id, schema.childIntakes.guardianId))
          .where(
            and(
              eq(schema.childIntakes.childId, params.id),
              eq(schema.childIntakes.centreId, centreId),
            ),
          );
        if (!row) throw new AppError('not_found', 'No child is waiting for consent with that id.');
        const guardianPhone = deps.crypto.decrypt(row.phoneCiphertext);
        const pin = await createChallenge(tx, policy, {
          phone: guardianPhone,
          purpose: 'consent',
          subjectId: params.id,
          channel: deps.otpSender.channel,
          now: deps.now(),
        });
        return { phone: guardianPhone, code: pin };
      });
      await deps.otpSender.send(phone, code, 'consent');
      return reply
        .status(202)
        .send({ expiresInSeconds: opts.config.OTP_TTL_SECONDS, sentTo: maskPhone(phone) });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/children/:id/consents',
      operationId: 'grantConsent',
      summary: 'Record consent. For a child awaiting consent this creates the child record.',
      tags: ['consent'],
      auth: 'user',
      idempotent: true,
      params: ChildParams,
      headers: centreHeader,
      body: ConsentCreateSchema,
      responses: { 201: { description: 'Consent recorded', schema: ConsentSchema } },
    },
    async ({ params, body, raw }, reply) => {
      const centreId = centreIdFromHeader(raw);
      const ctx = await centreContext(deps, raw, centreId, 'child:write');

      const intake = await withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .select({
            intake: schema.childIntakes,
            phoneCiphertext: schema.guardians.phoneCiphertext,
          })
          .from(schema.childIntakes)
          .innerJoin(schema.guardians, eq(schema.guardians.id, schema.childIntakes.guardianId))
          .where(
            and(
              eq(schema.childIntakes.childId, params.id),
              eq(schema.childIntakes.centreId, centreId),
            ),
          );
        if (row) return row;
        const [child] = await tx
          .select({ id: schema.children.id })
          .from(schema.children)
          .where(eq(schema.children.id, params.id));
        throw child
          ? new AppError('conflict', 'This child already has consent on record.')
          : new AppError('not_found', 'No child is waiting for consent with that id.');
      });

      if (body.method === 'guardian_otp') {
        const phone = deps.crypto.decrypt(intake.phoneCiphertext);
        // Separate transaction so a wrong PIN is counted even though we then stop.
        const ok = await withRequestContext(deps.db, ctx, (tx) =>
          verifyChallenge(tx, policy, {
            phone,
            purpose: 'consent',
            code: body.code!,
            subjectId: params.id,
            now: deps.now(),
          }),
        );
        if (!ok) {
          throw new AppError('validation_failed', 'That PIN is wrong or has expired.', [
            { path: 'body.code', message: 'That PIN is wrong or has expired. Send a new one.' },
          ]);
        }
      }

      const consent = await withRequestContext(deps.db, ctx, async (tx) => {
        if (body.method === 'paper_photo') {
          const [doc] = await tx
            .select({ id: schema.complianceDocuments.id })
            .from(schema.complianceDocuments)
            .where(eq(schema.complianceDocuments.id, body.evidenceDocumentId!));
          if (!doc)
            throw new AppError('validation_failed', 'Upload a photo of the signed form first.');
        }
        const i = intake.intake;
        await tx.insert(schema.children).values({
          id: i.childId,
          centreId,
          firstName: i.firstName,
          birthMonth: i.birthMonth,
          groupId: i.groupId,
        });
        await tx.insert(schema.childGuardians).values({
          childId: i.childId,
          guardianId: i.guardianId,
          centreId,
          relationship:
            i.guardianRelationship as typeof schema.childGuardians.$inferInsert.relationship,
        });
        const [row] = await tx
          .insert(schema.consents)
          .values({
            centreId,
            childId: i.childId,
            guardianId: i.guardianId,
            purposes: body.purposes,
            method: body.method,
            evidenceDocumentId: body.evidenceDocumentId ?? null,
            capturedByUserId: ctx.userId,
            grantedAt: deps.now(),
          })
          .returning();
        await tx.delete(schema.childIntakes).where(eq(schema.childIntakes.id, i.id));
        await audit(tx, raw, ctx, {
          action: 'consent_granted',
          resourceType: 'child',
          resourceId: i.childId,
          metadata: { method: body.method, purposes: body.purposes },
        });
        return row!;
      });

      return reply.status(201).send({
        id: consent.id,
        childId: consent.childId!,
        purposes: consent.purposes as z.infer<typeof ConsentSchema>['purposes'],
        method: consent.method,
        grantedAt: consent.grantedAt.toISOString(),
        revokedAt: null,
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/children/:id/consents/revoke',
      operationId: 'revokeConsent',
      summary:
        'Withdraw consent: deletes the child’s records (anonymous daily headcounts are kept)',
      tags: ['consent'],
      auth: 'user',
      idempotent: true,
      params: ChildParams,
      headers: centreHeader,
      responses: { 204: { description: 'Consent withdrawn and child records deleted' } },
    },
    async ({ params, raw }, reply) => {
      const centreId = centreIdFromHeader(raw);
      const ctx = await centreContext(deps, raw, centreId, 'consent:write');
      await withRequestContext(deps.db, ctx, async (tx) => {
        const result = rowsOf<{ ok: boolean }>(
          await tx.execute(sql`select app.revoke_child_consent(${params.id}::uuid) as ok`),
        );
        if (!result[0]?.ok) {
          // Not an active child: cancel a pending intake if staff own it.
          const removed = await tx
            .delete(schema.childIntakes)
            .where(
              and(
                eq(schema.childIntakes.childId, params.id),
                eq(schema.childIntakes.centreId, centreId),
              ),
            )
            .returning({ id: schema.childIntakes.id });
          if (removed.length === 0) throw new AppError('not_found', 'Child not found.');
        }
        await audit(tx, raw, ctx, {
          action: 'consent_revoked',
          resourceType: 'child',
          resourceId: params.id,
        });
      });
      return reply.status(204).send();
    },
  );
}
