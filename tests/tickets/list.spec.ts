/**
 * [TICKET-201] Ticket listing & management
 * Tags: @tickets @list
 */
import { test, expect, argosScreenshot } from '../fixtures';

test.describe('[TICKET-201] Ticket list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tickets');
  });

  test('should display ticket list', async ({ page }) => {
    await expect(page.getByTestId('ticket-list')).toBeVisible();
    await argosScreenshot(page, 'tickets-list');
  });

  test('should filter tickets by status', async ({ page }) => {
    await page.getByRole('button', { name: /filter/i }).click();
    await page.getByLabel('Status').selectOption('active');
    await page.getByRole('button', { name: /apply/i }).click();

    await expect(page.getByTestId('ticket-list')).toBeVisible();
    await argosScreenshot(page, 'tickets-list-filtered');
  });

  test('should open ticket detail on click', async ({ page }) => {
    await page.getByTestId('ticket-item').first().click();
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    await argosScreenshot(page, 'tickets-detail');
  });
});
