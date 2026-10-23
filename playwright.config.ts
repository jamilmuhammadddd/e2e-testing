import { defineConfig, devices } from '@playwright/test';

const IS_CI = !!process.env.CI;
const ARGOS_ENABLED = IS_CI && !!process.env.ARGOS_TOKEN;

// Argos-recommended args for consistent screenshot rendering
const argosLaunchOptions = {
  args: ['--disable-lcd-text', '--font-render-hinting=none'],
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // Custom per-ticket QA HTML report with screenshots
    ['./reporters/qa-html-reporter.ts'],
    ...(ARGOS_ENABLED ? [['@argos-ci/playwright/reporter'] as const] : []),
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    // Always capture so screenshots appear in QA reports
    screenshot: 'on',
    // Record video for every test
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: argosLaunchOptions,
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: argosLaunchOptions,
      },
    },
  ],
});
