import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';
import { centres, users } from './identity';

export const groups = pgTable('groups', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ageBandMinMonths: integer('age_band_min_months').notNull(),
  ageBandMaxMonths: integer('age_band_max_months').notNull(),
  ...timestamps(),
});

/**
 * A child exists here as a pending intake until a guardian consents.
 * Only then is a `children` row created (CLAUDE.md §7: consent before any child record).
 * Intakes expire and are purged if consent never arrives.
 */
export const childIntakes = pgTable('child_intakes', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  birthMonth: text('birth_month').notNull(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  guardianId: uuid('guardian_id').notNull(),
  childId: uuid('child_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
});

export const childStatusEnum = pgEnum('child_status', ['active', 'left']);

/** Minimal child record: pseudonymous id, first name, birth month, group. No surname, no ID number. */
export const children = pgTable(
  'children',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    birthMonth: text('birth_month').notNull(),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    status: childStatusEnum('status').notNull().default('active'),
    ...timestamps(),
  },
  (t) => [index('children_centre_idx').on(t.centreId)],
);

/**
 * Guardian contact details are encrypted at field level (ADR-0007).
 * `phoneBlindIndex` is an HMAC of the normalised phone so we can find a guardian
 * without decrypting every row.
 */
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    phoneCiphertext: text('phone_ciphertext').notNull(),
    phoneBlindIndex: text('phone_blind_index').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('guardians_centre_idx').on(t.centreId),
    uniqueIndex('guardians_centre_phone_uq').on(t.centreId, t.phoneBlindIndex),
  ],
);

export const relationshipEnum = pgEnum('guardian_relationship', [
  'mother',
  'father',
  'grandparent',
  'aunt_uncle',
  'guardian',
  'other',
]);

export const childGuardians = pgTable(
  'child_guardians',
  {
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    relationship: relationshipEnum('relationship').notNull(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.guardianId] })],
);

export const consentMethodEnum = pgEnum('consent_method', ['paper_photo', 'guardian_otp']);

/**
 * Consent is append-only: revoking sets `revokedAt` and triggers deletion of the
 * child's records (keeping only anonymous monthly counts — see attendanceMonthlyCounts).
 * The consent row itself keeps no child name once the child is deleted.
 */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    childId: uuid('child_id').references(() => children.id, { onDelete: 'set null' }),
    intakeId: uuid('intake_id').references(() => childIntakes.id, { onDelete: 'set null' }),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    purposes: text('purposes').array().notNull(),
    method: consentMethodEnum('method').notNull(),
    evidenceDocumentId: uuid('evidence_document_id'),
    capturedByUserId: uuid('captured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('consents_child_idx').on(t.childId)],
);

export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'excused']);

/** One row per child per day. Offline edits resolve last-write-wins on `clientUpdatedAt` (ADR-0005). */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('attendance_child_day_uq').on(t.childId, t.day),
    index('attendance_centre_day_idx').on(t.centreId, t.day),
  ],
);

/**
 * Anonymous per-centre daily headcounts. Kept when a child's records are deleted on
 * consent revocation, so subsidy-claim evidence survives without identifying anyone.
 * (Decision #2 in the Milestone 0 plan — default assumed, pending confirmation.)
 */
export const attendanceDailyCounts = pgTable(
  'attendance_daily_counts',
  {
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    presentCount: integer('present_count').notNull(),
    enrolledCount: integer('enrolled_count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.centreId, t.day] })],
);
