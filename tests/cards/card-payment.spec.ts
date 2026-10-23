/**
 * [TICKET-301] Card payment flow
 * Tags: @cards @payment
 */
import { test, expect, argosScreenshot } from '../fixtures';

test.describe('[TICKET-301] Card payment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payment');
  });

  test('should display payment form', async ({ page }) => {
    await expect(page.getByTestId('payment-form')).toBeVisible();
    await argosScreenshot(page, 'cards-payment-form');
  });

  test('should validate card number format', async ({ page }) => {
    await page.getByLabel('Card Number').fill('1234');
    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page.getByText(/invalid card/i)).toBeVisible();
  });

  test('should accept valid card and proceed', async ({ page }) => {
    await page.getByLabel('Card Number').fill('4111 1111 1111 1111');
    await page.getByLabel('Expiry').fill('12/28');
    await page.getByLabel('CVV').fill('123');
    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page.getByTestId('payment-confirmation')).toBeVisible();
    await argosScreenshot(page, 'cards-payment-confirmation');
  });
});
