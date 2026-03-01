import { test, expect } from '@playwright/test';

test.describe('Phase 1 - Landing Page Flow', () => {
  test('loads the landing page with FlipperZillow heading', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('domcontentloaded');

    // Check for the FlipperZillow heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/FlipperZillow/i);
  });

  test('has an address search input', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('domcontentloaded');

    // Check for the address input with the expected placeholder
    const input = page.getByPlaceholder('Enter a property address...');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('shows the address search bar is interactive', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('domcontentloaded');

    const input = page.getByPlaceholder('Enter a property address...');
    await expect(input).toBeVisible();

    // Type into the search bar
    await input.fill('123 Main St');

    // Verify the input accepted the text
    await expect(input).toHaveValue('123 Main St');
  });
});
