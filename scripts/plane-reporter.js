#!/usr/bin/env node
/**
 * Plane QA Reporter
 * Reads Playwright JSON results, uploads screenshots + videos as Plane
 * work-item attachments, then posts a formatted QA comment.
 *
 * Usage:
 *   PLANE_TOKEN=xxx PLANE_WORKSPACE=ins-apex PLANE_PROJECT_ID=xxx \
 *   node scripts/plane-reporter.js
 */

const fs   = require('fs');
const path = require('path');

const PLANE_BASE   = process.env.PLANE_BASE_URL || 'https://plane.techgadgetforus.com';
const PLANE_TOKEN  = process.env.PLANE_TOKEN;
const WORKSPACE    = process.env.PLANE_WORKSPACE;
const PROJECT_ID   = process.env.PLANE_PROJECT_ID;
const RESULTS_FILE = process.env.RESULTS_FILE || 'test-results/results.json';

// ── Validation ────────────────────────────────────────────────────────────────
if (!PLANE_TOKEN || !WORKSPACE || !PROJECT_ID) {
  console.error('Missing required env vars: PLANE_TOKEN, PLANE_WORKSPACE, PLANE_PROJECT_ID');
  process.exit(1);
}
if (!fs.existsSync(RESULTS_FILE)) {
  console.error(`Results file not found: ${RESULTS_FILE}\nRun: npx playwright test first.`);
  process.exit(1);
}

// ── Parse results ─────────────────────────────────────────────────────────────
const raw     = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const suites  = raw.suites || [];
const TICKET_RE = /\[?(TICKET-\d+)\]?/i;

function flattenTests(suites, parentTicket = null) {
  const tests = [];
  for (const suite of suites) {
    const ticketMatch = suite.title?.match(TICKET_RE);
    const ticket = ticketMatch ? ticketMatch[1].toUpperCase() : parentTicket;
    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of (spec.tests || [])) {
          const result = test.results?.[0] || {};
          const attachments = result.attachments || [];
          tests.push({
            ticket,
            title: spec.title,
            status: test.status,
            duration: result.duration || 0,
            error: result.error?.message || null,
            // collect all screenshots
            screenshots: attachments
              .filter(a => a.contentType === 'image/png' && a.path && fs.existsSync(a.path))
              .map(a => a.path),
            // collect video
            video: attachments.find(
              a => a.contentType === 'video/webm' && a.path && fs.existsSync(a.path)
            )?.path || null,
          });
        }
      }
    }
    if (suite.suites) tests.push(...flattenTests(suite.suites, ticket));
  }
  return tests;
}

const allTests = flattenTests(suites);

const byTicket = {};
for (const t of allTests) {
  if (!t.ticket) continue;
  if (!byTicket[t.ticket]) byTicket[t.ticket] = [];
  byTicket[t.ticket].push(t);
}

// ── Plane API helpers ─────────────────────────────────────────────────────────
async function planeGet(endpoint) {
  const res = await fetch(`${PLANE_BASE}/api/v1${endpoint}`, {
    headers: { 'X-API-Key': PLANE_TOKEN },
  });
  if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function planePost(endpoint, body) {
  const res = await fetch(`${PLANE_BASE}/api/v1${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': PLANE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status} ${await res.text()}`);
  return res.json();
}

// Upload a file as a Plane work-item attachment, returns { asset_url } or null
async function uploadAttachment(workItemId, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  const filename = path.basename(filePath);
  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.webm' ? 'video/webm' : 'image/png';
  const fileData = fs.readFileSync(filePath);
  const size     = fileData.length;

  // Step 1 — get a presigned upload URL from Plane
  let meta;
  try {
    meta = await planePost(
      `/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${workItemId}/attachments/`,
      { name: filename, type: mimeType, size }
    );
  } catch (e) {
    console.warn(`    ⚠ Could not get upload URL for ${filename}: ${e.message}`);
    return null;
  }

  // Step 2 — PUT the file to the presigned URL (S3 / MinIO)
  if (meta?.upload_data?.url) {
    try {
      const fields  = meta.upload_data.fields || {};
      const form    = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', new Blob([fileData], { type: mimeType }), filename);

      const upRes = await fetch(meta.upload_data.url, { method: 'POST', body: form });
      if (!upRes.ok) {
        console.warn(`    ⚠ Upload failed for ${filename}: ${upRes.status}`);
        return null;
      }

      // Step 3 — confirm upload complete
      await fetch(
        `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${workItemId}/attachments/${meta.asset_id}/`,
        {
          method: 'PATCH',
          headers: { 'X-API-Key': PLANE_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_uploading: false }),
        }
      );

      return meta.asset_url || null;
    } catch (e) {
      console.warn(`    ⚠ Upload error for ${filename}: ${e.message}`);
      return null;
    }
  }

  // Fallback: some self-hosted versions return asset_url directly
  return meta?.asset_url || null;
}

// Find work item by sequence ID
async function findWorkItem(ticketId) {
  const seq  = parseInt(ticketId.replace(/[^0-9]/g, ''), 10);
  const data = await planeGet(
    `/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/?per_page=100`
  );
  const items = data.results || data;
  return items.find(i => i.sequence_id === seq) || null;
}

