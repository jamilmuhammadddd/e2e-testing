import type { Reporter, FullResult, TestCase, TestResult, Suite } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom Playwright reporter that saves a clean HTML QA report
 * per ticket alongside the standard JSON output.
 */
export default class QAHtmlReporter implements Reporter {
  private results: Map<string, Array<{
    title: string;
    status: string;
    duration: number;
    error: string | null;
    screenshot: string | null;
    project: string;
  }>> = new Map();

  private outputDir = 'qa-report';
  private TICKET_RE = /\[?(TICKET-\d+)\]?/i;

  onBegin() {
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Walk up the suite tree to find the ticket tag
    let ticket: string | null = null;
    let node: Suite | undefined = test.parent;
    while (node) {
      const m = node.title?.match(this.TICKET_RE);
      if (m) { ticket = m[1].toUpperCase(); break; }
      node = node.parent;
    }
    if (!ticket) return;

    const screenshot = result.attachments.find(
      a => a.contentType === 'image/png' && a.path
    )?.path || null;

    const entry = {
      title: test.title,
      status: result.status,
      duration: result.duration,
      error: result.error?.message?.split('\n')[0] || null,
      screenshot,
      project: test.titlePath()[0] || '',
    };

    if (!this.results.has(ticket)) this.results.set(ticket, []);
    this.results.get(ticket)!.push(entry);
  }

  onEnd(result: FullResult) {
    for (const [ticket, tests] of this.results.entries()) {
      const html = this.buildHtml(ticket, tests, result);
      const outFile = path.join(this.outputDir, `${ticket}.html`);
      fs.writeFileSync(outFile, html);
      console.log(`\n📄 QA Report: ${outFile}`);
    }
  }

  private buildHtml(ticket: string, tests: any[], result: FullResult): string {
    const passed  = tests.filter(t => t.status === 'passed').length;
    const failed  = tests.filter(t => t.status === 'failed').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    const total   = tests.length;
    const ms      = tests.reduce((a, t) => a + t.duration, 0);
    const overall = failed > 0 ? 'FAILED' : 'PASSED';
    const color   = failed > 0 ? '#ef4444' : '#22c55e';

    const rows = tests.map((t, i) => {
      const icon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭️';
      const errRow = t.error
        ? `<tr class="err-row"><td colspan="5"><pre>${escHtml(t.error)}</pre></td></tr>`
        : '';
      const ssRow = t.screenshot
        ? `<tr class="ss-row"><td colspan="5"><img src="${t.screenshot}" alt="screenshot" style="max-width:100%;border-radius:6px;margin-top:8px"></td></tr>`
        : '';
      return `
        <tr class="${t.status}">
          <td>${i + 1}</td>
          <td>${escHtml(t.project)}</td>
          <td>${escHtml(t.title)}</td>
          <td>${icon} ${t.status}</td>
          <td>${(t.duration / 1000).toFixed(2)}s</td>
        </tr>${errRow}${ssRow}`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Report — ${ticket}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  .badge { display: inline-block; padding: .25rem .75rem; border-radius: 9999px; font-weight: 700; font-size: .9rem; color: #fff; background: ${color}; margin-bottom: 1.5rem; }
  .meta { display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .meta-item { background: #1e293b; border-radius: 8px; padding: .75rem 1.25rem; }
  .meta-item .val { font-size: 1.5rem; font-weight: 700; }
  .meta-item .lbl { font-size: .75rem; color: #94a3b8; margin-top: .2rem; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
  th { background: #0f172a; padding: .75rem 1rem; text-align: left; font-size: .8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: .75rem 1rem; border-top: 1px solid #334155; font-size: .9rem; vertical-align: top; }
  tr.passed td { border-left: 3px solid #22c55e; }
  tr.failed td { border-left: 3px solid #ef4444; }
  tr.skipped td { border-left: 3px solid #f59e0b; }
  tr.err-row td, tr.ss-row td { background: #0f172a; border-left: 3px solid #ef4444; }
  pre { font-size: .8rem; color: #f87171; white-space: pre-wrap; word-break: break-all; }
  .footer { margin-top: 2rem; font-size: .75rem; color: #475569; }
</style>
</head>
<body>
  <h1>🤖 QA Report — ${ticket}</h1>
  <div class="badge">${overall}</div>
  <div class="meta">
    <div class="meta-item"><div class="val">${total}</div><div class="lbl">Total Tests</div></div>
    <div class="meta-item"><div class="val" style="color:#22c55e">${passed}</div><div class="lbl">Passed</div></div>
    <div class="meta-item"><div class="val" style="color:#ef4444">${failed}</div><div class="lbl">Failed</div></div>
    <div class="meta-item"><div class="val" style="color:#f59e0b">${skipped}</div><div class="lbl">Skipped</div></div>
    <div class="meta-item"><div class="val">${(ms / 1000).toFixed(1)}s</div><div class="lbl">Duration</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Project</th><th>Test</th><th>Status</th><th>Duration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Generated by Playwright E2E · ${new Date().toUTCString()}</div>
</body>
</html>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
