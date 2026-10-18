import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';
import { centres, users } from './identity';

/**
 * Append-only audit trail. The app role may INSERT but never SELECT, UPDATE or DELETE
 * (enforced by grants in the RLS migration). Every read/write of child data lands here.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    centreId: uuid('centre_id'),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id'),
    channel: text('channel'),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [index('audit_log_centre_time_idx').on(t.centreId, t.occurredAt)],
);

/** Idempotency keys for write endpoints; replays return the stored response. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['document_expiry', 'registration_step', 'custom'] }).notNull(),
    message: text('message').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    relatedResourceId: uuid('related_resource_id'),
    ...timestamps(),
  },
  (t) => [index('reminders_due_idx').on(t.dueAt)],
);

/** Per-centre monthly token usage, for budgets and cost reporting. */
export const usageLedger = pgTable(
  'usage_ledger',
  {
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    budgetTokens: integer('budget_tokens').notNull(),
  },
  (t) => [primaryKey({ columns: [t.centreId, t.month] })],
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    flag: text('flag').notNull(),
    /** Null = global default; otherwise a per-centre override. */
    centreId: uuid('centre_id').references(() => centres.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
    ...timestamps(),
  },
  (t) => [index('feature_flags_flag_idx').on(t.flag, t.centreId)],
);

/**
 * Inbound channel messages already handled. Meta retries webhooks, so a message id seen
 * twice is ignored. Written only through app.channel_claim_inbound().
 */
export const channelInbound = pgTable('channel_inbound', {
  providerMessageId: text('provider_message_id').primaryKey(),
  channel: text('channel').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
