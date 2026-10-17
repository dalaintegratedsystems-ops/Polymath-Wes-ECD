import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  AssistantMessageRequestSchema,
  ConversationSchema,
  FeedbackRequestSchema,
  type AssistantEvent,
} from '@wes/shared';
import { schema, withRequestContext } from '@wes/db';
import { centreContext } from '../../platform/context';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { latestConversation, loadTurnContext, persistTurn, toolServices } from './store';

function centreIdFromHeader(req: FastifyRequest): string {
  const parsed = z.uuid().safeParse(req.headers['x-centre-id']);
  if (!parsed.success) throw new AppError('bad_request', 'Send the X-Centre-Id header.');
  return parsed.data;
}

const centreHeader = [
  {
    name: 'X-Centre-Id',
    in: 'header' as const,
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

/** Ask Wes. One agent serves the PWA and (from Milestone 6) WhatsApp. */
export async function assistantRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/assistant/messages',
      operationId: 'askWes',
      summary:
        'Send a message to Wes. Responds with server-sent events: start, delta (text), replace (corrected full text), done (citations), error.',
      tags: ['assistant'],
      auth: 'user',
      rateLimit: { max: 20, timeWindow: '1 minute' },
      headers: centreHeader,
      body: AssistantMessageRequestSchema,
      responses: { 200: { description: 'text/event-stream of AssistantEvent' } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'assistant:use');
      const turn = await loadTurnContext(deps, ctx, body.conversationId);

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
        'x-request-id': raw.id,
      });
      const send = (e: AssistantEvent) =>
        res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);

      const started = Date.now();
      let streamed = '';
      try {
        send({ event: 'start', data: { conversationId: turn.conversationId } });
        const result = await deps.agent.wes.respond({
          text: body.text,
          centreId: ctx.centreId!,
          centreName: turn.centreName,
          userId: ctx.userId!,
          role: ctx.role as 'principal' | 'practitioner' | 'parent',
          channel: 'web',
          safeguardingName: turn.safeguardingName,
          knownNames: turn.knownNames,
          history: turn.history,
          services: toolServices(deps, ctx),
          budgetRemaining: turn.budgetRemaining,
          onDelta: (text) => {
            if (!text) return;
            streamed += text;
            send({ event: 'delta', data: { text } });
          },
        });
        // The post-check or safety gate can change what was streamed: send the final text.
        if (result.text !== streamed) send({ event: 'replace', data: { text: result.text } });
        const { messageId } = await persistTurn(
          deps,
          ctx,
          turn,
          result,
          Date.now() - started,
          raw.id,
        );
        send({
          event: 'done',
          data: { messageId, citations: result.citations, safety: result.escalated },
        });
      } catch (err) {
        raw.log.error({ err }, 'assistant turn failed');
        send({ event: 'error', data: { message: 'Something went wrong. Please try again.' } });
      } finally {
        res.end();
      }
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/assistant/conversations/latest',
      operationId: 'latestConversation',
      summary: 'Your most recent conversation with Wes, to pick up where you left off',
      tags: ['assistant'],
      auth: 'user',
      headers: centreHeader,
      responses: { 200: { description: 'Conversation', schema: ConversationSchema } },
    },
    async ({ raw }) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'assistant:use');
      return latestConversation(deps, ctx);
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/assistant/feedback',
      operationId: 'sendFeedback',
      summary: 'Thumbs up or down on a Wes answer, with an optional reason (feeds the evals)',
      tags: ['assistant'],
      auth: 'user',
      idempotent: true,
      headers: centreHeader,
      body: FeedbackRequestSchema,
      responses: { 201: { description: 'Feedback saved' } },
    },
    async ({ body, raw }, reply) => {
      const ctx = await centreContext(deps, raw, centreIdFromHeader(raw), 'assistant:use');
      await withRequestContext(deps.db, ctx, async (tx) => {
        const [msg] = await tx
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(
            and(eq(schema.messages.id, body.messageId), eq(schema.messages.role, 'assistant')),
          );
        if (!msg) throw new AppError('not_found', 'Message not found.');
        await tx.insert(schema.feedback).values({
          centreId: ctx.centreId!,
          messageId: body.messageId,
          userId: ctx.userId,
          rating: body.rating,
          reason: body.reason ?? null,
          comment: body.comment ?? null,
        });
      });
      return reply.status(201).send({ saved: true });
    },
  );
}
