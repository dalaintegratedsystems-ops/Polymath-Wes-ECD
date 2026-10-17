import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

interface SentPin {
  phone: string;
  code: string;
  purpose: 'sign_in' | 'consent';
}

/** The newest PIN the API "sent" to a phone, read from the dev-only outbox file. */
export async function latestPin(phoneE164: string, purpose: SentPin['purpose']): Promise<string> {
  const file = join(process.env.E2E_RUN_DIR!, 'otp-outbox.jsonl');
  let found: string | undefined;
  await expect
    .poll(() => {
      const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
      const pins = lines
        .map((l) => JSON.parse(l) as SentPin)
        .filter((p) => p.phone === phoneE164 && p.purpose === purpose);
      found = pins.at(-1)?.code;
      return found;
    })
    .toBeTruthy();
  return found!;
}

/**
 * Fill a controlled input, retrying until the value sticks. On a slow machine (or phone) the
 * page can still be hydrating when typing starts, and React resets the field.
 */
export async function fillField(field: Locator, value: string) {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

/** Sign in through the real screens. */
export async function signIn(page: Page, local: string, e164: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await fillField(page.getByLabel('Your cellphone number'), local);
  await page.getByRole('button', { name: 'Send me a PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your PIN' })).toBeVisible();
  await page.getByLabel('6-digit PIN').fill(await latestPin(e164, 'sign_in'));
}
