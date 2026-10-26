#!/usr/bin/env node
/**
 * Parses network-evidence.json (from Playwright fixtures or CDP capture)
 * and returns formatted HTML for Plane comments.
 */

function formatRequestParams(params) {
  if (!params || !Object.keys(params).length) return '—';
  return Object.entries(params)
    .map(([k, v]) => `<code>${k}=${v}</code>`)
    .join(' &nbsp; ');
}

function formatBody(body) {
  if (!body) return '—';
  try {
    const parsed = JSON.parse(body);
    return `<pre style="font-size:.75rem;max-height:200px;overflow:auto;background:#0f172a;padding:.5rem;border-radius:4px">${JSON.stringify(parsed, null, 2)}</pre>`;
  } catch {
    return `<pre style="font-size:.75rem;max-height:200px;overflow:auto;background:#0f172a;padding:.5rem;border-radius:4px">${body}</pre>`;
  }
}

function statusBadge(status) {
  const color = status >= 500 ? '#ef4444' : status >= 400 ? '#f59e0b' : status >= 300 ? '#38bdf8' : '#22c55e';
  return `<span style="background:${color};color:#fff;padding:.1rem .4rem;border-radius:4px;font-size:.75rem;font-weight:700">${status}</span>`;
}

function formatNetworkEvidence(calls, filterPattern) {
  // Filter to relevant API calls only
  let filtered = calls.filter(c =>
    c.url.includes('/api/') &&
    !c.url.includes('/assets/') &&
    c.method !== 'OPTIONS'
  );

  if (filterPattern) {
    filtered = filtered.filter(c => c.url.includes(filterPattern));
  }

  if (!filtered.length) return '<p><em>No API calls captured</em></p>';

  const rows = filtered.map((c, i) => {
    const shortUrl = c.url.replace(/https?:\/\/[^/]+/, '');
    const label = c.label ? `<br><small style="color:#38bdf8">${c.label}</small>` : '';
    return `
      <tr>
        <td style="white-space:nowrap">${c.method}</td>
        <td><code style="font-size:.75rem;word-break:break-all">${shortUrl}</code>${label}</td>
        <td>${statusBadge(c.status)}</td>
        <td style="white-space:nowrap">${c.duration}ms</td>
        <td>${formatRequestParams(c.requestParams)}</td>
      </tr>
      ${c.requestBody ? `<tr><td colspan="5"><strong>Request body:</strong>${formatBody(c.requestBody)}</td></tr>` : ''}
      ${c.responseBody ? `<tr><td colspan="5"><strong>Response:</strong>${formatBody(c.responseBody)}</td></tr>` : ''}
    `;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="background:#0f172a;color:#94a3b8">
          <th style="padding:.4rem .6rem;text-align:left">Method</th>
          <th style="padding:.4rem .6rem;text-align:left">URL</th>
          <th style="padding:.4rem .6rem;text-align:left">Status</th>
          <th style="padding:.4rem .6rem;text-align:left">Duration</th>
          <th style="padding:.4rem .6rem;text-align:left">Params</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

module.exports = { formatNetworkEvidence, formatBody, statusBadge };
