import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  AuditRequestSchema,
  AuditResultSchema,
  ChecklistSchema,
  ComplianceDocumentListSchema,
  ComplianceDocumentSchema,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_TYPE_LABEL,
  EXPIRY_WARNING_DAYS,
  DocumentUploadQuerySchema,
  MAX_DOCUMENT_BYTES,
  PolicyGenerateSchema,
  PolicyListSchema,
  PolicySchema,
  PolicyUpdateSchema,
  RegistrationProgressSchema,
} from '@wes/shared';
import { schema, withRequestContext, type RequestContext } from '@wes/db';
import { audit, centreContext, centreHeader, centreIdFromHeader } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { cleanImage } from '../../platform/images';
import { markdownPdf } from '../../platform/pdf';
import { defineRoute } from '../../platform/route';
import { buildApplicationPack } from './pack';
import { draftPolicy, validateAnswers } from './policy-templates';
import {
  archiveOthers,
  computeGaps,
  listDocuments,
  loadChecklist,
  publicDocument,
  registrationProgress,
  sastToday,
  toAuditResult,
  toPolicy,
} from './service';

const IdParams = z.object({ id: z.uuid() });

async function principalName(deps: AppDeps, ctx: RequestContext): Promise<string> {
  return withRequestContext(deps.db, ctx, async (tx) => {
    const [row] = await tx
      .select({ name: schema.users.displayName })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(
        and(
          eq(schema.memberships.centreId, ctx.centreId!),
          eq(schema.memberships.role, 'principal'),
        ),
      )
      .limit(1);
    return row?.name ?? 'The principal';
  });
}

/** Check the bytes really are what they claim, and strip photo metadata. */
function cleanDocument(body: unknown): { bytes: Buffer; mime: string } {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError('validation_failed', 'Send the photo or PDF of the document.');
  }
  if (body.length > MAX_DOCUMENT_BYTES) {
    throw new AppError('validation_failed', 'That file is too big. Use one under 5 MB.');
  }
  if (body.subarray(0, 5).toString('ascii') === '%PDF-')
    return { bytes: body, mime: 'application/pdf' };
  const image = cleanImage(body, MAX_DOCUMENT_BYTES);
  return { bytes: image.bytes, mime: image.mime };
}

/**
 * Registration copilot: checklist and self-audit, document capture, policy drafts, the
 * application pack, and journey progress. Centre comes from the X-Centre-Id header.
 */
