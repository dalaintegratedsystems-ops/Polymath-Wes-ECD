import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const deployed = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://wes_app:x@db/wes?sslmode=require',
  JWT_SIGNING_SECRET: 'a'.repeat(48),
  OTP_PEPPER: 'b'.repeat(32),
  BLOB_DRIVER: 'azure',
  BLOB_ACCOUNT_URL: 'https://wesdocs.blob.core.windows.net/',
};

describe('deployment configuration', () => {
  it('treats NODE_ENV=production as production unless told otherwise', () => {
    expect(() => loadConfig({ ...deployed, OTP_DELIVERY: 'console' })).toThrow(
      /not allowed in production/,
    );
    expect(loadConfig({ ...deployed, OTP_DELIVERY: 'sms' }).APP_ENV).toBe('production');
  });

  it('keeps documents on durable storage when deployed', () => {
    expect(() => loadConfig({ ...deployed, BLOB_DRIVER: 'filesystem' })).toThrow(
      /BLOB_DRIVER=azure/,
    );
    expect(() => loadConfig({ ...deployed, BLOB_ACCOUNT_URL: undefined })).toThrow(
      /BLOB_ACCOUNT_URL/,
    );
  });

  it('lets a private staging pilot log PINs, but still needs real secrets and a database', () => {
    expect(loadConfig({ ...deployed, APP_ENV: 'staging', OTP_DELIVERY: 'console' }).APP_ENV).toBe(
      'staging',
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'production', APP_ENV: 'staging', DATABASE_URL: 'x' }),
    ).toThrow(/JWT_SIGNING_SECRET/);
    expect(() => loadConfig({ ...deployed, APP_ENV: 'staging', DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('never allows the test PIN outbox outside development', () => {
    expect(() =>
      loadConfig({ ...deployed, APP_ENV: 'staging', OTP_OUTBOX_FILE: '/tmp/x' }),
    ).toThrow(/OTP_OUTBOX_FILE/);
  });

  it('defaults to development locally', () => {
    expect(loadConfig({}).APP_ENV).toBe('development');
  });
});
