import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Deployment environment. 'production' enforces every safety check; 'staging' is a private
   * pilot that may print PINs to the server log and run Wes offline. Defaults from NODE_ENV.
   */
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(120),
  OTP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(5),
  APP_VERSION: z.string().default('0.0.0-dev'),

  /** Postgres as wes_app. When unset in development, an embedded database is used. */
  DATABASE_URL: z.string().optional(),
  EMBEDDED_DB_DIR: z.string().default('.data/pglite'),
  /** Registration documents: filesystem locally, Azure Blob (managed identity) when deployed. */
  BLOB_DRIVER: z.enum(['memory', 'filesystem', 'azure']).default('filesystem'),
  BLOB_DIR: z.string().default('.data/blobs'),
  BLOB_ACCOUNT_URL: z.url().optional(),
  BLOB_CONTAINER: z.string().default('documents'),
  AZURE_CLIENT_ID: z.string().optional(),

  JWT_SIGNING_SECRET: z.string().min(32).default('dev-only-signing-secret-change-me-0123456789'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(600),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(30 * 24 * 3600),

  OTP_DELIVERY: z.enum(['console', 'whatsapp', 'sms']).default('console'),
  /** WhatsApp Cloud API (Meta). All four are needed to switch the channel on. */
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(16).optional(),
  WHATSAPP_GRAPH_URL: z.url().default('https://graph.facebook.com'),
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v21.0'),
  /** Approved message templates (created in Meta Business Manager). */
  WHATSAPP_OTP_TEMPLATE: z.string().default('wes_sign_in_code'),
  WHATSAPP_REMINDER_TEMPLATE: z.string().default('wes_reminder'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),
  /** Development/e2e only: also append sent PINs as JSON lines to this file. */
  OTP_OUTBOX_FILE: z.string().optional(),
  OTP_PEPPER: z.string().min(16).default('dev-only-otp-pepper-change-me'),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  PASSWORD_MAX_FAILURES: z.coerce.number().int().min(3).default(5),
  PASSWORD_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  PASSWORD_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(10),
  /** Sign-in codes allowed per phone in 15 minutes. */
  OTP_MAX_PER_WINDOW: z.coerce.number().int().default(3),
});

export type Config = z.infer<typeof ConfigSchema> & {
  APP_ENV: 'development' | 'test' | 'staging' | 'production';
};

const DEV_DEFAULTS = ['JWT_SIGNING_SECRET', 'OTP_PEPPER'] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid API configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const config = {
    ...parsed.data,
    APP_ENV:
      parsed.data.APP_ENV ??
      (parsed.data.NODE_ENV === 'production' ? 'production' : parsed.data.NODE_ENV),
  } as Config;
  if (config.APP_ENV === 'staging' || config.APP_ENV === 'production') {
    for (const key of DEV_DEFAULTS) {
      if (!env[key]) throw new Error(`${key} must be set in ${config.APP_ENV}`);
    }
    if (!config.DATABASE_URL) throw new Error(`DATABASE_URL must be set in ${config.APP_ENV}`);
    if (config.OTP_OUTBOX_FILE)
      throw new Error('OTP_OUTBOX_FILE is only for development and tests');
  }
  if (
    (config.APP_ENV === 'staging' || config.APP_ENV === 'production') &&
    config.BLOB_DRIVER !== 'azure'
  ) {
    // Container disks are wiped on every restart: documents must go to durable storage.
    throw new Error('BLOB_DRIVER=azure is required outside development');
  }
  if (config.BLOB_DRIVER === 'azure' && !config.BLOB_ACCOUNT_URL) {
    throw new Error('BLOB_ACCOUNT_URL is required when BLOB_DRIVER=azure');
  }
  const whatsappParts = [
    config.WHATSAPP_PHONE_NUMBER_ID,
    config.WHATSAPP_ACCESS_TOKEN,
    config.WHATSAPP_APP_SECRET,
    config.WHATSAPP_VERIFY_TOKEN,
  ].filter(Boolean).length;
  if (whatsappParts > 0 && whatsappParts < 4) {
    throw new Error(
      'Set all four WHATSAPP_* values (phone number id, access token, app secret, verify token)',
    );
  }
  if (config.OTP_DELIVERY === 'whatsapp' && whatsappParts !== 4) {
    throw new Error('OTP_DELIVERY=whatsapp needs the WhatsApp settings');
  }
  if (config.APP_ENV === 'production' && config.OTP_DELIVERY === 'console') {
    throw new Error('OTP_DELIVERY=console is not allowed in production (PINs would be logged)');
  }
  return config;
}
