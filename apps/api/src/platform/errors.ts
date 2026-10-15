import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, type ErrorEnvelope } from '@wes/shared';

function envelope(
  code: ErrorEnvelope['error']['code'],
  message: string,
  requestId: string,
  details?: ErrorEnvelope['error']['details'],
): ErrorEnvelope {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/** Every failure leaves the API in the same envelope. Internal details never leak. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.status)
        .send(envelope(err.code, err.message, request.id, err.details));
    }
    if (err.statusCode === 429) {
      return reply
        .status(429)
        .send(envelope('rate_limited', 'Too many requests. Try again soon.', request.id));
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      // Fastify's own client errors, e.g. malformed JSON or body too large.
      return reply.status(err.statusCode).send(envelope('bad_request', err.message, request.id));
    }
    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send(envelope('internal', 'Something went wrong on our side.', request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(envelope('not_found', `No route for ${request.method} ${request.url}`, request.id)),
  );
}
