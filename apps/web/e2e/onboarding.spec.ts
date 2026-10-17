import { expect, test } from '@playwright/test';
import { fillField, latestPin, signIn } from './helpers';

test.describe('a new principal', () => {
  test('signs up, sets up a centre, and adds a child with a parent’s consent', async ({ page }) => {
    await signIn(page, '071 555 0101', '+27715550101');

    // Centre setup, step 1: about you.
    await expect(page).toHaveURL(/\/setup$/);
    await fillField(page.getByLabel('Your first name'), 'Thembi');
    await page.getByRole('radio', { name: 'isiXhosa' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: the centre.
    await fillField(page.getByLabel('Centre name'), 'Khanyisa Day Care');
    await fillField(page.getByLabel('Suburb or area'), 'Langa');
    await fillField(page.getByLabel('Town or city'), 'Cape Town');
    await page.getByLabel('Province').selectOption('WC');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: the children.
    await page.getByRole('checkbox', { name: /Babies/ }).click();
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('heading', { name: 'Khanyisa Day Care is set up!' })).toBeVisible();

    // Home shows the real centre.
    await page.getByRole('link', { name: 'Go to my home screen' }).click();
    await expect(page.getByRole('heading', { name: /Thembi/ })).toBeVisible();
    await expect(page.getByText('Khanyisa Day Care')).toBeVisible();

    // Add a child: it waits for consent before joining the register.
    await page.getByRole('link', { name: 'Children', exact: true }).click();
    await page.getByRole('link', { name: 'Add your first child' }).click();
    await fillField(page.getByLabel('First name'), 'Mbali');
    await page.getByLabel('Month').selectOption('03');
    await page.getByLabel('Year').selectOption('2024');
    await fillField(page.getByLabel('Their name'), 'Nandi');
    await fillField(page.getByLabel('Their cellphone number'), '083 555 0101');
    await page.getByRole('button', { name: 'Next: ask for consent' }).click();

    // Consent: the parent receives a PIN and reads it back.
    await expect(page.getByRole('heading', { name: 'Consent for Mbali' })).toBeVisible();
    // The checkbox is visually replaced by a big tappable row; tap it like a person would.
    await page.getByText('Track learning and progress').click();
    await expect(page.getByRole('checkbox', { name: /Track learning/ })).toBeChecked();
    await page.getByRole('button', { name: /Send a PIN/ }).click();
    await expect(page.getByText('+27 83 *** **01')).toBeVisible();
    await page
      .getByLabel('PIN from the parent or caregiver')
      .fill(await latestPin('+27835550101', 'consent'));
    await expect(page.getByRole('heading', { name: 'Mbali is in your register' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to children' }).click();
    await expect(page.getByText('1 child in your register')).toBeVisible();
    await expect(page.getByText('Mbali', { exact: true })).toBeVisible();
  });
});

test.describe('a returning principal', () => {
  test('lands on their centre and can sign out', async ({ page }) => {
    await signIn(page, '060 000 0001', '+27600000001');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Siyakhula Educare (demo)')).toBeVisible();
    await expect(page.getByText('children in your register')).toBeVisible();

    await page.getByRole('link', { name: 'Your account' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/welcome$/);

    // Signed out means signed out: protected pages bounce back to sign-in.
    await page.goto('/children');
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test('is told clearly when the PIN is wrong', async ({ page }) => {
    await page.goto('/welcome');
    await fillField(page.getByLabel('Your cellphone number'), '060 000 0002');
    await page.getByRole('button', { name: 'Send me a PIN' }).click();
    const real = await latestPin('+27600000002', 'sign_in');
    await page.getByLabel('6-digit PIN').fill(real === '000000' ? '111111' : '000000');
    await expect(page.getByText(/wrong or has expired/)).toBeVisible();
  });
});
