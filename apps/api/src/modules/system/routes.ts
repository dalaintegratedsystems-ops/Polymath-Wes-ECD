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
});

export async function systemRoutes(app: FastifyInstance, opts: { config: Config }) {
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
    }),
  );

  // Not declared through defineRoute: the spec does not describe itself.
  app.get('/v1/openapi.json', async () => buildOpenApi(app.routeSpecs, opts.config.APP_VERSION));
}
