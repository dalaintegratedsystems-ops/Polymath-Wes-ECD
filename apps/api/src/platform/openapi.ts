import { z } from 'zod';
import { ErrorEnvelopeSchema } from '@wes/shared';
import type { RouteSpec } from './route';

type JsonSchema = Record<string, unknown>;

// Inline every schema per operation. Ids set with `.meta({ id })` would otherwise turn the
// root into a bare $ref with local $defs, which OpenAPI tools resolve inconsistently.
const noIds = z.registry<{ id?: string }>();

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
    metadata: noIds,
  }) as JsonSchema;
  return rest;
}

function pathParams(spec: RouteSpec) {
  if (!spec.params) return [];
  const json = toSchema(spec.params, 'input') as { properties?: Record<string, JsonSchema> };
  return Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    in: 'path',
    required: true,
    schema,
  }));
}

function queryParams(spec: RouteSpec) {
  if (!spec.query) return [];
  const json = toSchema(spec.query, 'input') as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    in: 'query',
    required: json.required?.includes(name) ?? false,
    schema,
  }));
}

/** Build the OpenAPI 3.1 document from the route registry. */
export function buildOpenApi(routes: readonly RouteSpec[], version: string) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const spec of routes) {
    const path = spec.url.replace(/:(\w+)/g, '{$1}');
    const parameters: unknown[] = [
      ...pathParams(spec),
      ...queryParams(spec),
      ...(spec.headers ?? []),
    ];
    if (spec.idempotent) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'Unique key (8–128 chars) so retries over flaky networks never double-write.',
        schema: { type: 'string', minLength: 8, maxLength: 128 },
      });
    }

    const responses: Record<string, unknown> = {};
    for (const [status, r] of Object.entries(spec.responses)) {
      responses[status] = r.schema
        ? {
            description: r.description,
            content: { 'application/json': { schema: toSchema(r.schema, 'output') } },
          }
        : { description: r.description };
    }
    responses.default = {
      description: 'Error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    };

    paths[path] ??= {};
    paths[path][spec.method.toString().toLowerCase()] = {
      operationId: spec.operationId,
      summary: spec.summary,
      tags: spec.tags,
      ...(spec.auth === 'user' ? { security: [{ bearerAuth: [] }] } : { security: [] }),
      ...(parameters.length ? { parameters } : {}),
      ...(spec.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toSchema(spec.body, 'input') } },
            },
          }
        : {}),
      responses,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Polymath Wes API',
      version,
      description:
        'One versioned API for the PWA, WhatsApp, and future funder and partner clients. ' +
        'All errors use the ErrorEnvelope shape.',
      contact: { name: 'Dala Integrated Systems' },
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { ErrorEnvelope: toSchema(ErrorEnvelopeSchema, 'output') },
    },
  };
}
