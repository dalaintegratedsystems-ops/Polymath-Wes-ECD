import { expect, test, type Page } from '@playwright/test';
import { fillField, signIn } from './helpers';

const NOMSA = { local: '060 000 0001', e164: '+27600000001' };
const ADMIN = { local: '060 000 0007', e164: '+27600000007' };

// A real 1x1 PNG, so the browser can decode and resize it like a phone photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function signOut(page: Page) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
}

/** Every page must load without errors in the console or failed same-origin requests. */
function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) =>
    problems.push(
      `page error on ${new URL(page.url()).pathname}: ${e.message.slice(0, process.env.E2E_FULL_ERRORS ? 3000 : 60)}`,
    ),
  );
  page.on('console', (m) => {
    // Failed loads are reported with their URL by the response listener below.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      problems.push(`console: ${m.text()}`);
    }
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.origin === 'http://localhost:3100' && r.status() >= 400) {
      problems.push(`${r.status()} ${url.pathname}`);
    }
  });
  return problems;
}

/**
 * Wait for a page to finish loading and hydrating. Leaving a page mid-hydration makes React
 * report a hydration error from the page being torn down, which is noise, not a bug.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/** Visit each start page and every internal link on it; all must answer without an error. */
async function crawl(page: Page, starts: string[]) {
  const seen = new Set<string>();
  const queue = [...starts];
  const failures: string[] = [];
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    // Let each page finish loading and hydrating before leaving it.
    const res = await page.goto(path);
    await settle(page);
    if (!res || res.status() >= 400) failures.push(`${res?.status()} ${path}`);
    if (!starts.includes(path)) continue; // one level deep from each start page
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    for (const href of hrefs) {
      if (!href.startsWith('/admin/export') && !seen.has(href)) queue.push(href);
    }
  }
  return { failures, visited: [...seen] };
}

test.describe('principal', () => {
  test('sees the centre dashboard and adds a practitioner who signs in with a username', async ({
    page,
  }) => {
    await signIn(page, NOMSA.local, NOMSA.e164);
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('link', { name: /Your progress/ }).click();
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
    await expect(page.getByText(/Wes answered/)).toBeVisible();
    await page.getByRole('link', { name: '7 days' }).click();
    await expect(page).toHaveURL(/days=7/);
    await expect(page.getByRole('link', { name: '7 days' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('link', { name: 'People' }).click();
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
    await page.getByRole('button', { name: 'Add a person' }).click();
    await fillField(page.getByLabel('Name', { exact: true }), 'Lindiwe');
    await page.getByRole('radio', { name: 'Practitioner' }).click();
    await fillField(page.getByLabel('Username (optional)'), 'lindiwe.k');
    await page.getByRole('button', { name: 'Add person' }).click();
    const status = page.getByRole('status').filter({ hasText: 'Temporary password for Lindiwe' });
    await expect(status).toBeVisible();
    const temp = (await status.locator('p.font-mono').innerText()).trim();
    expect(temp).toMatch(/^[a-z]+(-[a-z]+){3}-\d{2}$/);
    await page.getByRole('button', { name: 'Done, I have shared it' }).click();
    await expect(page.getByText('@lindiwe.k')).toBeVisible();
    await signOut(page);

    // The new practitioner signs in with the username and must choose a password first.
    await page.getByRole('link', { name: 'Sign in with a username instead' }).click();
    await fillField(page.getByLabel('Username'), 'lindiwe.k');
    await fillField(page.getByLabel('Password', { exact: true }), temp);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();

    // Going elsewhere first is not allowed.
    await page.goto('/children');
    await expect(page).toHaveURL(/\/account\/password$/);

    await fillField(page.getByLabel('Temporary password'), temp);
    await fillField(page.getByLabel('New password', { exact: true }), 'reading under the baobab');
    await fillField(page.getByLabel('New password again'), 'reading under the baobab');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText('Your new password is saved.')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Lindiwe/ })).toBeVisible();
  });

  test('wrong passwords get one plain message', async ({ page }) => {
    await page.goto('/welcome/username');
    await fillField(page.getByLabel('Username'), 'nobody.here');
    await fillField(page.getByLabel('Password', { exact: true }), 'not a real password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('That username or password is wrong.')).toBeVisible();
  });

  test('uploads a profile photo and a centre logo', async ({ page }) => {
    await signIn(page, NOMSA.local, NOMSA.e164);
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await page.getByLabel('Choose a photo').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    const avatar = page.locator('img[src^="/media/users/"]').first();
    await expect(avatar).toBeVisible();
    await expect
      .poll(() => avatar.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    await page.getByLabel('Choose a logo').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.locator('img[src^="/media/centres/"]')).toBeVisible();
  });

  test('every link and page works without errors', async ({ page }) => {
    test.setTimeout(240_000);
    const problems = watchForErrors(page);
    await signIn(page, NOMSA.local, NOMSA.e164);
    await expect(page).toHaveURL(/\/$/);
    await settle(page);
    const { failures, visited } = await crawl(page, ['/', '/account', '/dashboard', '/people']);
    expect(failures).toEqual([]);
    expect(visited).toEqual(
      expect.arrayContaining(['/children', '/plan', '/registration', '/wes']),
    );
    // A principal cannot open the platform console.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    await settle(page);
    expect(problems).toEqual([]);
  });
});

test.describe('platform admin', () => {
  test('lands on the console, filters by province, resets and downloads CSV', async ({ page }) => {
    test.setTimeout(240_000);
    const problems = watchForErrors(page);
    await signIn(page, ADMIN.local, ADMIN.e164);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible();
    // Tapping before hydration finishes would be undone when React takes over the page.
    await settle(page);

    await page.getByText('Filters', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Province' }).selectOption('NC');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/province=NC/);
    await expect(page.getByText('No centres match these filters.')).toBeVisible();

    await page.getByRole('link', { name: 'Reset filters' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('Siyakhula Educare (demo)')).toBeVisible();

    const csv = await page.request.get(
      await page
        .getByRole('link', { name: 'Download CSV' })
        .getAttribute('href')
        .then((h) => h!),
    );
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain('Centre,Province');

    const { failures } = await crawl(page, ['/admin', '/people', '/account']);
    expect(failures).toEqual([]);
    expect(problems).toEqual([]);
  });
});
