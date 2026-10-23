#!/usr/bin/env node
/**
 * Parses the branch name or PR title for ticket IDs (e.g. TICKET-123)
 * and outputs a Playwright --grep pattern to GitHub Actions outputs.
 *
 * Supported formats:
 *   Branch: feature/TICKET-101-flight-search
 *   Branch: TICKET-101
 *   PR title: [TICKET-101] Add flight search
 *   PR title: TICKET-101 TICKET-102 fix stuff
 */

const fs = require('fs');

const TICKET_RE = /\[?(TICKET-\d+)\]?/gi;

const sources = [
  process.env.PR_TITLE || '',
  process.env.BRANCH_NAME || '',
];

const tickets = new Set();
for (const src of sources) {
  for (const match of src.matchAll(TICKET_RE)) {
    tickets.add(match[1].toUpperCase());
  }
}

let grep = '';
if (tickets.size > 0) {
  // Playwright --grep accepts a regex string
  grep = [...tickets].join('|');
  console.log(`Detected tickets: ${[...tickets].join(', ')}`);
  console.log(`Playwright grep pattern: ${grep}`);
} else {
  console.log('No ticket IDs detected — full test suite will run');
}

// Write to GITHUB_OUTPUT
const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, `grep=${grep}\n`);
}

// Also support local use: print export command
if (!outputFile) {
  console.log(`\nTo run locally:\n  npx playwright test --grep "${grep}"`);
}