async function postComment(workItemId, html) {
  return planePost(
    `/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${workItemId}/comments/`,
    { comment_html: html }
  );
}

async function updateState(workItemId, passed) {
  const states    = await planeGet(`/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/states/`);
  const stateList = states.results || states;
  const target    = passed ? 'done' : 'failed';
  const state     = stateList.find(s => s.name.toLowerCase() === target);
  if (!state) return null;
  await fetch(
    `${PLANE_BASE}/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT_ID}/work-items/${workItemId}/`,
    {
      method: 'PATCH',
      headers: { 'X-API-Key': PLANE_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: state.id }),
    }
  );
}

// ── Build HTML comment ────────────────────────────────────────────────────────
function statusIcon(s) {
  return s === 'passed' ? '✅' : s === 'failed' ? '❌' : '⏭️';
}

function buildComment(ticket, tests, uploadedMedia) {
  const passed  = tests.filter(t => t.status === 'passed').length;
  const failed  = tests.filter(t => t.status === 'failed').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  const total   = tests.length;
  const ms      = tests.reduce((a, t) => a + t.duration, 0);
  const overall = failed > 0 ? '❌ FAILED' : '✅ PASSED';

  let html = `<h2>🤖 QA Automated Test Report — ${ticket}</h2>`;
  html += `<p><strong>Result:</strong> ${overall} &nbsp;|&nbsp; `;
  html += `<strong>Tests:</strong> ${total} &nbsp;|&nbsp; `;
  html += `✅ ${passed} passed &nbsp; ❌ ${failed} failed &nbsp; ⏭️ ${skipped} skipped &nbsp;|&nbsp; `;
  html += `<strong>Duration:</strong> ${(ms / 1000).toFixed(1)}s</p>`;
  html += `<hr/>`;
  html += `<h3>Test Cases</h3>`;
  html += `<table><thead><tr><th>#</th><th>Test</th><th>Status</th><th>Duration</th><th>Evidence</th></tr></thead><tbody>`;

  tests.forEach((t, i) => {
    const media = uploadedMedia[i] || {};
    let evidenceLinks = '';
    if (media.screenshots?.length) {
      media.screenshots.forEach((url, si) => {
        evidenceLinks += `<a href="${url}">📸 Screenshot ${si + 1}</a> `;
      });
    }
    if (media.video) {
      evidenceLinks += `<a href="${media.video}">🎥 Video</a>`;
    }
    if (!evidenceLinks) evidenceLinks = '—';

    html += `<tr>`;
    html += `<td>${i + 1}</td>`;
    html += `<td>${t.title}</td>`;
    html += `<td>${statusIcon(t.status)} ${t.status}</td>`;
    html += `<td>${(t.duration / 1000).toFixed(2)}s</td>`;
    html += `<td>${evidenceLinks}</td>`;
    html += `</tr>`;

    if (t.error) {
      html += `<tr><td colspan="5"><pre>${t.error.replace(/</g, '&lt;')}</pre></td></tr>`;
    }
  });

  html += `</tbody></table>`;
  html += `<hr/><p><em>Generated by Playwright E2E · ${new Date().toUTCString()}</em></p>`;
  return html;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const tickets = Object.keys(byTicket);
  if (tickets.length === 0) {
    console.log('No ticket-tagged tests found in results.');
    process.exit(0);
  }

  console.log(`Found tickets: ${tickets.join(', ')}`);

  for (const ticket of tickets) {
    const tests  = byTicket[ticket];
    const passed = tests.every(t => t.status !== 'failed');

    console.log(`\n[${ticket}] Looking up work item...`);
    let item;
    try {
      item = await findWorkItem(ticket);
    } catch (e) {
      console.error(`  ✗ API error: ${e.message}`);
      continue;
    }
    if (!item) {
      console.warn(`  ⚠ Work item not found for ${ticket} — skipping`);
      continue;
    }
    console.log(`  Found: "${item.name}" (id: ${item.id})`);

    // Upload screenshots + videos per test
    const uploadedMedia = [];
    for (const t of tests) {
      const media = { screenshots: [], video: null };

      for (const ss of t.screenshots) {
        console.log(`  📸 Uploading screenshot: ${path.basename(ss)}`);
        const url = await uploadAttachment(item.id, ss);
        if (url) { media.screenshots.push(url); console.log(`     ✓ ${url}`); }
      }

      if (t.video) {
        console.log(`  🎥 Uploading video: ${path.basename(t.video)}`);
        const url = await uploadAttachment(item.id, t.video);
        if (url) { media.video = url; console.log(`     ✓ ${url}`); }
      }

      uploadedMedia.push(media);
    }

    // Post comment
    const comment = buildComment(ticket, tests, uploadedMedia);
    try {
      await postComment(item.id, comment);
      console.log(`  ✓ Comment posted`);
    } catch (e) {
      console.error(`  ✗ Failed to post comment: ${e.message}`);
    }

    // Update state
    try {
      await updateState(item.id, passed);
      console.log(`  ✓ State updated → ${passed ? 'Done' : 'Failed'}`);
    } catch (e) {
      console.error(`  ✗ Failed to update state: ${e.message}`);
    }
  }

  console.log('\nDone.');
})();
