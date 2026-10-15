import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';
import { centres, users } from './identity';

export const channelEnum = pgEnum('channel', ['web', 'whatsapp', 'sms']);
export const riskLevelEnum = pgEnum('risk_level', ['normal', 'sensitive', 'child_protection']);

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: channelEnum('channel').notNull(),
    /** WhatsApp: last inbound message time, for the 24-hour service window. */
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    state: jsonb('state').notNull().default({}),
    ...timestamps(),
  },
  (t) => [index('conversations_user_idx').on(t.userId)],
);

/**
 * Message content is stored redacted (names/contacts replaced by tokens) — the same
 * text that went to the model. Re-identification happens only at render time.
 */
export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    contentRedacted: text('content_redacted').notNull(),
    citations: jsonb('citations').notNull().default([]),
    attachments: jsonb('attachments').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    inputMessageId: uuid('input_message_id'),
    outputMessageId: uuid('output_message_id'),
    intent: text('intent'),
    language: text('language'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('normal'),
    escalated: boolean('escalated').notNull().default(false),
    routerModel: text('router_model'),
    mainModel: text('main_model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    latencyMs: integer('latency_ms'),
    postCheck: jsonb('post_check'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_runs_centre_idx').on(t.centreId, t.createdAt)],
);

export const toolCalls = pgTable('tool_calls', {
  id: id(),
  agentRunId: uuid('agent_run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  ok: boolean('ok').notNull(),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable('feedback', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  rating: text('rating', { enum: ['up', 'down'] }).notNull(),
  reason: text('reason', {
    enum: ['wrong', 'not_helpful', 'not_relevant_locally', 'too_long', 'unsafe', 'other'],
  }),
  comment: text('comment'),
  ...timestamps(),
});
