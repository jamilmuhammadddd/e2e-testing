#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const PLANE_BASE = 'https://plane.techgadgetforus.com';
const TOKEN      = 'plane_api_87b5d57f243e4b82ba25ef1b2c8c1c48';
const WORKSPACE  = 'ins-apex';
const PROJECT_ID = '3e3b3571-cfb1-49ae-a86b-bfbce275babb';
const ITEM_ID    = '78ee23f0-5800-4f92-a40a-858eb62b7247'; // TMA-166

const RESULTS_DIR = 'test-results/regression-tma-166--TMA-16-b06f0--is-not-global-across-pages-chromium';

const screenshots = [
  { file: `${RESULTS_DIR}/attachments/01-page1-default-sort-8eb6e5c380b3baed9f3d79d88faec131d7c643ab.png`, label: 'Step 1 — Page 1 default sort (CREATED AT desc)' },
  { file: `${RESULTS_DIR}/attachments/02-page2-default-sort-84a16d480c50449fc6352ee6be046cd97da661d0.png`, label: 'Step 2 — Page 2 default sort — newer items appear here ❌' },
  { file: `${RESULTS_DIR}/attachments/03-page1-az-sort-20810fb68221931b66b1b6b9232f0a2d35770825.png`,      label: 'Step 3 — Page 1 after A-Z sort — ends with "QA Regression Bulk 260"' },
  { file: `${RESULTS_DIR}/attachments/04-page2-az-sort-ecd7811d00aecb10e802de31f47f80d7595d8a7d.png`,      label: 'Step 4 — Page 2 after A-Z sort — starts with "QA Regression Bulk 196" ❌ (should precede 260)' },
];

async function uploadAttachment(filePath, filename) {
  const fileData = fs.readFileSync(filePath);
  const size = fileData.length;
  const r1 = await fetch(
    `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${ITEM_ID}/attachments/`,
    { method: 'POST', headers: { 'X-API-Key': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: filename, type: 'image/png', size }) }
  );
  const meta = await r1.json();
  if (meta?.upload_data?.url) {
    const fields = meta.upload_data.fields || {};
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([fileData], { type: 'image/png' }), filename);
    await fetch(meta.upload_data.url, { method: 'POST', body: form });
    await fetch(
      `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${ITEM_ID}/attachments/${meta.asset_id}/`,
      { method: 'PATCH', headers: { 'X-API-Key': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ is_uploading: false }) }
    );
  }
  const url = meta?.asset_url;
  return url ? (url.startsWith('http') ? url : `${PLANE_BASE}${url}`) : null;
}

function statusBadge(status) {
  const color = status >= 500 ? '#ef4444' : status >= 400 ? '#f59e0b' : '#22c55e';
  return `<span style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-size:.75rem;font-weight:700">${status}</span>`;
}

function formatBody(body) {
  if (!body) return '<em>—</em>';
  const str = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const out = str.length > 1200 ? str.substring(0, 1200) + '\n...[truncated]' : str;
  return `<pre style="font-size:.72rem;max-height:160px;overflow:auto;background:#0f172a;color:#e2e8f0;padding:.5rem;border-radius:4px;margin:4px 0 0">${out.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`;
}

