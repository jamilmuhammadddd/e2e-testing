/**
 * [TMA-166] QA report demo — uses page fixture for screenshots + video evidence
 */
import { test, expect } from '@playwright/test';

test.describe('[TMA-166] Medium AI workflow articles', () => {
  test('fetch AI workflow articles via RSS', async ({ page }) => {
    await page.goto('https://medium.com/feed/tag/ai-workflow', {
      waitUntil: 'domcontentloaded',
    });

    const result = await page.evaluate(async () => {
      const res   = await fetch('https://medium.com/feed/tag/ai-workflow');
      const text  = await res.text();
      const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
      return items.map(m => {
        const b = m[1];
        return {
          title: b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
              || b.match(/<title>(.*?)<\/title>/)?.[1] || '',
          link:  b.match(/<link>(.*?)<\/link>/)?.[1] || '',
        };
      });
    });

    console.log('\n=== [TMA-166] AI Workflow Articles ===');
    result.forEach((a, i) => console.log(`${i + 1}. ${a.title}\n   ${a.link}`));
    expect(result.length).toBeGreaterThan(0);
  });

  test('verify RSS feed contains required XML elements', async ({ page }) => {
    await page.goto('https://medium.com/feed/tag/ai-workflow', {
      waitUntil: 'domcontentloaded',
    });

    const content = await page.content();
    expect(content).toContain('rss');
    expect(content).toContain('channel');
    expect(content).toContain('item');
  });

  test('verify article titles are non-empty', async ({ page }) => {
    await page.goto('https://medium.com/feed/tag/ai-workflow', {
      waitUntil: 'domcontentloaded',
    });

    const titles = await page.evaluate(() => {
      const text  = document.documentElement.innerHTML;
      const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3);
      return items.map(m =>
        m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || ''
      );
    });

    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(0);
    }
  });
});
