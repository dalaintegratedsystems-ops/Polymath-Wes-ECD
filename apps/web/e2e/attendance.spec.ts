import { expect, test } from '@playwright/test';
import { settle, signIn } from './helpers';

test.describe('daily register', () => {
  test('a practitioner takes the register, keeps going offline, and it syncs when back online', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, '060 000 0002', '+27600000002'); // Thandi, Siyakhula
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/children');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Today’s register' })).toBeVisible();

    // Online: the tap is saved and synced.
    await page.getByRole('button', { name: 'Lwazi: not marked' }).click();
    await expect(page.getByRole('button', { name: 'Lwazi: here' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    // Offline: the tap is kept on the phone.
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Amahle: not marked' }).click();
    await expect(
      page.getByText(/Saved on this phone\. 1 change will sync when you have signal\./),
    ).toBeVisible();

    // Back online: the queued change syncs by itself.
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({
      timeout: 20_000,
    });

    // The server has both marks: a fresh load shows them.
    await page.reload();
    await settle(page);
    await expect(page.getByRole('button', { name: 'Lwazi: here' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Amahle: here' })).toBeVisible();
    await expect(page.getByText('2 of 11 here')).toBeVisible();

    // Home shows today's attendance.
    await page.goto('/');
    await expect(page.getByText('children here')).toBeVisible();
  });

  test('the principal downloads the monthly register as CSV', async ({ page }) => {
    await signIn(page, '060 000 0001', '+27600000001'); // Nomsa
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/children');
    const link = page.getByRole('link', { name: 'Download this month’s register (CSV)' });
    await expect(link).toBeVisible();
    const res = await page.request.get((await link.getAttribute('href'))!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(await res.text()).toMatch(/^.*Register for \d{4}-\d{2}/);
  });
});
