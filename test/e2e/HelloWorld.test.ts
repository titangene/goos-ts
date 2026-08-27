import { expect, test } from '@playwright/test';

test('helloWorld', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Hi')).toBeVisible();
});
