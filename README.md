# weekly-report-agent

Turn a CSV export (sales, support, signups, anything with a date column) into a weekly Markdown report and a Slack-ready summary that point out what changed and what looks off.

**Design choice: code does the math, Claude does the writing.** Week-over-week changes, segment breakdowns and anomaly detection (z-scores against earlier weeks) are computed deterministically in `src/analyze.js`. Claude only receives that JSON and is told to use no numbers that aren't in it, so the figures in your report can't be hallucinated.

> Built with AI assistance (mainly Claude) under the author's supervision; the author reviews and tests it.

## Quick start

```bash
npm install
npm test                                   # 9 tests, no network
node bin/cli.js fixtures/sales.csv --dry-run   # offline, template narrative
export ANTHROPIC_API_KEY=...               # your key, read from the environment only
node bin/cli.js your-export.csv            # Claude writes the narrative
```

Requires Node 22+. Output goes to `out/report.md` and `out/slack.txt`. Set `WEEKLY_REPORT_MODEL` to pick a model.

## CSV format

One date column (`YYYY-MM-DD`), numeric columns as metrics, other columns as segments. Columns named like `avg_*`, `csat`, `rate`, `score` are averaged; the rest are summed. Segments are checked singly and in pairs (e.g. `region x product`), which is how a drop hiding inside one region and plan shows up even when the totals barely move. At least 3 weeks of data are needed.

## Sample output

The fixtures (`scripts/make-fixtures.js`, seeded, no real data) have three planted events in the last week: APAC/Pro orders cut by about two thirds, a one-day US/Team spike, and EU/Team refunds up. This is the real output of `node bin/cli.js fixtures/sales.csv --dry-run` (the offline template narrative; with an API key Claude writes fuller prose from the same analysis):

# Week of 2026-10-12: orders 531 (+0.6% vs previous week)

_Source: sales.csv · weeks analyzed: 6 · narrative: offline template (dry run)_

## What changed
- orders: 531 vs 528 (+0.6%)
- revenue: 25139 vs 22122 (+13.6%)
- refunds: 18 vs 11 (+63.6%)

## Anomalies
- product=Team: orders 97 vs 63 last week (+54%, z=40.5)
- region x product=US / Team: orders 62 vs 28 last week (+121.4%, z=40.5)
- region=US: revenue 14203 vs 10214 last week (+39.1%, z=27.7)
- region x product=APAC / Pro: orders 12 vs 34 last week (-64.7%, z=-15.98)
- region=APAC: revenue 3515 vs 4612 last week (-23.8%, z=-14.75)
- region x product=EU / Team: refunds 14 vs 3 last week (+366.7%, z=10.33)
- 2026-10-15: orders 102 vs a usual 75.4 (z=12.83)

## Suggested checks
- Look into product=Team: is the orders change real or a tracking issue?
- Look into region x product=US / Team: is the orders change real or a tracking issue?
- Look into region=US: is the revenue change real or a tracking issue?

## Last four weeks
| Week starting | orders | revenue | refunds |
|---|---|---|---|
| 2026-09-21 | 527 | 22323 | 10 |
| 2026-09-28 | 535 | 22475 | 8 |
| 2026-10-05 | 528 | 22122 | 11 |
| 2026-10-12 | 531 | 25139 | 18 |

## Biggest segment movers
| Segment | Metric | Previous | Current | Change |
|---|---|---|---|---|
| region x product=EU / Team | refunds | 3 | 14 | +366.7% |
| product=Team | refunds | 4 | 14 | +250% |
| region x product=US / Team | orders | 28 | 62 | +121.4% |
| region x product=US / Team | revenue | 3612 | 7998 | +121.4% |
| region=EU | refunds | 7 | 15 | +114.3% |

Slack summary:

```
*Week of 2026-10-12: orders 531 (+0.6% vs previous week)*
• product=Team: orders 97 vs 63 last week (+54%, z=40.5)
• region x product=US / Team: orders 62 vs 28 last week (+121.4%, z=40.5)
• region=US: revenue 14203 vs 10214 last week (+39.1%, z=27.7)
```

Support data works too (`fixtures/support.csv`): a Login ticket surge (+225%) with slower first response and lower CSAT is flagged at the top.

## Tests

`npm test` covers the CSV parser, week bucketing, anomaly detection on both fixtures (it must find the planted events), error messages for bad input, the Claude call through an injected fake client (valid, incomplete and non-JSON replies), and the CLI end to end. Live Claude output has not been captured in this repo's sample; the model call is exercised only through the fake client.

## What I'd build for you

This is the small version. For a real client I would typically:

- Connect it to your source directly (Shopify, Stripe, Zendesk, HubSpot, a database or Google Sheets) instead of a CSV export.
- Tune the anomaly rules to your business: seasonality, campaign calendars, thresholds that matter in your money terms.
- Post to Slack or email on a schedule (cron, GitHub Actions or n8n) and keep a history so the report can say "third week in a row".
- Add the segments your team actually asks about, plus a short "what to do about it" section agreed with you.
- Hand over documentation, tests and a run book so your team owns it.

Typical scope: a few days of work. Send me a sample export and the one question you most want answered each Monday.

## License

MIT

## Hire me

I build small, tested automations like this one for clients.

- Upwork: https://www.upwork.com/freelancers/~011ec6fab9b610aea9

AI tools, mainly Claude, are used under my supervision; I review and test every delivery.
