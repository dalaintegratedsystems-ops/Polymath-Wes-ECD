import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { canSendFreeform } from '@wes/channels';
import { AppError } from '@wes/shared';
import { ANONYMOUS, withRequestContext } from '@wes/db';
import type { Config } from '../../config';
import type { AppDeps } from '../../platform/deps';
import { defineRoute } from '../../platform/route';
import { rowsOf } from '../../platform/sql';
import { handleWhatsApp } from './whatsapp-bot';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

/** Messages being handled after the webhook has answered Meta (tests wait on these). */
const pending = new Set<Promise<void>>();
export async function whatsappIdle(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

const VerifyQuery = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().max(200).optional(),
});

/**
 * WhatsApp webhooks. Meta signs every POST with the app secret; anything unsigned is refused.
 * We answer within milliseconds (Meta retries slow webhooks) and do the work afterwards; each
 * message id is handled once even when Meta delivers it again.
 */
export async function channelRoutes(app: FastifyInstance, opts: { deps: AppDeps; config: Config }) {
  const { deps, config } = opts;
  const appUrl = config.WEB_ORIGIN.split(',')[0]!.replace(/\/$/, '');

  // Keep the exact bytes Meta signed.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 1_000_000 },
    (req, body, done) => {
      req.rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(null, null);
      }
    },
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/v1/channels/whatsapp/webhook',
      operationId: 'verifyWhatsAppWebhook',
      summary: 'Meta webhook verification (echoes hub.challenge when the verify token matches)',
      tags: ['channels'],
      auth: 'public',
      query: VerifyQuery,
      responses: {
        200: { description: 'The challenge, as plain text' },
        403: { description: 'Wrong token' },
      },
    },
    async ({ query }, reply) => {
      const token = config.WHATSAPP_VERIFY_TOKEN;
      if (!token || query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== token) {
        throw new AppError('forbidden', 'Verification failed.');
      }
      return reply.header('content-type', 'text/plain').send(query['hub.challenge'] ?? '');
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/v1/channels/whatsapp/webhook',
      operationId: 'receiveWhatsAppWebhook',
      summary: 'Incoming WhatsApp messages (signed by Meta with X-Hub-Signature-256)',
      tags: ['channels'],
      auth: 'public',
      rateLimit: { max: 600, timeWindow: '1 minute' },
      responses: {
        200: { description: 'Received' },
        401: { description: 'Signature missing or wrong' },
        404: { description: 'WhatsApp is not configured' },
      },
    },
    async ({ raw }, reply) => {
      const wa = deps.whatsapp;
      if (!wa) throw new AppError('not_found', 'WhatsApp is not configured.');
      const headers = raw.headers as Record<string, string | undefined>;
      if (!raw.rawBody || !wa.verifySignature(raw.rawBody, headers)) {
        throw new AppError('unauthenticated', 'Invalid signature.');
      }
      const messages = wa.parseInbound(raw.body);
      for (const msg of messages) {
        const job = (async () => {
          const [claimed] = await withRequestContext(deps.db, ANONYMOUS, async (tx) =>
            rowsOf<{ ok: boolean }>(
              await tx.execute(
                sql`select app.channel_claim_inbound(${msg.providerMessageId}, 'whatsapp') ok`,
              ),
            ),
          );
          if (!claimed?.ok) return; // Meta delivered it again
          await handleWhatsApp(deps, appUrl, msg);
        })()
          .catch((err: unknown) => raw.log.error({ err }, 'whatsapp message failed'))
          .finally(() => pending.delete(job));
        pending.add(job);
      }
      return reply.status(200).send({ received: messages.length });
    },
  );
}

/**
 * Send due reminders over WhatsApp. Inside the 24-hour window a normal message is allowed;
 * outside it only the approved reminder template may be used. Claims are atomic, so several
 * API replicas never send the same reminder twice.
 */
export async function sendDueReminders(deps: AppDeps, config: Config): Promise<number> {
  const wa = deps.whatsapp;
  if (!wa) return 0;
  const now = deps.now();
  const due = await withRequestContext(deps.db, ANONYMOUS, async (tx) =>
    rowsOf<{
      reminder_id: string;
      message: string;
      phone: string | null;
      last_inbound_at: Date | string | null;
    }>(
      await tx.execute(
        sql`select * from app.claim_due_reminders(${now.toISOString()}::timestamptz, 50)`,
      ),
    ),
  );
  let sent = 0;
  for (const r of due) {
    if (!r.phone) continue;
    const last = r.last_inbound_at ? new Date(r.last_inbound_at) : null;
    try {
      await wa.send(
        r.phone,
        canSendFreeform(last, now)
          ? [{ kind: 'text', text: `Reminder from Wes: ${r.message}` }]
          : [
              {
                kind: 'template',
                name: config.WHATSAPP_REMINDER_TEMPLATE,
                language: config.WHATSAPP_TEMPLATE_LANGUAGE,
                variables: [r.message.slice(0, 200)],
              },
            ],
      );
      sent += 1;
    } catch {
      // One failed send must not stop the others; it stays marked to avoid repeat spam.
    }
  }
  return sent;
}
