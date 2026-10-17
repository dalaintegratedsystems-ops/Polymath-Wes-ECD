import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import type { z } from 'zod';
import { AppError } from '@wes/shared';

/**
 * One way to declare a route: Zod schemas for input and output, used for runtime
 * validation, TypeScript types and the OpenAPI 3.1 document (`/v1/openapi.json`).
 */
export interface RouteSpec<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
> {
  method: HTTPMethods;
  url: string;
  operationId: string;
  summary: string;
  tags: string[];
  /** 'public' routes need no token. Everything else requires a bearer token (Milestone 1). */
  auth: 'public' | 'user';
  /** Writes that must carry an Idempotency-Key header. */
  idempotent?: boolean;
  /** Per-route limit, stricter than the global one (e.g. OTP requests). */
  rateLimit?: { max: number; timeWindow: string };
  /** Extra OpenAPI header parameters (documentation only; validate in the handler). */
  headers?: { name: string; in: 'header'; required: boolean; schema: Record<string, unknown> }[];
  params?: P;
  query?: Q;
  body?: B;
  responses: Record<number, { description: string; schema?: z.ZodType }>;
}

export interface TypedRequest<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  raw: FastifyRequest;
}

/** Route specs live on the root Fastify instance (shared by reference with child plugins). */
export function registerRouteRegistry(app: FastifyInstance): void {
  app.decorate('routeSpecs', [] as RouteSpec[]);
}

function parseOrThrow<T extends z.ZodType>(schema: T | undefined, value: unknown, where: string) {
  if (!schema) return value as z.infer<T>;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      'validation_failed',
      `Invalid ${where}`,
      result.error.issues.map((i) => ({
        path: [where, ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    );
  }
  return result.data;
}

export function defineRoute<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  app: FastifyInstance,
  spec: RouteSpec<P, Q, B>,
  handler: (
    req: TypedRequest<z.infer<P>, z.infer<Q>, z.infer<B>>,
    reply: FastifyReply,
  ) => Promise<unknown>,
): void {
  if (app.routeSpecs.some((r) => r.operationId === spec.operationId)) {
    throw new Error(`Duplicate operationId: ${spec.operationId}`);
  }
  app.routeSpecs.push(spec as RouteSpec);

  app.route({
    method: spec.method,
    url: spec.url,
    config: {
      idempotent: spec.idempotent ?? false,
      auth: spec.auth,
      ...(spec.rateLimit ? { rateLimit: spec.rateLimit } : {}),
    },
    handler: async (request, reply) => {
      const params = parseOrThrow(spec.params, request.params, 'params');
      const query = parseOrThrow(spec.query, request.query, 'query');
      const body = parseOrThrow(spec.body, request.body, 'body');
      return handler({ params, query, body, raw: request }, reply);
    },
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    routeSpecs: RouteSpec[];
  }
  interface FastifyContextConfig {
    idempotent?: boolean;
    auth?: 'public' | 'user';
  }
}
