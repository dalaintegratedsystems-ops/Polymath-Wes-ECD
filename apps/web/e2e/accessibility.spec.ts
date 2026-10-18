import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle, signIn } from './helpers';

/**
 * Accessibility budget (CLAUDE.md §6: WCAG 2.2 AA): every key screen at 360px must have no
 * serious or critical axe violations. Minor findings are printed for follow-up.
 */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  for (const v of result.violations.filter((x) => !serious.includes(x))) {
    console.log(`[a11y minor] ${path}: ${v.id} (${v.nodes.length})`);
  }
  return serious.map((v) => `${path}: ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(' ')}`);
}

test.describe('accessibility', () => {
  test('public screens', async ({ page }) => {
    const problems = [
      ...(await audit(page, '/welcome')),
      ...(await audit(page, '/welcome/username')),
    ];
    expect(problems).toEqual([]);
  });

  test('principal screens', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, '060 000 0001', '+27600000001');
    await expect(page).toHaveURL(/\/$/);
    const problems: string[] = [];
    for (const path of [
      '/',
      '/children',
      '/plan',
      '/plan/printables',
      '/registration',
      '/registration/audit',
      '/registration/documents',
      '/registration/policies/health',
      '/registration/pack',
      '/wes',
      '/dashboard',
      '/people',
      '/account',
    ]) {
      problems.push(...(await audit(page, path)));
    }
    expect(problems).toEqual([]);
  });

  test('platform console', async ({ page }) => {
    await signIn(page, '060 000 0007', '+27600000007');
    await expect(page).toHaveURL(/\/admin$/);
    expect(await audit(page, '/admin')).toEqual([]);
  });
});
