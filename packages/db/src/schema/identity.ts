import {
  boolean,
  date,
  primaryKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';

export const roleEnum = pgEnum('role', ['principal', 'practitioner', 'parent', 'funder', 'admin']);
export const localeEnum = pgEnum('locale', ['en', 'af', 'xh', 'zu']);
export const provinceEnum = pgEnum('province', [
  'EC',
  'FS',
  'GP',
  'KZN',
  'LP',
  'MP',
  'NC',
  'NW',
  'WC',
]);
export const registrationStatusEnum = pgEnum('registration_status', [
  'not_started',
  'in_progress',
  'submitted',
  'conditionally_registered',
  'registered',
]);

export const centres = pgTable('centres', {
  id: id(),
  name: text('name').notNull(),
  addressLine: text('address_line').notNull().default(''),
  suburb: text('suburb').notNull().default(''),
  city: text('city').notNull().default(''),
  province: provinceEnum('province').notNull(),
  agesServedMinMonths: integer('ages_served_min_months').notNull().default(0),
  agesServedMaxMonths: integer('ages_served_max_months').notNull().default(72),
  childCount: integer('child_count').notNull().default(0),
  registrationStatus: registrationStatusEnum('registration_status')
    .notNull()
    .default('not_started'),
  defaultLocale: localeEnum('default_locale').notNull().default('en'),
  /** Person the centre designates for child-protection concerns (escalation flow). */
  designatedSafeguardingUserId: uuid('designated_safeguarding_user_id'),
  logoBlobKey: text('logo_blob_key'),
  ...timestamps(),
});

export const userStatusEnum = pgEnum('user_status', ['active', 'deactivated']);

/**
 * Users sign in with a phone PIN (phone stored as E.164) or, when an admin set one up, a
 * username and password (Argon2id hash). At least one of the two identifiers is present.
 */
export const users = pgTable(
  'users',
  {
    id: id(),
    phoneE164: text('phone_e164'),
    username: text('username'),
    passwordHash: text('password_hash'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    status: userStatusEnum('status').notNull().default('active'),
    displayName: text('display_name').notNull(),
    locale: localeEnum('locale').notNull().default('en'),
    avatarBlobKey: text('avatar_blob_key'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phoneE164),
    uniqueIndex('users_username_uq').on(t.username),
  ],
);

/** One row per user per active day: powers DAU/WAU/MAU and retention without tracking content. */
export const userActivityDays = pgTable(
  'user_activity_days',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    centreId: uuid('centre_id'),
    role: text('role'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index('user_activity_day_idx').on(t.day)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('memberships_user_centre_uq').on(t.userId, t.centreId),
    index('memberships_centre_idx').on(t.centreId),
  ],
);

export const invitations = pgTable('invitations', {
  id: id(),
  centreId: uuid('centre_id')
    .notNull()
    .references(() => centres.id, { onDelete: 'cascade' }),
  phoneE164: text('phone_e164').notNull(),
  role: roleEnum('role').notNull(),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
});

/** OTP codes are stored hashed with an attempt counter (ADR-0004). */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    phoneE164: text('phone_e164').notNull(),
    codeHash: text('code_hash').notNull(),
    channel: text('channel', { enum: ['whatsapp', 'sms', 'console'] }).notNull(),
    /** 'sign_in' for login codes; 'consent' when a guardian confirms consent for a child. */
    purpose: text('purpose', { enum: ['sign_in', 'consent'] })
      .notNull()
      .default('sign_in'),
    /** For consent codes: the pending child id the code confirms. */
    subjectId: uuid('subject_id'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_phone_idx').on(t.phoneE164, t.createdAt)],
);

/** Refresh tokens rotate on every use; reuse of a rotated token revokes the family. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_token_hash_uq').on(t.tokenHash),
    index('refresh_family_idx').on(t.familyId),
  ],
);
