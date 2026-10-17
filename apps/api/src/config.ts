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

  JWT_SIGNING_SECRET: z.string().min(32).default('dev-only-signing-secret-change-me-0123456789'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(600),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(30 * 24 * 3600),

  OTP_DELIVERY: z.enum(['console', 'whatsapp', 'sms']).default('console'),
  /** Development/e2e only: also append sent PINs as JSON lines to this file. */
  OTP_OUTBOX_FILE: z.string().optional(),
  OTP_PEPPER: z.string().min(16).default('dev-only-otp-pepper-change-me'),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
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
  if (config.APP_ENV === 'production' && config.OTP_DELIVERY === 'console') {
    throw new Error('OTP_DELIVERY=console is not allowed in production (PINs would be logged)');
  }
  return config;
}
