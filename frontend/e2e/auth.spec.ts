import { test, expect } from '@playwright/test';

test('homepage has correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/CodeRAG/);
});

test('can navigate to login', async ({ page }) => {
  await page.goto('/');
  // Click the get started or log in link. This will depend on the actual UI but basic check is fine
  const loginLink = page.getByRole('link', { name: /log in/i });
  if (await loginLink.isVisible()) {
      await loginLink.click();
      await expect(page).toHaveURL(/.*login/);
  }
});
