import { expect, test } from '@playwright/test';
import { fillField, settle, signIn } from './helpers';

// A real 1x1 PNG: the browser decodes and shrinks it like a phone photo before upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('registration copilot', () => {
  test('a principal audits, writes and approves a policy, saves a document, makes the pack and submits', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, '060 000 0003', '+27600000003'); // Fatima, Ikhaya Lethu
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Check where you stand:/)).toBeVisible();

    // Overview
    await page.getByRole('link', { name: 'Continue registration' }).click();
    await expect(page.getByRole('heading', { name: 'Registration' })).toBeVisible();

    // 1. Self-audit
    await page.goto('/registration/audit');
    await expect(page.getByText('This checklist is a starting outline.')).toBeVisible();
    const yes = page.getByRole('radio', { name: 'Yes' });
    await expect(yes).toHaveCount(6);
    for (let i = 0; i < 5; i++) await yes.nth(i).click();
    await page.getByRole('radio', { name: 'Not yet' }).nth(5).click();
    await page.getByRole('button', { name: 'See my result' }).click();
    await expect(page.getByText('83%')).toBeVisible();
    await expect(page.getByText('1 thing to work on, most urgent first.')).toBeVisible();

    // 2. A policy: questions, draft, approve, PDF
    await page.goto('/registration/policies');
    await page.getByRole('link', { name: /Child protection policy/ }).click();
    await fillField(
      page.getByLabel('Who is your designated child protection person?'),
      'Fatima Davids',
    );
    await fillField(
      page.getByLabel('How does a staff member raise a concern about a child?'),
      'Tell Fatima the same day, in private.',
    );
    await fillField(
      page.getByLabel('How do you check new staff and volunteers?'),
      'Two references and a clearance certificate.',
    );
    await page.getByRole('button', { name: 'Write my draft' }).click();
    const text = page.getByLabel('Policy text');
    await expect(text).toHaveValue(/Fatima Davids is our designated child protection person/);
    await expect(text).toHaveValue(/Childline: 116/);
    await page.getByRole('button', { name: 'Approve this policy' }).click();
    await expect(page.getByText(/Approved on \d{4}-\d{2}-\d{2}/)).toBeVisible();
    const pdfHref = await page.getByRole('link', { name: 'Open as PDF' }).getAttribute('href');
    const pdf = await page.request.get(pdfHref!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');

    // 3. A document with an expiry date
    await page.goto('/registration/documents');
    await page.getByLabel('What is it?').selectOption('fire_clearance');
    await page.getByLabel('Expiry date (if it has one)').fill('2027-03-31');
    await page.getByLabel('Take a photo or choose a file').setInputFiles({
      name: 'fire.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.getByRole('button', { name: 'Save document' }).click();
    const saved = page.getByRole('list', { name: 'Saved documents' });
    await expect(saved.getByText('Fire safety clearance')).toBeVisible();
    await expect(saved.getByText('Expires 2027-03-31')).toBeVisible();

    // 4. The application pack downloads as one PDF
    await page.goto('/registration/pack');
    await settle(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Make my pack (PDF)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('application-pack.pdf');
    // The browser started the download; check the pack itself with the same request.
    const pack = await page.request.post('/registration/pack/download');
    expect(pack.headers()['content-type']).toBe('application/pdf');
    expect((await pack.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // 5. Submit
    await page.goto('/registration/submit');
    await page.getByRole('button', { name: 'I have submitted my application' }).click();
    await expect(page.getByText('Submitted. Well done!')).toBeVisible();

    // The overview reflects all of it
    await page.goto('/registration');
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByText('1 thing to work on')).toBeVisible();
  });

  test('a practitioner can read the steps but not approve or build the pack', async ({ page }) => {
    await signIn(page, '060 000 0002', '+27600000002'); // Thandi
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/registration/pack');
    await expect(page.getByText('Your principal makes the application pack.')).toBeVisible();
    await page.goto('/registration/policies/health');
    await expect(page.getByText('Your principal has not started this policy yet.')).toBeVisible();
  });
});
