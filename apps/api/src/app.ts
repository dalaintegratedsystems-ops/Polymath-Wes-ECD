import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from './config';
import { registerErrorHandling } from './platform/errors';
import {
  createMemoryIdempotencyStore,
  registerIdempotency,
  type IdempotencyStore,
} from './platform/idempotency';
import { registerRouteRegistry } from './platform/route';
import { phase2Routes } from './modules/phase2/routes';
import { systemRoutes } from './modules/system/routes';

export interface BuildOptions {
  config?: Partial<Config>;
  idempotencyStore?: IdempotencyStore;
  logger?: boolean;
  /** Extra plugins, used by tests to mount fixtures before the app is ready. */
  register?: (app: FastifyInstance) => Promise<void>;
}

/**
 * Modular monolith. Each domain module (auth, centres, children, consent, attendance,
 * compliance, policies, planner, printables, assistant, channels) registers its own
 * routes as it is built in Milestones 1–6.
 */
export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...options.config };

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            // Never log credentials or contact details.
            redact: ['req.headers.authorization', 'req.headers.cookie', '*.phone', '*.phoneE164'],
          },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    bodyLimit: 1_000_000,
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
  registerIdempotency(app, options.idempotencyStore ?? createMemoryIdempotencyStore());

  await app.register(systemRoutes, { config });
  await app.register(phase2Routes);
  if (options.register) await options.register(app);

  return app;
}
