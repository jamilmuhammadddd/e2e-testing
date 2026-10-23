/**
 * [TICKET-101] Flight search flow
 * Tags: @flights @search
 */
import { test, expect, argosScreenshot } from '../fixtures';

test.describe('[TICKET-101] Flight search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flights');
  });

  test('should display search form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /flights/i })).toBeVisible();
    await argosScreenshot(page, 'flights-search-form');
  });

  test('should search for available flights', async ({ page }) => {
    await page.getByLabel('From').fill('Jakarta');
    await page.getByLabel('To').fill('Bali');
    await page.getByLabel('Departure').fill('2026-12-01');
    await page.getByRole('button', { name: /search/i }).click();

    await expect(page.getByTestId('flight-results')).toBeVisible();
    await argosScreenshot(page, 'flights-search-results');
  });

  test('should show error for invalid dates', async ({ page }) => {
    await page.getByLabel('Departure').fill('2020-01-01');
    await page.getByRole('button', { name: /search/i }).click();

    await expect(page.getByText(/invalid date/i)).toBeVisible();
  });
});
