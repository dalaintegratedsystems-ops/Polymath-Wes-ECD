import {
  date,
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

/**
 * Global catalogue of registration requirements. Content comes from the curated
 * knowledge base — never invented (CLAUDE.md §10). Seeded with TODO(content) placeholders.
 */
export const complianceItems = pgTable('compliance_items', {
  id: id(),
  code: text('code').notNull().unique(),
  category: text('category', {
    enum: ['premises', 'health_safety', 'staffing', 'programme', 'governance', 'documents'],
  }).notNull(),
  title: text('title').notNull(),
  guidance: text('guidance').notNull(),
  requiresDocument: text('requires_document'),
  sortOrder: integer('sort_order').notNull().default(0),
  knowledgeSourceId: uuid('knowledge_source_id'),
  ...timestamps(),
});

export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'accepted',
  'expired',
  'rejected',
]);

export const complianceDocuments = pgTable(
  'compliance_documents',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    complianceItemId: uuid('compliance_item_id').references(() => complianceItems.id, {
      onDelete: 'set null',
    }),
    documentType: text('document_type').notNull(),
    blobKey: text('blob_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    status: documentStatusEnum('status').notNull().default('uploaded'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    index('compliance_docs_centre_idx').on(t.centreId),
    index('compliance_docs_expiry_idx').on(t.expiresOn),
  ],
);

/** A self-audit run: answers in, prioritised gap list out. */
export const auditRuns = pgTable('audit_runs', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  runByUserId: uuid('run_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  answers: jsonb('answers').notNull(),
  gaps: jsonb('gaps').notNull(),
  scorePercent: integer('score_percent').notNull(),
  knowledgeCorpusVersion: text('knowledge_corpus_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
