import { test as base, expect } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';

// Re-export expect so tests only need to import from fixtures
export { expect, argosScreenshot };

// Extend base test with shared page setup
export const test = base.extend<{
  ticketId: string;
}>({
  // Each test can declare which ticket it belongs to via use({ ticketId })
  ticketId: ['', { option: true }],
});
