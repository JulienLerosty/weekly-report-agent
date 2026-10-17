// Deterministic analysis: all numbers in the report come from here, never from the model.
const DAY = 86400000;
const AVG_RE = /^avg_|csat|rate|score|_pct$/i;

export function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

export function profile(rows) {
  const cols = Object.keys(rows[0] ?? {});
  const dateCol = cols.find((c) => /^date$|_date$|^day$/i.test(c)) ?? cols.find((c) => rows.every((r) => /^\d{4}-\d{2}-\d{2}/.test(r[c])));
  if (!dateCol) throw new Error('No date column found (expected ISO dates like 2026-09-07)');
  const isNum = (c) => rows.every((r) => r[c] !== '' && Number.isFinite(Number(r[c])));
  const metrics = cols.filter((c) => c !== dateCol && isNum(c));
  const dims = cols.filter((c) => c !== dateCol && !metrics.includes(c));
  if (!metrics.length) throw new Error('No numeric columns found');
  return { dateCol, metrics, dims };
}

// Aggregate rows into one value per metric (sum, or mean for rate-like columns).
function agg(rows, metrics) {
  const out = {};
  for (const m of metrics) {
    const v = rows.map((r) => Number(r[m]));
    out[m] = v.length ? (AVG_RE.test(m) ? mean(v) : v.reduce((a, b) => a + b, 0)) : 0;
  }
  return out;
}
const pct = (cur, prev) => (prev === 0 ? (cur === 0 ? 0 : null) : round(((cur - prev) / Math.abs(prev)) * 100, 1));

export function analyze(rows, opts = {}) {
  const { minWeeks = 3, zThreshold = 2.5, minChangePct = 20 } = opts;
  const { dateCol, metrics, dims } = profile(rows);
  const byWeek = new Map();
  for (const r of rows) {
    const w = weekStart(r[dateCol].slice(0, 10));
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(r);
  }
  const weeks = [...byWeek.keys()].sort();
  if (weeks.length < minWeeks) throw new Error(`Need at least ${minWeeks} weeks of data, found ${weeks.length}`);
  const cur = weeks.at(-1), prev = weeks.at(-2), history = weeks.slice(0, -1);
  const totals = weeks.map((w) => ({ week: w, ...agg(byWeek.get(w), metrics) }));
  const wow = Object.fromEntries(metrics.map((m) => [m, {
    current: round(totals.at(-1)[m]), previous: round(totals.at(-2)[m]), changePct: pct(totals.at(-1)[m], totals.at(-2)[m]),
  }]));

  const segments = [], anomalies = [];
  // Single dimensions plus pairs (so "APAC x Pro" is visible when neither total moves much).
  const keyOf = (dim, r) => dim.split(' x ').map((d) => r[d]).join(' / ');
  const dimList = [...dims, ...dims.flatMap((a, i) => dims.slice(i + 1).map((b) => `${a} x ${b}`))];
  for (const dim of dimList) {
    const values = [...new Set(rows.map((r) => keyOf(dim, r)))];
    if (values.length > 50) continue; // skip id-like columns
    for (const v of values) for (const m of metrics) {
      const series = weeks.map((w) => agg(byWeek.get(w).filter((r) => keyOf(dim, r) === v), metrics)[m]);
      const c = series.at(-1), p = series.at(-2), base = series.slice(0, -1);
      const change = pct(c, p), s = sd(base), z = s > 0 ? (c - mean(base)) / s : 0;
      const seg = { dimension: dim, value: v, metric: m, current: round(c), previous: round(p), changePct: change, baselineMean: round(mean(base)), z: round(z) };
      segments.push(seg);
      if (Math.abs(z) >= zThreshold && change !== null && Math.abs(change) >= minChangePct) anomalies.push({ kind: 'segment', ...seg });
    }
  }
  // Daily anomalies on the primary (first) metric, vs. all earlier days.
  const pm = metrics[0], dayTotals = new Map();
  for (const r of rows) { const d = r[dateCol].slice(0, 10); dayTotals.set(d, (dayTotals.get(d) ?? 0) + Number(r[pm])); }
  const days = [...dayTotals.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const histDays = days.filter(([d]) => weekStart(d) !== cur).map(([, v]) => v);
  if (!AVG_RE.test(pm) && histDays.length > 7) {
    const m0 = mean(histDays), s0 = sd(histDays);
    for (const [d, v] of days) if (weekStart(d) === cur && s0 > 0 && Math.abs((v - m0) / s0) >= 4 && Math.abs(v - m0) / m0 >= 0.15)
      anomalies.push({ kind: 'day', date: d, metric: pm, value: round(v), baselineMean: round(m0), z: round((v - m0) / s0) });
  }
  const movers = segments.filter((s) => s.changePct !== null && s.previous !== 0)
    .sort((a, b) => Math.abs(b.current - b.previous) / (Math.abs(b.previous) || 1) - Math.abs(a.current - a.previous) / (Math.abs(a.previous) || 1));
  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const top = (k, n) => anomalies.filter((x) => x.kind === k).slice(0, n);
  anomalies.splice(0, anomalies.length, ...top('segment', 10), ...top('day', 3));
  return {
    period: { currentWeek: cur, previousWeek: prev, weeksAnalyzed: weeks.length, historyWeeks: history.length },
    metrics, dimensions: dims, totals, weekOverWeek: wow, anomalies, topMovers: movers.slice(0, 8),
  };
}
