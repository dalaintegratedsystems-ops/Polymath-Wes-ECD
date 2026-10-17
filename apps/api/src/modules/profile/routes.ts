import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, CentreSchema, MeSchema } from '@wes/shared';
import { schema, withRequestContext, type RequestContext, type Transaction } from '@wes/db';
import { audit, centreContext, userContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { cleanImage, MAX_IMAGE_BYTES } from '../../platform/images';
import { defineRoute } from '../../platform/route';
import { loadMe } from '../auth/service';

const IdParams = z.object({ id: z.uuid() });
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const imageBody = {
  name: 'content-type',
  in: 'header' as const,
  required: true,
  schema: { type: 'string', enum: IMAGE_TYPES },
};

async function saveImage(
  tx: Transaction,
  ownerKind: 'user' | 'centre',
  ownerId: string,
  body: unknown,
): Promise<string> {
  if (!Buffer.isBuffer(body)) {
    throw new AppError('validation_failed', 'Send the photo itself as a JPEG, PNG or WebP file.');
  }
  const { mime, bytes } = cleanImage(body);
  const id = crypto.randomUUID();
  await tx
    .insert(schema.profileImages)
    .values({ id, ownerKind, ownerId, mimeType: mime, bytes })
    .onConflictDoUpdate({
      target: [schema.profileImages.ownerKind, schema.profileImages.ownerId],
      set: { id, mimeType: mime, bytes, createdAt: new Date() },
    });
  return id;
}

async function sendImage(
  deps: AppDeps,
  ctx: RequestContext,
  ownerKind: 'user' | 'centre',
  ownerId: string,
  reply: FastifyReply,
) {
  const image = await withRequestContext(deps.db, ctx, async (tx) => {
    const [row] = await tx
      .select({ mime: schema.profileImages.mimeType, bytes: schema.profileImages.bytes })
      .from(schema.profileImages)
      .where(
        and(
          eq(schema.profileImages.ownerKind, ownerKind),
          eq(schema.profileImages.ownerId, ownerId),
        ),
      );
    return row;
  });
  if (!image) throw new AppError('not_found', 'No picture yet.');
  return reply
    .header('content-type', image.mime)
    .header('cache-control', 'private, max-age=604800, immutable')
    .send(Buffer.from(image.bytes));
}

/** Profile photo (any signed-in user) and centre logo (principal). Never children's photos. */
export async function profileRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;
  app.addContentTypeParser(
    IMAGE_TYPES,
    { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES + 1024 },
    (_req, body, done) => done(null, body),
  );

  defineRoute(
    app,
    {
      method: 'PUT',
      url: '/v1/me/avatar',
      operationId: 'putMyAvatar',
      summary: 'Set your profile photo (send the image bytes; max 512 KB; metadata removed)',
      tags: ['profile'],
      auth: 'user',
      headers: [imageBody],
      responses: { 200: { description: 'Current user', schema: MeSchema } },
    },
    async ({ raw }) =>
      withRequestContext(deps.db, userContext(raw), async (tx) => {
        const userId = raw.user!.id;
        const id = await saveImage(tx, 'user', userId, raw.body);
        await tx
          .update(schema.users)
          .set({ avatarBlobKey: id, updatedAt: new Date() })
          .where(eq(schema.users.id, userId));
        return loadMe(tx, userId);
      }),
  );

  defineRoute(
    app,
    {
      method: 'DELETE',
      url: '/v1/me/avatar',
      operationId: 'deleteMyAvatar',
      summary: 'Remove your profile photo',
      tags: ['profile'],
      auth: 'user',
      responses: { 200: { description: 'Current user', schema: MeSchema } },
    },
    async ({ raw }) =>
      withRequestContext(deps.db, userContext(raw), async (tx) => {
        const userId = raw.user!.id;
        await tx
          .delete(schema.profileImages)
          .where(
            and(
              eq(schema.profileImages.ownerKind, 'user'),
              eq(schema.profileImages.ownerId, userId),
            ),
          );
        await tx
          .update(schema.users)
          .set({ avatarBlobKey: null, updatedAt: new Date() })
          .where(eq(schema.users.id, userId));
        return loadMe(tx, userId);
      }),
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/users/:id/avatar',
      operationId: 'getUserAvatar',
      summary: 'A profile photo (only of yourself or people at your centres)',
      tags: ['profile'],
      auth: 'user',
      params: IdParams,
      responses: { 200: { description: 'Image bytes' } },
    },
    async ({ params, raw }, reply) => sendImage(deps, userContext(raw), 'user', params.id, reply),
  );

  defineRoute(
    app,
    {
      method: 'PUT',
      url: '/v1/centres/:id/logo',
      operationId: 'putCentreLogo',
      summary: 'Set the centre logo (principal; send the image bytes; max 512 KB)',
      tags: ['profile'],
      auth: 'user',
      params: IdParams,
      headers: [imageBody],
      responses: {
        200: { description: 'Logo saved', schema: CentreSchema.pick({ logoUrl: true }) },
      },
    },
    async ({ params, raw }) => {
      const ctx = await centreContext(deps, raw, params.id, 'centre:update');
      if (ctx.role !== 'principal')
        throw new AppError('forbidden', 'Only the principal can change the logo.');
      return withRequestContext(deps.db, ctx, async (tx) => {
        const id = await saveImage(tx, 'centre', params.id, raw.body);
        await tx
          .update(schema.centres)
          .set({ logoBlobKey: id })
          .where(eq(schema.centres.id, params.id));
        await audit(tx, raw, ctx, {
          action: 'centre.logo',
          resourceType: 'centre',
          resourceId: params.id,
        });
        return { logoUrl: `/v1/centres/${params.id}/logo?v=${id.slice(0, 8)}` };
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/centres/:id/logo',
      operationId: 'getCentreLogo',
      summary: 'The centre logo',
      tags: ['profile'],
      auth: 'user',
      params: IdParams,
      responses: { 200: { description: 'Image bytes' } },
    },
    async ({ params, raw }, reply) => {
      const ctx = await centreContext(deps, raw, params.id, 'centre:read');
      return sendImage(deps, ctx, 'centre', params.id, reply);
    },
  );
}
