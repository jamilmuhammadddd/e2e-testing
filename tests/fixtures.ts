import { test as base, expect } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';
import * as fs from 'fs';
import * as path from 'path';

export { expect, argosScreenshot };

// ── Network capture types ─────────────────────────────────────────────────────
export interface ApiCall {
  timestamp: string;
  method: string;
  url: string;
  status: number;
  requestBody: string | null;
  requestParams: Record<string, string>;
  responseBody: string | null;
  duration: number;
  label?: string;
}

// ── Extended test fixture with network capture ────────────────────────────────
export const test = base.extend<{
  ticketId: string;
  networkCalls: ApiCall[];
  labelApi: (urlPattern: string | RegExp, label: string) => void;
  saveNetworkEvidence: (filename?: string) => Promise<string>;
}>({
  ticketId: ['', { option: true }],

  // Intercept all API responses during the test
  networkCalls: async ({ page }, use) => {
    const calls: ApiCall[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      // Skip static assets
      if (/\.(png|jpg|gif|svg|css|woff2?|ico|js\.map)$/i.test(url)) return;

      try {
        const req     = response.request();
        const timing  = req.timing();
        const duration = Math.round((timing.responseEnd || 0) - (timing.startTime || 0));

        // Parse query params
        const urlObj = new URL(url);
        const requestParams: Record<string, string> = {};
        urlObj.searchParams.forEach((v, k) => { requestParams[k] = v; });

        let reqBody: string | null = null;
        let resBody: string | null = null;
        try { reqBody = req.postData(); } catch {}
        try {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('json') || ct.includes('text')) {
            const raw = await response.text();
            resBody = raw.length > 3000 ? raw.substring(0, 3000) + '\n...[truncated]' : raw;
          }
        } catch {}

        calls.push({
          timestamp:     new Date().toISOString(),
          method:        req.method(),
          url,
          status:        response.status(),
          requestBody:   reqBody,
          requestParams,
          responseBody:  resBody,
          duration,
        });
      } catch {}
    });

    await use(calls);
  },

  // Tag a specific URL pattern with a human label for the report
  labelApi: async ({ networkCalls }, use) => {
    await use((urlPattern: string | RegExp, label: string) => {
      for (const call of networkCalls) {
        const match = typeof urlPattern === 'string'
          ? call.url.includes(urlPattern)
          : urlPattern.test(call.url);
        if (match) call.label = label;
      }
    });
  },

  // Persist network calls as a JSON attachment
  saveNetworkEvidence: async ({ networkCalls }, use, testInfo) => {
    await use(async (filename = 'network-evidence.json') => {
      const outDir  = testInfo.outputDir;
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, filename);
      fs.writeFileSync(outFile, JSON.stringify(networkCalls, null, 2));
      await testInfo.attach('network-evidence', {
        path: outFile,
        contentType: 'application/json',
      });
      return outFile;
    });
  },
});
