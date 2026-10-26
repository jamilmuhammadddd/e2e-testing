/**
 * [TMA-166] Regression: CREATED AT sort and column sorting apply only within current page
 * Site: https://revamp-dashboard.techgadgetforus.com
 * Test case: TC-Configuration-437
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE     = 'https://revamp-dashboard.techgadgetforus.com';
const ATTR_URL = `${BASE}/configurations/user-profile-attributes`;

// ── Network capture ───────────────────────────────────────────────────────────
function setupNetworkCapture(page) {
  const calls: Array<{
    step: string; method: string; url: string; status: number;
    requestBody: any; requestParams: Record<string, string>;
    responseBody: any; duration: number; label?: string;
  }> = [];
  let currentStep = 'init';

  page.on('response', async (response) => {
    const url = response.url();
    const rt  = response.request().resourceType();
    if (!url.startsWith('data:') && !/\.(png|jpg|gif|svg|woff2?|ico|ttf|eot)$/i.test(url)) {
      // silent — captured below
    }
    if (/\.(png|jpg|gif|svg|css|woff2?|ico|js|ts|map|ttf|eot)(\?.*)?$/i.test(url)) return;
    if (url.startsWith('data:') || url.startsWith('chrome-extension:')) return;
    if (response.request().method() === 'OPTIONS') return;

    try {
      const req      = response.request();
      const timing   = req.timing();
      const duration = Math.max(0, Math.round((timing.responseEnd || 0) - (timing.startTime || 0)));
      const urlObj   = new URL(url);
      const requestParams: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => { requestParams[k] = v; });

      let reqBody: any = null;
      let resBody: any = null;
      try { const raw = req.postData(); if (raw) { try { reqBody = JSON.parse(raw); } catch { reqBody = raw; } } } catch {}
      try {
        const buf = await response.body();
        const raw = buf.toString('utf-8');
        try { resBody = JSON.parse(raw); } catch { resBody = raw.substring(0, 500); }
        if (resBody?.results && Array.isArray(resBody.results) && resBody.results.length > 3) {
          resBody = { ...resBody, results: resBody.results.slice(0, 3), _note: `${resBody.results.length} total items, showing first 3` };
        }
      } catch (e: any) {}

      calls.push({ step: currentStep, method: req.method(), url: url.replace(BASE, '').replace('https://revamp-api.techgadgetforus.com', ''), status: response.status(), requestBody: reqBody, requestParams, responseBody: resBody, duration });
    } catch {}
  });

  return { calls, setStep: (s: string) => { currentStep = s; } };
}

// ── Dismiss onboarding tour ───────────────────────────────────────────────────
async function dismissTour(page) {
  const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[placeholder='Input your email']", 'abcder@yopmail.com');
  await page.fill("input[placeholder='Input your password']", 'P@ssw0rd');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/workspace`, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await dismissTour(page);
  await page.getByText('Workspace Erlyna').first().click();
  await page.waitForFunction(() => !window.location.pathname.startsWith('/workspace'), { timeout: 15000 });
  await page.waitForTimeout(1000);
  await dismissTour(page);
}

// ── Helper: extract row data from table ──────────────────────────────────────
async function getTableRows(page) {
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    return rows.slice(0, 10).map(r => {
      const cells = Array.from(r.querySelectorAll('td'));
      // cells[0]=checkbox, cells[1]=row#, cells[2]=name
      const name = cells[2]?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
      return {
        name,
        nameLower: name.toLowerCase(),
        text: r.textContent?.trim().replace(/\s+/g, ' ').substring(0, 120) || '',
      };
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('[TMA-166] User Profile Attributes — sort applies per-page only', () => {
  test.setTimeout(90000);

  test('TC-Configuration-437: CREATED AT sort is not global across pages', async ({ page }, testInfo) => {
    const { calls, setStep } = setupNetworkCapture(page);
    const screenshotDir = path.join('test-results', 'tma-166');
    fs.mkdirSync(screenshotDir, { recursive: true });

    async function saveScreenshot(name: string) {
      const file = path.join(screenshotDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      await testInfo.attach(name, { path: file, contentType: 'image/png' });
      return file;
    }

    // Step 1 — login
    setStep('1-login');
    await login(page);

    // Step 2 — navigate, capture page 1 default sort
    setStep('2-page1-default');
    await page.goto(ATTR_URL);
    await page.waitForSelector('table tbody tr, [class*="table"] [class*="row"]', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const page1Rows = await getTableRows(page);
    console.log('\nPage 1 rows (default sort):');
    page1Rows.forEach((r, i) => console.log(`  [${i+1}] ${r.text}`));
    await saveScreenshot('01-page1-default-sort');

    const footer1 = await page.locator('text=/Showing/').first().textContent().catch(() => '');
    console.log('Page 1 footer:', footer1);

    // Step 3 — navigate to page 2, capture rows
    setStep('3-page2-default');
    await page.locator('button, a').filter({ hasText: /^2$/ }).first().click();
    await page.waitForTimeout(2000);
    const page2Rows = await getTableRows(page);
    console.log('\nPage 2 rows (default sort):');
    page2Rows.forEach((r, i) => console.log(`  [${i+1}] ${r.text}`));
    await saveScreenshot('02-page2-default-sort');

    const footer2 = await page.locator('text=/Showing/').first().textContent().catch(() => '');
    console.log('Page 2 footer:', footer2);

    // Step 4 — go back to page 1, click column sort (A-Z by name)
    setStep('4-sort-az');
    await page.locator('button, a').filter({ hasText: /^1$/ }).first().click();
    await page.waitForTimeout(1500);
    // Click the column header for USER ATTRIBUTES / Name
    const sortHeader = page.locator('th, [class*="header"]').filter({ hasText: /user attribute|name|attribute/i }).first();
    await sortHeader.click();
    await page.waitForTimeout(2000);
    const page1SortedRows = await getTableRows(page);
    console.log('\nPage 1 rows (A-Z sort):');
    page1SortedRows.forEach((r, i) => console.log(`  [${i+1}] ${r.text}`));
    await saveScreenshot('03-page1-az-sort');

    // Step 5 — page 2 after A-Z sort
    setStep('5-page2-sorted');
    await page.locator('button, a').filter({ hasText: /^2$/ }).first().click();
    await page.waitForTimeout(2000);
    const page2SortedRows = await getTableRows(page);
    console.log('\nPage 2 rows (A-Z sort):');
    page2SortedRows.forEach((r, i) => console.log(`  [${i+1}] ${r.text}`));
    await saveScreenshot('04-page2-az-sort');

    // Save network evidence
    const netFile = path.join(testInfo.outputDir, 'network-evidence.json');
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    fs.writeFileSync(netFile, JSON.stringify(calls, null, 2));
    await testInfo.attach('network-evidence', { path: netFile, contentType: 'application/json' });

    console.log(`\nCaptured ${calls.length} API calls`);
    calls.filter(c => c.url.includes('profiles/properties')).forEach(c =>
      console.log(`  [${c.step}] ${c.method} ${c.url} → ${c.status} (${c.duration}ms)`)
    );

    // ── Assertions — document the bug ────────────────────────────────────────
    // Bug: if sort is global, last item on page 1 (A-Z) should come BEFORE first item on page 2 (A-Z)
    // Extract first text of each page for comparison
    const p1LastName  = page1SortedRows[page1SortedRows.length - 1]?.nameLower || '';
    const p2FirstName = page2SortedRows[0]?.nameLower || '';

    console.log(`\nSort cross-page check — page 1 last: "${p1LastName}" | page 2 first: "${p2FirstName}"`);

    // This FAILS if page 2 first item sorts BEFORE page 1 last item — proves per-page sort bug
    expect(
      p1LastName <= p2FirstName,
      `Bug TMA-166: A-Z sort is per-page only. Page 1 ends with "${p1LastName}" but page 2 starts with "${p2FirstName}" (should come before page 1 last item in a global sort)`
    ).toBe(true);
  });
});
