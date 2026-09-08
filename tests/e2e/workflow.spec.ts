import { test, expect } from '@playwright/test';
test('book, persist, reschedule and cancel', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.times button')).not.toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.locator('.times button:not(:disabled)').first().click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Sample Guest');
  await page.getByRole('button', { name: 'Confirm appointment', exact: true }).click();
  await expect(page.locator('#appointments article')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#appointments article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.locator('.times button:not(:disabled)').last().click();
  await page.getByRole('button', { name: 'Confirm new time', exact: true }).click();
  await expect(page.getByText('Your appointment has been moved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, cancel appointment', exact: true }).click();
  await expect(page.locator('#appointments .status')).toHaveText('CANCELLED');
  await expect(page.locator('.error')).toHaveCount(0);
});
