import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FEATURE_FLAGS, LOCALES, isFeatureEnabled, type FeatureFlag } from '@wes/shared';
import type { Config } from '../../config';
import { buildOpenApi } from '../../platform/openapi';
import { defineRoute } from '../../platform/route';

const HealthSchema = z.object({ status: z.literal('ok'), version: z.string() });

const MetaSchema = z.object({
  version: z.string(),
  locales: z.array(z.string()),
  features: z.record(z.string(), z.boolean()),
  /** 'offline' when no model key is configured (development). */
  assistantMode: z.enum(['live', 'offline']),
});

export async function systemRoutes(
  app: FastifyInstance,
  opts: { config: Config; assistantMode: 'live' | 'offline' },
) {
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/healthz',
      operationId: 'getHealth',
      summary: 'Liveness probe',
      tags: ['system'],
      auth: 'public',
      responses: { 200: { description: 'Service is up', schema: HealthSchema } },
    },
    async () => ({ status: 'ok' as const, version: opts.config.APP_VERSION }),
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/meta',
      operationId: 'getMeta',
      summary: 'Client bootstrap: API version, locales and feature flags',
      tags: ['system'],
      auth: 'public',
      responses: { 200: { description: 'Metadata', schema: MetaSchema } },
    },
    async () => ({
      version: opts.config.APP_VERSION,
      locales: [...LOCALES],
      features: Object.fromEntries(
        (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).map((f) => [f, isFeatureEnabled(f)]),
      ),
      assistantMode: opts.assistantMode,
    }),
  );

  // Not declared through defineRoute: the spec does not describe itself.
  app.get('/v1/openapi.json', async () => buildOpenApi(app.routeSpecs, opts.config.APP_VERSION));
}
