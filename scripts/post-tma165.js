#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const PLANE_BASE = 'https://plane.techgadgetforus.com';
const TOKEN      = 'plane_api_87b5d57f243e4b82ba25ef1b2c8c1c48';
const WORKSPACE  = 'ins-apex';
const PROJECT_ID = '3e3b3571-cfb1-49ae-a86b-bfbce275babb';
const ITEM_ID    = '13123d26-4dde-463f-aef6-630d04639cd6'; // TMA-165

const RESULTS_DIR = 'test-results/regression-tma-165--TMA-16-6d21f-ctly-after-edit-from-page-2-chromium';

const screenshots = [
  { file: `${RESULTS_DIR}/attachments/01-page1-651b1c93f161a8e075e630d0b9c64e9a41b780b3.png`,         label: 'Step 1 — Page 1: Showing 1 to 10 of 476 Results ✅' },
  { file: `${RESULTS_DIR}/attachments/02-page2-cb348725841b2f31f2d94408b3ed06998ae18111.png`,          label: 'Step 2 — Page 2: Showing 11 to 20 of 476 Results ✅' },
  { file: `${RESULTS_DIR}/attachments/03-edit-modal-c47be8491f652619b19a0aac4425f6880b8bd02c.png`,     label: 'Step 3 — Edit modal open on row 11 ✅' },
  { file: `${RESULTS_DIR}/attachments/04-after-edit-bug-1cd67fb7b1338dae1c51982e77614fee8f8af179.png`, label: 'Step 4 — BUG: Showing 11 to 1 of 1 Results / No data ❌' },
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
  // Filter to key API calls only — skip CDN noise and analytics
  const key = calls.filter(c =>
    c.url.includes('revamp-api') &&
    !c.url.includes('cdn-cgi') &&
    !c.url.includes('mau-usage') &&
    !c.url.includes('/statistics/') &&
    !c.url.includes('/campaigns/') &&
    c.method !== 'OPTIONS'
  );

  // Label calls for engineers
  for (const c of key) {
    if (c.url.includes('sign-in'))                                          c.label = '🔑 Login';
    if (c.url.includes('profiles/properties/tags') && c.step === '2-navigate') c.label = '📋 Initial list fetch (page load)';
    if (c.url.includes('profiles/properties/tags') && c.step !== '2-navigate') c.label = '🔄 Re-fetch after edit — ⚠️ no page reset sent';
    if (c.url.match(/profiles\/properties\/qa_reg/) && c.method === 'GET')  c.label = '📄 Fetch single attribute for edit modal';
    if (c.url.match(/profiles\/properties\/qa_reg/) && c.method === 'PUT')  c.label = '✏️ Submit edit (succeeds — triggers broken re-fetch)';
  }

  if (!key.length) return '<p><em>No API calls captured</em></p>';

  const rows = key.map(c => {
    const shortUrl = c.url.replace('https://revamp-api.techgadgetforus.com', '');
    const params   = Object.keys(c.requestParams || {}).length
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
      ${c.requestBody ? `<tr style="background:#0a1120"><td colspan="6" style="padding:.3rem .5rem"><strong style="font-size:.75rem;color:#94a3b8">Request body:</strong>${formatBody(c.requestBody)}</td></tr>` : ''}
      ${c.responseBody ? `<tr style="background:#0a1120"><td colspan="6" style="padding:.3rem .5rem"><strong style="font-size:.75rem;color:#94a3b8">Response:</strong>${formatBody(c.responseBody)}</td></tr>` : ''}`;
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

  // 2. Load network evidence from Playwright run
  const netFile = `${RESULTS_DIR}/attachments/network-evidence-187b55caf8e9abb9934c010a1ff688cbdac4f56e.json`;
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
<h2>🤖 QA Automated Test Report — TMA-165</h2>
<p>
  <strong>Result:</strong> ❌ BUG CONFIRMED &nbsp;|&nbsp;
  <strong>Test:</strong> TC-Configuration-410 &nbsp;|&nbsp;
  <strong>Tested:</strong> ${now}
</p>
<p>
  <strong>Environment:</strong> Workspace Erlyna · Chrome (Playwright) ·
  <a href="https://revamp-dashboard.techgadgetforus.com/configurations/user-profile-attributes">User Profile Attributes</a>
</p>

<hr/>
<h3>🐛 Bug Summary</h3>
<p>
  After editing a User Profile Attribute on <strong>page 2</strong>, the table re-fetches the list
  but the frontend retains its current page offset without resetting to page 1.
  The API returns only 1 result for the stale offset range — footer reads
  <strong>"Showing 11 to 1 of 1 Results"</strong> and the table appears empty.
</p>
<p>
  <strong>Root cause (network evidence below):</strong> After
  <code>PUT /v1/profiles/properties/:id</code> succeeds, the frontend triggers
  <code>GET /v1/profiles/properties/tags/workspace:68</code> without resetting
  <code>currentPage</code> to 1. The list component still has <code>offset=10</code>
  while the data set has changed, causing a mismatch between UI state and API response.
</p>
<p>
  <strong>Fix suggestion:</strong> Reset pagination state to page 1 before or immediately
  after the re-fetch that follows a successful edit/update operation.
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
<p>Captured via Playwright <code>page.on('response')</code> — filtered to <code>revamp-api</code> calls only:</p>
${buildNetworkSection(netCalls)}

<hr/>
<h3>📋 Test Steps Executed</h3>
<ol>
  <li>Navigate to Configurations › User Profile Attributes</li>
  <li>Verify page 1 — footer: <strong>"Showing 1 to 10 of 476 Results"</strong> ✅</li>
  <li>Navigate to page 2 — footer: <strong>"Showing 11 to 20 of 476 Results"</strong> ✅</li>
  <li>Click Edit on row 11 — modal opens correctly ✅</li>
  <li>Fill Description → Submit</li>
  <li><strong>Result: "No data", footer "Showing 11 to 1 of 1 Results"</strong> ❌</li>
</ol>
<p><strong>Expected:</strong> Full paginated list, footer reset to "Showing 1 to 10 of 476 Results"</p>
<p><strong>Actual:</strong> Empty table with stale page-2 offset until manual page refresh</p>

<hr/>
<p><em>Generated by Playwright E2E automation · ${now}</em></p>`;

  const r = await fetch(
    `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${ITEM_ID}/comments/`,
    { method: 'POST', headers: { 'X-API-Key': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_html: comment }) }
  );
  const res = await r.json();
  console.log(`Comment posted: ${r.status}`, res?.id ? `id: ${res.id}` : JSON.stringify(res).substring(0, 100));
})();
