/**
 * [TMA-165] Regression: Table shows wrong rows after edit from page 2
 * Site: https://revamp-dashboard.techgadgetforus.com
 * Credentials: abcder@yopmail.com / P@ssw0rd
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://revamp-dashboard.techgadgetforus.com';
const ATTR_URL = `${BASE}/configurations/user-profile-attributes`;

// ── Network capture helper ────────────────────────────────────────────────────
function setupNetworkCapture(page) {
  const calls: Array<{
    step: string;
    method: string;
    url: string;
    status: number;
    requestBody: any;
    requestParams: Record<string, string>;
    responseBody: any;
    duration: number;
  }> = [];
  let currentStep = 'init';

  page.on('response', async (response) => {
      const url = response.url();
      const rt = response.request().resourceType();
      // Debug: log every non-asset response
      if (!url.startsWith('data:') && !/\.(png|jpg|gif|svg|woff2?|ico|ttf|eot)$/i.test(url)) {
        console.log(`[NET] ${rt} ${response.request().method()} ${response.status()} ${url.replace(/https?:\/\/[^/]+/, '')}`);
      }
      // Skip static assets and browser internals
      if (/\.(png|jpg|gif|svg|css|woff2?|ico|js|ts|map|ttf|eot)(\?.*)?$/i.test(url)) return;
      if (url.startsWith('data:') || url.startsWith('chrome-extension:')) return;
      if (response.request().method() === 'OPTIONS') return;

    const req = response.request();
    const timing = req.timing();
    const duration = Math.max(0, Math.round((timing.responseEnd || 0) - (timing.startTime || 0)));

    const urlObj = new URL(url);
    const requestParams: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => { requestParams[k] = v; });

    let reqBody: any = null;
    let resBody: any = null;

    try { const raw = req.postData(); if (raw) { try { reqBody = JSON.parse(raw); } catch { reqBody = raw; } } } catch {}
    try {
      // Use body() buffer — more reliable than text() which can throw if already consumed
      const buf = await response.body();
      const raw = buf.toString('utf-8');
      try { resBody = JSON.parse(raw); } catch { resBody = raw.substring(0, 500); }
      // Truncate large result arrays — keep first 3 items for readability
      if (resBody?.results && Array.isArray(resBody.results) && resBody.results.length > 3) {
        resBody = { ...resBody, results: resBody.results.slice(0, 3), _note: `${resBody.results.length} total items, showing first 3` };
      }
    } catch (e) {
      console.log(`[NET BODY ERR] ${url}: ${e.message}`);
    }

    calls.push({
      step: currentStep,
      method: req.method(),
      url: url.replace(BASE, ''),
      status: response.status(),
      requestBody: reqBody,
      requestParams,
      responseBody: resBody,
      duration,
    });
  });

  return {
    calls,
    setStep: (s: string) => { currentStep = s; },
  };
}

// ── Login helper ──────────────────────────────────────────────────────────────
async function dismissTour(page) {
  // Close onboarding tour tooltip if present (blocks all interaction)
  const closeBtn = page.locator('[ref=f1e180], button:has-text("Close"), button[aria-label="Close"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
  // Also close the top banner if present
  const banner = page.locator('button img[alt="close"]').first();
  if (await banner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await banner.click();
    await page.waitForTimeout(500);
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[placeholder='Input your email']", 'abcder@yopmail.com');
  await page.fill("input[placeholder='Input your password']", 'P@ssw0rd');
  await page.click('button[type=submit]');
  // Wait for workspace selector
  await page.waitForURL(`${BASE}/workspace`, { timeout: 15000 });
  await page.waitForTimeout(1000);
  // Dismiss onboarding tour if present
  await dismissTour(page);
  // Select Workspace Erlyna
  await page.getByText('Workspace Erlyna').first().click();
  // Wait until we leave the workspace selector
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/workspace'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(1000);
  // Dismiss tour again in case it shows on dashboard
  await dismissTour(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('[TMA-165] User Profile Attributes — wrong rows after edit from page 2', () => {
  test.setTimeout(60000);

  test('TC-Configuration-410: table resets incorrectly after edit from page 2', async ({ page }, testInfo) => {
    const { calls, setStep } = setupNetworkCapture(page);

    // Step 1 — login
    setStep('1-login');
    await login(page);

    // Helper: save screenshot to disk AND attach
    const screenshotDir = path.join('test-results', 'tma-165');
    fs.mkdirSync(screenshotDir, { recursive: true });
    async function saveScreenshot(name: string) {
      const file = path.join(screenshotDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      await testInfo.attach(name, { path: file, contentType: 'image/png' });
      return file;
    }

    // Step 2 — navigate to User Profile Attributes
    setStep('2-navigate');
    await page.goto(ATTR_URL);
    await page.waitForSelector('table, [class*="table"]', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await saveScreenshot('01-page1');

    // Verify page 1 footer
    const footer1 = await page.locator('text=/Showing 1 to \\d+ of \\d+/').first().textContent();
    console.log('Page 1 footer:', footer1);
    expect(footer1).toMatch(/Showing 1 to \d+ of \d+/);

    // Step 3 — go to page 2
    setStep('3-page2');
    await page.locator('button, a').filter({ hasText: /^2$/ }).first().click();
    await page.waitForTimeout(1500);
    await saveScreenshot('02-page2');

    const footer2 = await page.locator('text=/Showing 11 to \\d+ of \\d+/').first().textContent();
    console.log('Page 2 footer:', footer2);
    expect(footer2).toMatch(/Showing 11 to \d+ of \d+/);

    // Step 4 — click Edit on first row of page 2
    setStep('4-edit');
    await page.locator('button:has-text("Edit")').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await saveScreenshot('03-edit-modal');

    // Step 5 — fill description and submit
    setStep('5-submit');
    const descInput = page.locator('[role="dialog"] input[placeholder*="escription"], [role="dialog"] textarea[placeholder*="escription"]').first();
    await descInput.fill(`QA Auto ${Date.now()}`);
    await page.locator('[role="dialog"] button:has-text("Submit")').click();

    // Wait for toast
    await page.waitForTimeout(2000);
    setStep('6-after-submit');
    await saveScreenshot('04-after-edit-bug');

    // Capture footer after submit — should show bug
    const footerAfter = await page.locator('text=/Showing/').first().textContent().catch(() => 'not found');
    console.log('Footer after edit:', footerAfter);

    // Save network evidence
    const netFile = path.join(testInfo.outputDir, 'network-evidence.json');
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    fs.writeFileSync(netFile, JSON.stringify(calls, null, 2));
    await testInfo.attach('network-evidence', { path: netFile, contentType: 'application/json' });

    console.log(`\nCaptured ${calls.length} API calls`);
    calls.forEach(c => console.log(`  [${c.step}] ${c.method} ${c.url} → ${c.status} (${c.duration}ms)`));

    // Assert the bug: footer should NOT say "Showing 11 to 1" (wrong offset)
    // This assertion documents the bug — it will FAIL confirming the regression
    expect(footerAfter, 'Bug: after edit from page 2, table should show full list not empty').not.toMatch(/Showing 11 to 1 of 1/);
  });
});
