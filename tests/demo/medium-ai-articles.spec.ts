/**
 * [TICKET-999] Demo: fetch Medium AI workflow articles via RSS
 * RSS bypasses Cloudflare. Run with:
 *   npx playwright test tests/demo/medium-ai-articles.spec.ts
 */
import { test, expect } from '@playwright/test';

test.describe('[TICKET-999] Medium AI workflow articles', () => {
  test('grab top articles about AI workflow via RSS', async ({ request }) => {
    // Medium RSS for tag search — no bot wall
    const response = await request.get(
      'https://medium.com/feed/tag/ai-workflow',
      { headers: { 'Accept': 'application/rss+xml, text/xml' } }
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.text();

    // Parse <item> blocks from RSS XML
    const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);

    const articles = items.map(match => {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                 || block.match(/<title>(.*?)<\/title>/)?.[1]
                 || '(no title)';
      const link  = block.match(/<link>(.*?)<\/link>/)?.[1]
                 || block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]
                 || '';
      const author = block.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/)?.[1]
                  || block.match(/<author>(.*?)<\/author>/)?.[1]
                  || '(unknown)';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      return { title, link, author, pubDate };
    });

    console.log('\n=== Medium RSS: AI Workflow Articles ===');
    articles.forEach((a, i) => {
      console.log(`\n${i + 1}. ${a.title}`);
      console.log(`   Author : ${a.author}`);
      console.log(`   Date   : ${a.pubDate}`);
      console.log(`   URL    : ${a.link}`);
    });

    expect(articles.length).toBeGreaterThan(0);
  });
});
