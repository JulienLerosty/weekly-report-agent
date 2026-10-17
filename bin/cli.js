#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCsv } from '../src/csv.js';
import { analyze } from '../src/analyze.js';
import { claudeNarrative, dryRunNarrative } from '../src/narrate.js';
import { renderMarkdown } from '../src/render.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'dry-run': { type: 'boolean' }, out: { type: 'string', default: 'out' }, help: { type: 'boolean' } } });
if (values.help || !positionals[0]) {
  console.log('Usage: weekly-report <file.csv> [--dry-run] [--out dir]\n\nNeeds a date column (YYYY-MM-DD) and numeric metrics; other columns are segments.\nWithout --dry-run, set ANTHROPIC_API_KEY.');
  process.exit(values.help ? 0 : 1);
}
try {
  const dry = values['dry-run'];
  if (!dry && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (use --dry-run to try it without a key)');
  const a = analyze(parseCsv(readFileSync(positionals[0], 'utf8')));
  const n = dry ? dryRunNarrative(a) : await claudeNarrative(a);
  const md = renderMarkdown(a, n, { source: basename(positionals[0]), mode: dry ? 'dry-run' : 'live' });
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'report.md'), md);
  writeFileSync(join(values.out, 'slack.txt'), n.slack + '\n');
  console.log(md + '\n--- Slack summary ---\n' + n.slack);
} catch (e) { console.error('Error: ' + e.message); process.exit(1); }