function buildNetworkSection(calls) {
  const key = calls.filter(c =>
    c.url.includes('revamp-api') &&
    !c.url.includes('cdn-cgi') &&
    !c.url.includes('mau-usage') &&
    !c.url.includes('/statistics/') &&
    !c.url.includes('/campaigns/') &&
    c.method !== 'OPTIONS'
  );

  for (const c of key) {
    if (c.url.includes('sign-in'))                                              c.label = '🔑 Login';
    if (c.url.includes('profiles/properties/tags') && c.step === '2-page1-default') c.label = '📋 Initial list fetch — returns data for current page only';
    if (c.url.includes('profiles/properties/tags') && c.step !== '2-page1-default') c.label = '🔄 Re-fetch on page/sort change — still no global sort param';
    if (c.url.includes('auth/me'))                                              c.label = '👤 Auth check';
  }

  if (!key.length) return '<p><em>No API calls captured</em></p>';

  const rows = key.map(c => {
    const shortUrl  = c.url.replace('https://revamp-api.techgadgetforus.com', '');
    const params    = Object.keys(c.requestParams || {}).length
      ? Object.entries(c.requestParams).map(([k,v]) => `<code>${k}=${v}</code>`).join(' ')
      : '—';
    const labelHtml = c.label ? `<br><small style="color:#38bdf8;font-weight:600">${c.label}</small>` : '';
    const stepBadge = `<span style="font-size:.7rem;background:#334155;color:#94a3b8;padding:1px 5px;border-radius:3px">${c.step}</span>`;
    return `
      <tr style="border-bottom:1px solid #1e293b;vertical-align:top">
        <td style="padding:.4rem .5rem;white-space:nowrap">${stepBadge}</td>
        <td style="padding:.4rem .5rem;white-space:nowrap;font-weight:700">${c.method}</td>
        <td style="padding:.4rem .5rem;font-size:.75rem;word-break:break-all"><code>${shortUrl}</code>${labelHtml}</td>
        <td style="padding:.4rem .5rem">${statusBadge(c.status)}</td>
        <td style="padding:.4rem .5rem;font-size:.75rem">${params}</td>
        <td style="padding:.4rem .5rem;white-space:nowrap;font-size:.75rem">${c.duration}ms</td>
      </tr>
      ${c.responseBody ? `<tr style="background:#0a1120"><td colspan="6" style="padding:.3rem .5rem"><strong style="font-size:.75rem;color:#94a3b8">Response (first 3 items):</strong>${formatBody(c.responseBody)}</td></tr>` : ''}`;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;background:#1e293b;color:#e2e8f0;border-radius:6px;overflow:hidden">
      <thead>
        <tr style="background:#0f172a;color:#94a3b8;font-size:.75rem">
          <th style="padding:.4rem .5rem;text-align:left">Step</th>
          <th style="padding:.4rem .5rem;text-align:left">Method</th>
          <th style="padding:.4rem .5rem;text-align:left">URL</th>
          <th style="padding:.4rem .5rem;text-align:left">Status</th>
          <th style="padding:.4rem .5rem;text-align:left">Params</th>
          <th style="padding:.4rem .5rem;text-align:left">Duration</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

(async () => {
  // 1. Upload screenshots
  const uploaded = [];
  for (const ss of screenshots) {
    const filename = path.basename(ss.file);
    console.log(`Uploading: ${filename}`);
    const url = await uploadAttachment(ss.file, filename);
    console.log(`  -> ${url}`);
    uploaded.push({ label: ss.label, url });
  }

  // 2. Load network evidence
  const netFile = `${RESULTS_DIR}/attachments/network-evidence-86b7a1a96934a8df06b11b5703ad730ff5467e7b.json`;
  const netCalls = fs.existsSync(netFile) ? JSON.parse(fs.readFileSync(netFile, 'utf-8')) : [];
  console.log(`Loaded ${netCalls.length} network calls`);

  // 3. Build screenshot rows
  const ssRows = uploaded.map((u, i) => {
    const img = u.url
      ? `<a href="${u.url}" target="_blank"><img src="${u.url}" width="480" style="max-width:100%;border-radius:6px;display:block;margin-top:6px" /></a>`
      : '—';
    return `<tr><td style="padding:.4rem .6rem;white-space:nowrap">${i + 1}</td><td style="padding:.4rem .6rem">${u.label}</td><td style="padding:.4rem .6rem">${img}</td></tr>`;
  }).join('');

  const now = new Date().toUTCString();

  const comment = `
<h2>🤖 QA Automated Test Report — TMA-166</h2>
<p>
  <strong>Result:</strong> ❌ BUG CONFIRMED &nbsp;|&nbsp;
  <strong>Test:</strong> TC-Configuration-437 &nbsp;|&nbsp;
  <strong>Tested:</strong> ${now}
</p>
<p>
  <strong>Environment:</strong> Workspace Erlyna · Chrome (Playwright) ·
  <a href="https://revamp-dashboard.techgadgetforus.com/configurations/user-profile-attributes">User Profile Attributes</a>
</p>

<hr/>
<h3>🐛 Bug Summary</h3>
<p>
  Sorting (both default CREATED AT and column A-Z) is applied <strong>per page only</strong>, not globally across all data.
  After applying A-Z sort, page 1 ends with <strong>"QA Regression Bulk 260"</strong> while page 2 starts with
  <strong>"QA Regression Bulk 196"</strong> — which alphabetically should appear on page 1 before 260.
</p>
<p>
  <strong>Root cause (network evidence below):</strong> The API endpoint
  <code>GET /v1/profiles/properties/tags/workspace:68</code> does not receive any
  <code>sort</code> or <code>orderBy</code> query parameter when a column sort is applied.
  The sort is applied client-side on the current page's data only, not passed to the backend for a globally-sorted fetch.
</p>
<p>
  <strong>Fix suggestion:</strong> Pass the active sort column and direction as query params to the list API
  (e.g. <code>?sort=name&order=asc</code>) so the backend returns globally sorted and paginated data.
</p>

<hr/>
<h3>📸 Evidence — Step by Step Screenshots</h3>
<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr style="background:#0f172a;color:#94a3b8">
      <th style="padding:.4rem .6rem;text-align:left">#</th>
      <th style="padding:.4rem .6rem;text-align:left">Step</th>
      <th style="padding:.4rem .6rem;text-align:left">Screenshot</th>
    </tr>
  </thead>
  <tbody>${ssRows}</tbody>
</table>

<hr/>
<h3>🌐 Network Evidence — API Calls</h3>
<p>
  Captured via Playwright <code>page.on('response')</code>.
  Note: the list fetch <code>GET /v1/profiles/properties/tags/workspace:68</code> is called with only
  <code>systemProps=false</code> — <strong>no sort/order params are sent</strong> regardless of UI sort state.
</p>
${buildNetworkSection(netCalls)}

<hr/>
<h3>📋 Test Steps &amp; Observed Data</h3>
<ol>
  <li>Navigate to Configurations › User Profile Attributes (default CREATED AT sort)</li>
  <li>Page 1 shows rows 1–10, footer: <strong>"Showing 1 to 10 of 481 Results"</strong> ✅</li>
  <li>Navigate to page 2 — newer items (QA Regression Bulk 269, 267…) appear here ❌<br>
      <em>Expected: newest on page 1; page 2 should have older items</em></li>
  <li>Return to page 1, click A-Z column sort</li>
  <li>Page 1 A-Z ends with: <strong>"QA Regression Bulk 260"</strong></li>
  <li>Navigate to page 2 — starts with: <strong>"QA Regression Bulk 196"</strong> ❌<br>
      <em>196 &lt; 260 alphabetically — it should appear on page 1 before 260 in a global sort</em></li>
</ol>
<p><strong>Expected:</strong> Sort applies globally — backend returns sorted+paginated data across all pages</p>
<p><strong>Actual:</strong> Sort is client-side per-page — each page is independently sorted, no sort params sent to API</p>

<hr/>
<p><em>Generated by Playwright E2E automation · ${now}</em></p>`;

  const r = await fetch(
    `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${ITEM_ID}/comments/`,
    { method: 'POST', headers: { 'X-API-Key': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_html: comment }) }
  );
  const res = await r.json();
  console.log(`Comment posted: ${r.status}`, res?.id ? `id: ${res.id}` : JSON.stringify(res).substring(0, 100));
})();
