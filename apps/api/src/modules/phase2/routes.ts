import type { FastifyInstance } from 'fastify';
import { AppError, FEATURE_FLAGS, type FeatureFlag } from '@wes/shared';
import { defineRoute } from '../../platform/route';

/**
 * Designed-for, not-yet-built capabilities (CLAUDE.md §3, ADR-0010). Each has a reserved
 * route that answers 501 so clients and partners can discover the shape of the API now,
 * and the module can be filled in later without moving anything.
 */
export async function phase2Routes(app: FastifyInstance) {
  for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
    const { route } = FEATURE_FLAGS[flag];
    defineRoute(
      app,
      {
        method: 'GET',
        url: route,
        operationId: `phase2_${flag}`,
        summary: `Reserved for ${flag} (phase 2, not built yet)`,
        tags: ['phase-2'],
        auth: 'user',
        responses: { 501: { description: 'Not implemented yet' } },
      },
      async () => {
        throw new AppError('not_implemented', `${flag} is planned for a later phase.`);
      },
    );
  }
}
