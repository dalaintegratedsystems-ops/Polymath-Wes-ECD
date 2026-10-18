import { expect, test } from '@playwright/test';
import { fillField, settle, signIn } from './helpers';

test.describe('weekly planner and printables', () => {
  test('a practitioner plans the week, adapts an activity, approves and prints', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await signIn(page, '060 000 0002', '+27600000002'); // Thandi
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'Plan your week with Wes' })).toBeVisible();
    await fillField(page.getByLabel('Theme'), 'Farm animals');
    await page.getByRole('button', { name: 'Make my plan' }).click();
    await expect(page.getByRole('heading', { name: 'Farm animals', exact: true })).toBeVisible();
    await expect(page.getByText('ELDA tags are suggestions.')).toBeVisible();

    // Wednesday has the word cards activity for 3 to 5 year olds.
    await page.getByRole('tab', { name: /Wed/ }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText(/word cards/i).first()).toBeVisible();

    // Adapt the first activity for younger children.
    const first = panel.getByRole('listitem').first();
    await first.getByRole('button', { name: 'Younger' }).click();
    await expect(first.getByText(/for younger children/)).toBeVisible();
    await expect(first.getByText(/toilet roll tube/)).toBeVisible();

    // Print the word cards for the theme.
    const [cards] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Print the word cards' }).click(),
    ]);
    expect(cards.suggestedFilename()).toBe('flashcards.pdf');
    // The browser started the download; check the file itself with the same request.
    const pdf = await page.request.post('/plan/print', {
      form: { kind: 'flashcards', title: 'Farm animals: word cards', words: 'farm,animals' },
    });
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    await page.getByRole('button', { name: 'Approve this plan' }).click();
    await expect(page.getByText('Approved', { exact: true })).toBeVisible();

    // The printables page suggests the theme words and makes a counting sheet.
    await page.getByRole('link', { name: 'Printables' }).click();
    await settle(page);
    await expect(page.getByLabel('Words')).toHaveValue('farm, animals');
    await page.getByRole('radio', { name: 'Counting sheet' }).click();
    await fillField(page.getByLabel('Title'), 'Count the cows');
    const [sheet] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Make the PDF' }).click(),
    ]);
    expect(sheet.suggestedFilename()).toBe('counting.pdf');
  });
});