export async function complianceRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;
  app.addContentTypeParser(
    DOCUMENT_MIME_TYPES,
    { parseAs: 'buffer', bodyLimit: MAX_DOCUMENT_BYTES + 1024 },
    (_req, body, done) => done(null, body),
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/compliance/checklist',
      operationId: 'getComplianceChecklist',
      summary: 'Registration checklist (placeholder until the official documents are loaded)',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'Checklist', schema: ChecklistSchema } },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return withRequestContext(deps.db, ctx, (tx) => loadChecklist(tx));
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/compliance/audit',
      operationId: 'runSelfAudit',
      summary: 'Answer the checklist and get a prioritised list of what to work on',
      tags: ['compliance'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      body: AuditRequestSchema,
      responses: { 201: { description: 'Audit result', schema: AuditResultSchema } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:write');
      const result = await withRequestContext(deps.db, ctx, async (tx) => {
        const checklist = await loadChecklist(tx);
        const { gaps, scorePercent } = computeGaps(checklist, body.answers);
        const [row] = await tx
          .insert(schema.auditRuns)
          .values({
            centreId: ctx.centreId!,
            runByUserId: ctx.userId,
            answers: body.answers,
            gaps,
            scorePercent,
            knowledgeCorpusVersion: checklist.isPlaceholder ? 'placeholder' : 'curated',
          })
          .returning();
        await audit(tx, raw, ctx, {
          action: 'compliance.audit',
          resourceType: 'audit_run',
          resourceId: row!.id,
        });
        return toAuditResult(row!, checklist.isPlaceholder);
      });
      return reply.status(201).send(result);
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/compliance/audit/latest',
      operationId: 'getLatestSelfAudit',
      summary: 'The most recent self-audit',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      responses: {
        200: { description: 'Audit result', schema: AuditResultSchema },
        404: { description: 'No self-audit yet' },
      },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .select()
          .from(schema.auditRuns)
          .where(eq(schema.auditRuns.centreId, ctx.centreId!))
          .orderBy(desc(schema.auditRuns.createdAt))
          .limit(1);
        if (!row) throw new AppError('not_found', 'No self-audit yet.');
        return toAuditResult(row, row.knowledgeCorpusVersion === 'placeholder');
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/compliance/progress',
      operationId: 'getRegistrationProgress',
      summary: 'Where the centre is on its registration journey',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'Progress', schema: RegistrationProgressSchema } },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return withRequestContext(deps.db, ctx, (tx) =>
        registrationProgress(tx, ctx.centreId!, deps.now()),
      );
    },
  );

  // ---------- Documents ----------

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/compliance/documents',
      operationId: 'uploadComplianceDocument',
      summary: 'Save a photo or PDF of a document (max 5 MB; photo metadata removed)',
      tags: ['compliance'],
      auth: 'user',
      headers: [
        ...centreHeader,
        {
          name: 'content-type',
          in: 'header' as const,
          required: true,
          schema: { type: 'string', enum: DOCUMENT_MIME_TYPES },
        },
      ],
      query: DocumentUploadQuerySchema,
      responses: { 201: { description: 'Saved', schema: ComplianceDocumentSchema } },
    },
    async ({ query, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:write');
      const file = cleanDocument(raw.body);
      const id = crypto.randomUUID();
      const blobKey = `centres/${ctx.centreId}/documents/${id}`;
      // Store the file first: a database row never points at a missing blob.
      await deps.blobs.put(blobKey, file.bytes, file.mime);
      const doc = await withRequestContext(deps.db, ctx, async (tx) => {
        let itemId: string | null = null;
        if (query.itemCode) {
          const [item] = await tx
            .select({ id: schema.complianceItems.id })
            .from(schema.complianceItems)
            .where(eq(schema.complianceItems.code, query.itemCode));
          if (!item) throw new AppError('validation_failed', 'Unknown checklist item.');
          itemId = item.id;
        }
        await tx.insert(schema.complianceDocuments).values({
          id,
          centreId: ctx.centreId!,
          complianceItemId: itemId,
          documentType: query.type,
          blobKey,
          mimeType: file.mime,
          sizeBytes: file.bytes.length,
          issuedOn: query.issuedOn ?? null,
          expiresOn: query.expiresOn ?? null,
          uploadedByUserId: ctx.userId,
        });
        if (query.expiresOn) {
          // Remind the uploader 30 days before expiry (08:00 SAST), or soon if that has passed.
          const warnAt = new Date(
            Date.parse(`${query.expiresOn}T08:00:00+02:00`) - EXPIRY_WARNING_DAYS * 86_400_000,
          );
          const dueAt = warnAt > deps.now() ? warnAt : new Date(deps.now().getTime() + 3_600_000);
          await tx.insert(schema.reminders).values({
            centreId: ctx.centreId!,
            userId: ctx.userId,
            kind: 'document_expiry',
            message: `Your ${DOCUMENT_TYPE_LABEL[query.type].toLowerCase()} expires on ${query.expiresOn}. Renew it, then add the new one in Wes.`,
            dueAt,
            relatedResourceId: id,
          });
        }
        await audit(tx, raw, ctx, {
          action: 'compliance.document.upload',
          resourceType: 'document',
          resourceId: id,
        });
        return (await listDocuments(tx, ctx.centreId!, deps.now())).find((d) => d.id === id)!;
      }).catch(async (err: unknown) => {
        await deps.blobs.delete(blobKey).catch(() => undefined);
        throw err;
      });
      return reply.status(201).send(publicDocument(doc));
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/compliance/documents',
      operationId: 'listComplianceDocuments',
      summary: 'Saved documents, with expiry warnings',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'Documents', schema: ComplianceDocumentListSchema } },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return withRequestContext(deps.db, ctx, async (tx) => ({
        items: (await listDocuments(tx, ctx.centreId!, deps.now())).map(publicDocument),
      }));
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/compliance/documents/:id/file',
      operationId: 'getComplianceDocumentFile',
      summary: 'Download a saved document',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'The file' } },
    },
    async ({ params, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      const doc = await withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .select()
          .from(schema.complianceDocuments)
          .where(
            and(
              eq(schema.complianceDocuments.id, params.id),
              eq(schema.complianceDocuments.centreId, ctx.centreId!),
            ),
          );
        return row;
      });
      if (!doc) throw new AppError('not_found', 'Document not found.');
      const file = await deps.blobs.get(doc.blobKey);
      if (!file) throw new AppError('not_found', 'Document not found.');
      return reply
        .header('content-type', doc.mimeType)
        .header('content-disposition', `inline; filename="document-${doc.id.slice(0, 8)}"`)
        .header('cache-control', 'private, no-store')
        .send(file.bytes);
    },
  );

  defineRoute(
    app,
    {
      method: 'DELETE',
      url: '/v1/compliance/documents/:id',
      operationId: 'deleteComplianceDocument',
      summary: 'Remove a saved document',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      params: IdParams,
      responses: { 204: { description: 'Removed' } },
    },
    async ({ params, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:write');
      const key = await withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .delete(schema.complianceDocuments)
          .where(
            and(
              eq(schema.complianceDocuments.id, params.id),
              eq(schema.complianceDocuments.centreId, ctx.centreId!),
            ),
          )
          .returning({ key: schema.complianceDocuments.blobKey });
        if (!row) throw new AppError('not_found', 'Document not found.');
        await tx
          .delete(schema.reminders)
          .where(
            and(eq(schema.reminders.relatedResourceId, params.id), isNull(schema.reminders.sentAt)),
          );
        await audit(tx, raw, ctx, {
          action: 'compliance.document.delete',
          resourceType: 'document',
          resourceId: params.id,
        });
        return row.key;
      });
      await deps.blobs.delete(key).catch(() => undefined);
      return reply.status(204).send();
    },
  );

  // ---------- Policies ----------

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/policies/generate',
      operationId: 'generatePolicy',
      summary: 'Draft a policy from your answers (a draft until the principal approves it)',
      tags: ['policies'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      body: PolicyGenerateSchema,
      responses: { 201: { description: 'Draft policy', schema: PolicySchema } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'policy:write');
      const answers = validateAnswers(body.kind, body.answers);
      const name = await principalName(deps, ctx);
      const policy = await withRequestContext(deps.db, ctx, async (tx) => {
        const [centre] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, ctx.centreId!));
        const draft = draftPolicy(body.kind, answers, {
          centreName: centre!.name,
          principalName: name,
          todayIso: sastToday(deps.now()),
        });
        const [row] = await tx
          .insert(schema.policies)
          .values({ centreId: ctx.centreId!, kind: body.kind, answers, ...draft })
          .returning();
        await archiveOthers(tx, ctx.centreId!, body.kind, row!.id, ['draft']);
        await audit(tx, raw, ctx, {
          action: 'policy.generate',
          resourceType: 'policy',
          resourceId: row!.id,
        });
        return toPolicy(row!);
      });
      return reply.status(201).send(policy);
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/policies',
      operationId: 'listPolicies',
      summary: 'Current policy drafts and approved policies',
      tags: ['policies'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'Policies', schema: PolicyListSchema } },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const rows = await tx
          .select()
          .from(schema.policies)
          .where(eq(schema.policies.centreId, ctx.centreId!))
          .orderBy(desc(schema.policies.updatedAt));
        return {
          items: rows
            .filter((r) => r.status !== 'archived')
            .map(toPolicy)
            .map(({ bodyMarkdown: _b, answers: _a, ...p }) => p),
        };
      });
    },
  );

  const loadPolicy = (ctx: RequestContext, id: string) =>
    withRequestContext(deps.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.policies)
        .where(and(eq(schema.policies.id, id), eq(schema.policies.centreId, ctx.centreId!)));
      if (!row) throw new AppError('not_found', 'Policy not found.');
      return toPolicy(row);
    });

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/policies/:id',
      operationId: 'getPolicy',
      summary: 'One policy, with its text',
      tags: ['policies'],
      auth: 'user',
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'Policy', schema: PolicySchema } },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      return loadPolicy(ctx, params.id);
    },
  );

  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/v1/policies/:id',
      operationId: 'updatePolicy',
      summary: 'Edit a policy (editing an approved policy makes it a draft again)',
      tags: ['policies'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      params: IdParams,
      body: PolicyUpdateSchema,
      responses: { 200: { description: 'Policy', schema: PolicySchema } },
    },
    async ({ params, body, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'policy:write');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .update(schema.policies)
          .set({
            ...body,
            status: 'draft',
            approvedAt: null,
            approvedByUserId: null,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(schema.policies.id, params.id),
              eq(schema.policies.centreId, ctx.centreId!),
              ne(schema.policies.status, 'archived'),
            ),
          )
          .returning();
        if (!row) throw new AppError('not_found', 'Policy not found.');
        await audit(tx, raw, ctx, {
          action: 'policy.edit',
          resourceType: 'policy',
          resourceId: row.id,
        });
        return toPolicy(row);
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/policies/:id/approve',
      operationId: 'approvePolicy',
      summary: 'Approve a policy (principal): it goes into the application pack',
      tags: ['policies'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'Policy', schema: PolicySchema } },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'policy:write');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const [row] = await tx
          .update(schema.policies)
          .set({
            status: 'approved',
            approvedAt: deps.now(),
            approvedByUserId: ctx.userId,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(schema.policies.id, params.id),
              eq(schema.policies.centreId, ctx.centreId!),
              eq(schema.policies.status, 'draft'),
            ),
          )
          .returning();
        if (!row) throw new AppError('not_found', 'There is no draft to approve.');
        await archiveOthers(tx, ctx.centreId!, row.kind as never, row.id, ['approved']);
        await audit(tx, raw, ctx, {
          action: 'policy.approve',
          resourceType: 'policy',
          resourceId: row.id,
        });
        return toPolicy(row);
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/policies/:id/pdf',
      operationId: 'getPolicyPdf',
      summary: 'A policy as a low-ink A4 PDF',
      tags: ['policies'],
      auth: 'user',
      headers: centreHeader,
      params: IdParams,
      responses: { 200: { description: 'PDF (application/pdf)' } },
    },
    async ({ params, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:read');
      const policy = await loadPolicy(ctx, params.id);
      const centre = await withRequestContext(deps.db, ctx, async (tx) => {
        const [c] = await tx
          .select({ name: schema.centres.name })
          .from(schema.centres)
          .where(eq(schema.centres.id, ctx.centreId!));
        return c!;
      });
      const pdf = await markdownPdf({
        title: policy.title,
        subtitle: `${centre.name}${policy.approvedAt ? `. Approved on ${policy.approvedAt.slice(0, 10)}` : ''}`,
        markdown: policy.bodyMarkdown,
        draft: policy.status !== 'approved',
        footer: `${centre.name}  |  ${policy.title}`,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="${policy.kind}-policy.pdf"`)
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  );

  // ---------- Application pack ----------

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/compliance/pack',
      operationId: 'buildApplicationPack',
      summary: 'One PDF with centre details, self-audit, approved policies and documents',
      tags: ['compliance'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'PDF (application/pdf)' } },
    },
    async ({ raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'compliance:write');
      const name = await principalName(deps, ctx);
      const pdf = await withRequestContext(deps.db, ctx, async (tx) => {
        const bytes = await buildApplicationPack({
          tx,
          blobs: deps.blobs,
          centreId: ctx.centreId!,
          principalName: name,
          now: deps.now(),
        });
        await tx
          .update(schema.centres)
          .set({ registrationPackAt: deps.now() })
          .where(eq(schema.centres.id, ctx.centreId!));
        await audit(tx, raw, ctx, {
          action: 'compliance.pack',
          resourceType: 'centre',
          resourceId: ctx.centreId,
        });
        return bytes;
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', 'attachment; filename="application-pack.pdf"')
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  );
}
