/**
 * [TICKET-102] Flight booking flow
 * Tags: @flights @booking
 */
import { test, expect, argosScreenshot } from '../fixtures';

test.describe('[TICKET-102] Flight booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flights/booking');
  });

  test('should display booking form', async ({ page }) => {
    await expect(page.getByRole('form', { name: /booking/i })).toBeVisible();
    await argosScreenshot(page, 'flights-booking-form');
  });

  test('should complete passenger details step', async ({ page }) => {
    await page.getByLabel('First Name').fill('John');
    await page.getByLabel('Last Name').fill('Doe');
    await page.getByLabel('Passport Number').fill('A1234567');
    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByTestId('payment-step')).toBeVisible();
    await argosScreenshot(page, 'flights-booking-payment');
  });
});
