import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.WEEKLY_REPORT_MODEL ?? 'claude-sonnet-5-5';

const SYSTEM = `You write the weekly business report for a small team. You get a JSON analysis computed by code from a CSV export.
Rules: use ONLY numbers present in the JSON; never invent causes, state hypotheses as hypotheses and say what data would confirm them; be concise and concrete.
Return JSON only: {"headline": string, "whatChanged": string[], "anomalies": string[], "suggestedChecks": string[], "slack": string}.
"slack" is <= 600 characters, Slack mrkdwn (*bold*, bullets with •), starts with the headline.`;

export const fmtPct = (x) => (x === null ? 'new' : `${x > 0 ? '+' : ''}${x}%`);

// Offline narrator for --dry-run and tests: same output shape, no network, no model.
export function dryRunNarrative(a) {
  const [m0] = a.metrics, w = a.weekOverWeek[m0];
  const headline = `Week of ${a.period.currentWeek}: ${m0} ${w.current} (${fmtPct(w.changePct)} vs previous week)`;
  const whatChanged = a.metrics.map((m) => `${m}: ${a.weekOverWeek[m].current} vs ${a.weekOverWeek[m].previous} (${fmtPct(a.weekOverWeek[m].changePct)})`);
  const seen = new Set();
  const uniq = a.anomalies.filter((x) => x.kind === 'day' || !seen.has(x.dimension + x.value) && seen.add(x.dimension + x.value));
  const anomalies = uniq.map((x) => x.kind === 'day'
    ? `${x.date}: ${x.metric} ${x.value} vs a usual ${x.baselineMean} (z=${x.z})`
    : `${x.dimension}=${x.value}: ${x.metric} ${x.current} vs ${x.previous} last week (${fmtPct(x.changePct)}, z=${x.z})`);
  const suggestedChecks = uniq.slice(0, 3).map((x) => x.kind === 'day' ? `Check what happened on ${x.date} (campaign, bulk order, data duplicate?)` : `Look into ${x.dimension}=${x.value}: is the ${x.metric} change real or a tracking issue?`);
  const slack = [`*${headline}*`, ...anomalies.slice(0, 3).map((x) => `• ${x}`)].join('\n').slice(0, 600);
  return { headline, whatChanged, anomalies, suggestedChecks, slack };
}

export async function claudeNarrative(a, { client = new Anthropic(), model = MODEL } = {}) {
  const res = await client.messages.create({
    model, max_tokens: 1500, system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(a) }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let n;
  try { n = JSON.parse(json); } catch { throw new Error('Model did not return valid JSON'); }
  for (const k of ['headline', 'whatChanged', 'anomalies', 'suggestedChecks', 'slack'])
    if (!(k in n)) throw new Error(`Model output is missing "${k}"`);
  return n;
}
