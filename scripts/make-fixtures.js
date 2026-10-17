// Generates deterministic fixtures/sales.csv and fixtures/support.csv (seeded, no real data).
import { writeFileSync } from 'node:fs';
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const day = (d) => new Date(Date.UTC(2026, 8, 7 + d)).toISOString().slice(0, 10); // Mon 2026-09-07
const regions = ['EU', 'US', 'APAC'], products = ['Starter', 'Pro', 'Team'];
const price = { Starter: 19, Pro: 49, Team: 129 };
let sales = 'date,region,product,orders,revenue,refunds\n';
for (let d = 0; d < 42; d++) for (const r of regions) for (const p of products) {
  let n = Math.round((p === 'Starter' ? 14 : p === 'Pro' ? 8 : 3) * (r === 'US' ? 1.4 : r === 'EU' ? 1 : 0.6) * (0.85 + rnd() * 0.3));
  if (d >= 35 && r === 'APAC' && p === 'Pro') n = Math.round(n * 0.35); // last week: APAC Pro drop
  if (d === 38 && r === 'US' && p === 'Team') n += 30;                   // one-day spike
  const ref = p === 'Team' && d >= 35 && r === 'EU' ? 2 : rnd() < 0.15 ? 1 : 0;
  sales += `${day(d)},${r},${p},${n},${n * price[p]},${ref}\n`;
}
writeFileSync(new URL('../fixtures/sales.csv', import.meta.url), sales);
let sup = 'date,category,tickets,avg_first_response_min,csat\n';
for (let d = 0; d < 42; d++) for (const c of ['Billing', 'Login', 'Bug', 'How-to']) {
  let t = Math.round({ Billing: 12, Login: 9, Bug: 7, 'How-to': 15 }[c] * (0.8 + rnd() * 0.4));
  let frt = Math.round(35 + rnd() * 10), csat = (4.4 + rnd() * 0.3).toFixed(2);
  if (d >= 35 && c === 'Login') { t *= 3; frt += 40; csat = (3.6 + rnd() * 0.3).toFixed(2); }
  sup += `${day(d)},${c},${t},${frt},${csat}\n`;
}
writeFileSync(new URL('../fixtures/support.csv', import.meta.url), sup);
