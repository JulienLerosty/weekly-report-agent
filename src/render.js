import { fmtPct } from './narrate.js';

export function renderMarkdown(a, n, { source = 'export.csv', mode = 'live' } = {}) {
  const list = (xs) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- None this week.');
  const tbl = a.totals.slice(-4).map((t) => `| ${t.week} | ${a.metrics.map((m) => Math.round(t[m] * 100) / 100).join(' | ')} |`).join('\n');
  const movers = a.topMovers.slice(0, 5).map((s) => `| ${s.dimension}=${s.value} | ${s.metric} | ${s.previous} | ${s.current} | ${fmtPct(s.changePct)} |`).join('\n');
  return `# ${n.headline}

_Source: ${source} · weeks analyzed: ${a.period.weeksAnalyzed} · narrative: ${mode === 'dry-run' ? 'offline template (dry run)' : 'Claude, numbers computed by code'}_

## What changed
${list(n.whatChanged)}

## Anomalies
${list(n.anomalies)}

## Suggested checks
${list(n.suggestedChecks)}

## Last four weeks
| Week starting | ${a.metrics.join(' | ')} |
|---|${a.metrics.map(() => '---').join('|')}|
${tbl}

## Biggest segment movers
| Segment | Metric | Previous | Current | Change |
|---|---|---|---|---|
${movers}
`;
}
