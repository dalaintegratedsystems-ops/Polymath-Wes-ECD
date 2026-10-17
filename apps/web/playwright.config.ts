import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end journeys against the real stack: the built API on a fresh embedded database
 * (seeded with demo data) and the production web build. PINs are read from a dev-only
 * outbox file. Run `pnpm build` first.
 */
const runDir = process.env.E2E_RUN_DIR ?? mkdtempSync(join(tmpdir(), 'wes-e2e-'));
process.env.E2E_RUN_DIR = runDir;
export const OTP_OUTBOX = join(runDir, 'otp-outbox.jsonl');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    ...devices['Pixel 5'],
    // A mid-range Android at the narrowest width we support.
    viewport: { width: 360, height: 780 },
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'android-chrome', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node ../api/dist/server.js',
      url: 'http://localhost:4100/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: '4100',
        WEB_ORIGIN: 'http://localhost:3100',
        EMBEDDED_DB_DIR: join(runDir, 'pglite'),
        OTP_OUTBOX_FILE: OTP_OUTBOX,
        RATE_LIMIT_PER_MINUTE: '1000',
        OTP_RATE_LIMIT_PER_MINUTE: '1000',
        OTP_MAX_PER_WINDOW: '50',
        FIELD_ENCRYPTION_KEY: 'ZTJlLW9ubHktZmllbGQta2V5LTMyLWJ5dGVzLW9rISE=',
        BLIND_INDEX_KEY: 'ZTJlLW9ubHktYmxpbmQtaW5kZXgta2V5LTMyYnl0ZSE=',
        WES_MIGRATIONS_DIR: join(process.cwd(), '../../packages/db/migrations'),
      },
    },
    {
      command: 'pnpm exec next start -p 3100',
      url: 'http://localhost:3100/welcome',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_URL: 'http://localhost:4100' },
    },
  ],
});
