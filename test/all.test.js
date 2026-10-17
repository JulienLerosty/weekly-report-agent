import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readFileSync as rf } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv } from '../src/csv.js';
import { analyze, weekStart } from '../src/analyze.js';
import { claudeNarrative, dryRunNarrative } from '../src/narrate.js';
import { renderMarkdown } from '../src/render.js';

const load = (f) => parseCsv(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8'));
const CLI = new URL('../bin/cli.js', import.meta.url).pathname;

test('csv: quotes, escaped quotes, CRLF, ragged rows', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [{ a: 'x, y', b: 'say "hi"' }]);
  assert.throws(() => parseCsv('a,b\n1\n'), /Row 2/);
  assert.throws(() => parseCsv(''), /empty/);
});

test('weekStart returns Monday', () => {
  assert.equal(weekStart('2026-09-13'), '2026-09-07'); // Sunday
  assert.equal(weekStart('2026-09-14'), '2026-09-14'); // Monday
});

test('sales fixture: finds the planted APAC/Pro drop, US/Team spike and EU/Team refunds', () => {
  const a = analyze(load('sales.csv'));
  const has = (v, m) => a.anomalies.some((x) => x.value === v && x.metric === m);
  assert.ok(has('APAC / Pro', 'orders'));
  assert.ok(has('US / Team', 'orders'));
  assert.ok(has('EU / Team', 'refunds'));
  assert.ok(a.anomalies.some((x) => x.kind === 'day' && x.date === '2026-10-15'));
  assert.equal(a.period.currentWeek, '2026-10-12');
  assert.equal(a.weekOverWeek.orders.previous, a.totals.at(-2).orders);
});

test('support fixture: Login surge detected, csat averaged not summed', () => {
  const a = analyze(load('support.csv'));
  assert.ok(a.anomalies.some((x) => x.value === 'Login' && x.metric === 'tickets' && x.changePct > 100));
  assert.ok(a.weekOverWeek.csat.current < 5);
});

test('too little data and missing date column fail clearly', () => {
  assert.throws(() => analyze(parseCsv('date,n\n2026-09-07,1\n2026-09-08,2\n')), /at least 3 weeks/);
  assert.throws(() => analyze(parseCsv('name,n\nx,1\n')), /No date column/);
});

test('dry-run narrative and markdown are complete and slack fits 600 chars', () => {
  const a = analyze(load('sales.csv'));
  const n = dryRunNarrative(a);
  assert.ok(n.slack.length <= 600);
  const md = renderMarkdown(a, n, { source: 'sales.csv', mode: 'dry-run' });
  for (const h of ['## What changed', '## Anomalies', '## Suggested checks', '## Biggest segment movers']) assert.ok(md.includes(h));
});

test('claudeNarrative parses model JSON via an injected client (no network)', async () => {
  const a = analyze(load('sales.csv'));
  const payload = { headline: 'h', whatChanged: [], anomalies: [], suggestedChecks: [], slack: 's' };
  let seen;
  const client = { messages: { create: async (req) => { seen = req; return { content: [{ type: 'text', text: 'Here: ' + JSON.stringify(payload) }] }; } } };
  assert.deepEqual(await claudeNarrative(a, { client, model: 'm' }), payload);
  assert.equal(seen.model, 'm');
  const bad = { messages: { create: async () => ({ content: [{ type: 'text', text: '{"headline":"x"}' }] }) } };
  await assert.rejects(claudeNarrative(a, { client: bad }), /missing/);
  const junk = { messages: { create: async () => ({ content: [{ type: 'text', text: 'nope' }] }) } };
  await assert.rejects(claudeNarrative(a, { client: junk }), /valid JSON/);
});

test('cli --dry-run writes report.md and slack.txt', () => {
  const out = mkdtempSync(join(tmpdir(), 'wr-'));
  execFileSync('node', [CLI, new URL('../fixtures/sales.csv', import.meta.url).pathname, '--dry-run', '--out', out]);
  assert.match(rf(join(out, 'report.md'), 'utf8'), /^# Week of 2026-10-12/);
  assert.ok(rf(join(out, 'slack.txt'), 'utf8').length > 10);
});

test('cli without key and without --dry-run refuses', () => {
  const r = spawnSync('node', [CLI, 'x.csv'], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(r.status, 1);
});
