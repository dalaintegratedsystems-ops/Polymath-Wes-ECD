import { date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';
import { centres, users } from './identity';

/** Everything Wes generates is a draft until a person approves it (CLAUDE.md §2, principle 4). */
export const draftStatusEnum = pgEnum('draft_status', ['draft', 'approved', 'archived']);

export const policies = pgTable(
  'policies',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['admissions', 'health', 'safety', 'child_protection', 'other'],
    }).notNull(),
    title: text('title').notNull(),
    answers: jsonb('answers').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    status: draftStatusEnum('status').notNull().default('draft'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    pdfBlobKey: text('pdf_blob_key'),
    ...timestamps(),
  },
  (t) => [index('policies_centre_idx').on(t.centreId)],
);

export const weeklyPlans = pgTable(
  'weekly_plans',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id'),
    weekStarting: date('week_starting').notNull(),
    theme: text('theme').notNull(),
    /** Days → activities, each tagged with ELDA codes and citations. */
    plan: jsonb('plan').notNull(),
    citations: jsonb('citations').notNull().default([]),
    status: draftStatusEnum('status').notNull().default('draft'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [index('weekly_plans_centre_week_idx').on(t.centreId, t.weekStarting)],
);

export const activities = pgTable('activities', {
  id: id(),
  /** Null for the shared library; set for centre-specific adaptations. */
  centreId: uuid('centre_id').references(() => centres.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  eldaCodes: text('elda_codes').array().notNull().default([]),
  ageBandMinMonths: integer('age_band_min_months'),
  ageBandMaxMonths: integer('age_band_max_months'),
  materials: jsonb('materials').notNull().default([]),
  steps: jsonb('steps').notNull().default([]),
  adaptedFromId: uuid('adapted_from_id'),
  ...timestamps(),
});

export const printables = pgTable('printables', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['worksheet', 'flashcards', 'colouring', 'poster'] }).notNull(),
  title: text('title').notNull(),
  spec: jsonb('spec').notNull(),
  pdfBlobKey: text('pdf_blob_key'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps(),
});
