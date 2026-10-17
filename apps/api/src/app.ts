import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from './config';
import { registerAuthentication } from './platform/context';
import type { AppDeps } from './platform/deps';
import { registerErrorHandling } from './platform/errors';
import { registerIdempotency, type IdempotencyStore } from './platform/idempotency';
import { createPostgresIdempotencyStore } from './platform/idempotency-pg';
import { registerRouteRegistry } from './platform/route';
import { createTokenService } from './platform/tokens';
import { assistantRoutes } from './modules/assistant/routes';
import { authRoutes } from './modules/auth/routes';
import { centreRoutes } from './modules/centres/routes';
import { childrenRoutes } from './modules/children/routes';
import { phase2Routes } from './modules/phase2/routes';
import { systemRoutes } from './modules/system/routes';

export interface BuildOptions {
  deps: AppDeps;
  config?: Partial<Config>;
  idempotencyStore?: IdempotencyStore;
  logger?: boolean;
  /** Extra plugins, used by tests to mount fixtures before the app is ready. */
  register?: (app: FastifyInstance) => Promise<void>;
}

/**
 * Modular monolith. Each domain module registers its own routes; all of them reach the
 * database only through `withRequestContext`, so row-level security always applies.
 */
export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...options.config };
  const { deps } = options;
  const tokens = createTokenService({
    secret: config.JWT_SIGNING_SECRET,
    accessTtlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    now: deps.now,
  });

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            // Never log credentials, PINs or contact details.
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.phone',
              '*.phoneE164',
              '*.code',
              '*.refreshToken',
            ],
          },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    bodyLimit: 1_000_000,
    trustProxy: config.NODE_ENV === 'production',
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
  await app.register(cors, { origin: config.WEB_ORIGIN.split(','), credentials: true });
  await app.register(rateLimit, { max: config.RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });

  registerRouteRegistry(app);
  registerErrorHandling(app);
  registerAuthentication(app, tokens);
  registerIdempotency(app, options.idempotencyStore ?? createPostgresIdempotencyStore(deps.db));

  await app.register(systemRoutes, { config, assistantMode: deps.agent.config.mode });
  await app.register(authRoutes, { deps, config, tokens });
  await app.register(centreRoutes, { deps });
  await app.register(childrenRoutes, { deps, config });
  await app.register(assistantRoutes, { deps });
  await app.register(phase2Routes);
  if (options.register) await options.register(app);

  return app;
}
