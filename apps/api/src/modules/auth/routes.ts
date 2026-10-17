import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  MeSchema,
  MeUpdateSchema,
  OtpRequestSchema,
  OtpRequestedSchema,
  RefreshRequestSchema,
  TokenPairSchema,
  TokenRequestSchema,
} from '@wes/shared';
import { schema, withRequestContext } from '@wes/db';
import type { Config } from '../../config';
import { userContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import type { TokenService } from '../../platform/tokens';
import { createAuthService, loadMe } from './service';

export async function authRoutes(
  app: FastifyInstance,
  opts: { deps: AppDeps; config: Config; tokens: TokenService },
) {
  const auth = createAuthService(opts.deps, opts.config, opts.tokens);
  const otpLimit = { max: opts.config.OTP_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' };

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/auth/otp',
      operationId: 'requestOtp',
      summary: 'Send a 6-digit sign-in PIN by WhatsApp (or SMS)',
      tags: ['auth'],
      auth: 'public',
      rateLimit: otpLimit,
      body: OtpRequestSchema,
      responses: {
        202: {
          description: 'PIN sent (we never reveal whether the number has an account)',
          schema: OtpRequestedSchema,
        },
      },
    },
    async ({ body }, reply) => reply.status(202).send(await auth.requestOtp(body.phone)),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/auth/token',
      operationId: 'exchangeOtp',
      summary: 'Exchange a PIN for an access token and a refresh token',
      tags: ['auth'],
      auth: 'public',
      rateLimit: otpLimit,
      body: TokenRequestSchema,
      responses: { 200: { description: 'Signed in', schema: TokenPairSchema } },
    },
    async ({ body }) => auth.exchangeOtp(body),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/auth/refresh',
      operationId: 'refreshToken',
      summary: 'Rotate the refresh token and get a new access token',
      tags: ['auth'],
      auth: 'public',
      body: RefreshRequestSchema,
      responses: { 200: { description: 'New token pair', schema: TokenPairSchema } },
    },
    async ({ body }) => auth.refresh(body.refreshToken),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/auth/logout',
      operationId: 'logout',
      summary: 'Revoke this session (the refresh token family)',
      tags: ['auth'],
      auth: 'public',
      body: RefreshRequestSchema,
      responses: { 204: { description: 'Signed out' } },
    },
    async ({ body }, reply) => {
      await auth.signOut(body.refreshToken);
      return reply.status(204).send();
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/me',
      operationId: 'getMe',
      summary: 'The signed-in user and their centres',
      tags: ['auth'],
      auth: 'user',
      responses: { 200: { description: 'Current user', schema: MeSchema } },
    },
    async ({ raw }) =>
      withRequestContext(opts.deps.db, userContext(raw), (tx) => loadMe(tx, raw.user!.id)),
  );

  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/v1/me',
      operationId: 'updateMe',
      summary: 'Update your name or language',
      tags: ['auth'],
      auth: 'user',
      idempotent: true,
      body: MeUpdateSchema,
      responses: { 200: { description: 'Current user', schema: MeSchema } },
    },
    async ({ body, raw }) =>
      withRequestContext(opts.deps.db, userContext(raw), async (tx) => {
        if (Object.keys(body).length > 0) {
          await tx.update(schema.users).set(body).where(eq(schema.users.id, raw.user!.id));
        }
        return loadMe(tx, raw.user!.id);
      }),
  );
}
