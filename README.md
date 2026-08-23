# aoda-scan

**Crawl an entire website and find out where it actually stands against WCAG 2.1 AA and Ontario's AODA.**

Most accessibility tools check one page at a time. That tells you very little — a site fails as a
whole, and the same broken component usually fails on every page that renders it. `aoda-scan`
crawls the site, tests every page, and rolls the results into one picture: a grade, a conformance
percentage, and a ranked list of what to fix first.

[![CI](https://github.com/XenofonGk/aoda-scan/actions/workflows/ci.yml/badge.svg)](https://github.com/XenofonGk/aoda-scan/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/aoda-scan.svg)](https://www.npmjs.com/package/aoda-scan)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Quick start

```bash
npx aoda-scan https://example.ca
```

```
  Grade C   14/22 pages clean (64%)
  1 critical · 3 serious · 2 moderate · 0 minor  (distinct rules)
  87 elements affected across 6 rules

  Fix first:
    critical Images must have alternative text (19 pages)
    serious  Elements must meet minimum color contrast ratio thresholds (22 pages)
    serious  Form elements must have labels (4 pages)

  Report: /path/to/a11y-report/index.html
```

Open `a11y-report/index.html` for the dashboard.

---

## What you get

**A site-wide verdict.** A letter grade and the share of pages that pass every automated WCAG 2.1
AA check — the number to quote when someone asks "how accessible is our site?" A scan that reached
no pages reports *no data* rather than a failing grade, because "we could not test it" and "it is
inaccessible" are different answers.

**A fix-first list.** Rules are ranked by how far they spread, not how often they appear. A contrast
failure on 22 pages usually lives in one stylesheet; fixing it once clears all 22. That ranking is
the difference between a week of work and an afternoon.

**Per-page detail.** Every scanned page gets its own report with the failing elements, the CSS
selector, the offending markup, and a link to the remediation guidance.

**The Ontario legal framing.** AODA obligations, deadlines and penalties stated on the report, so a
non-technical reader understands the exposure without needing you to translate.

**Machine-readable output.** `summary.json` and `pages.json` for dashboards, diffing between runs,
or gating a build.

---

## Usage

```
aoda-scan <url> [options]

  --max-pages <n>       Pages to crawl                          (default 50)
  --max-depth <n>       Link depth from the start URL           (default 3)
  --concurrency <n>     Pages audited in parallel               (default 3)
  --out <dir>           Output directory                        (default a11y-report)
  --standard <aa|all>   'all' adds axe best-practice rules      (default aa)
  --include <regex>     Only crawl URLs matching this pattern
  --exclude <regex>     Skip URLs matching this pattern
  --include-subdomains  Follow links to subdomains
  --no-sitemap          Skip sitemap.xml discovery
  --no-robots           Ignore robots.txt (only on sites you own)
  --fail-on <level>     critical | serious | moderate | any | never   (default never)
  --json                Print the summary as JSON to stdout
  --quiet               Suppress progress output
```

```bash
# a large site, faster
aoda-scan https://example.ca --max-pages 200 --concurrency 5

# skip the blog, fail the build on anything serious
aoda-scan https://example.ca --exclude '/blog/' --fail-on serious

# just the data
aoda-scan https://example.ca --json > summary.json
```

### Config file

Drop `.aodascanrc.json` in the directory you run from and every flag becomes optional, including
the URL:

```bash
aoda-scan          # reads site, maxPages, failOn… from the config file
```

```json
{
  "site": "https://example.ca",
  "maxPages": 150,
  "concurrency": 4,
  "exclude": "/(blog|archive)/",
  "failOn": "critical",
  "out": "reports/a11y"
}
```

---

## In CI

The exit code is the integration point: `0` when the gate passes, `1` when it's breached, `2` when
the scan could not start (bad flag, bad URL, unreadable config). A scan that reaches **no pages**
always exits `1`, at every `--fail-on` level including `never` — a green build must never mean
"we could not test anything". Copy [`.github/workflows/accessibility.yml`](.github/workflows/accessibility.yml)
into your own repo, set `SITE_URL`, and every push is checked — with a summary table posted to the
job page and the full report uploaded as an artifact.

```yaml
- run: npm install -g aoda-scan
- run: npx playwright install --with-deps chromium
- run: aoda-scan "$SITE_URL" --fail-on critical
```

Catching a violation in a pull request costs minutes. Catching it in an audit costs a remediation project.

---

## As a library

```js
const { scan } = require('aoda-scan');

const { summary, exitCode } = await scan('https://example.ca', {
  maxPages: 100,
  failOn: 'critical',
  out: './report',
});

console.log(summary.totals.grade);              // 'C'
console.log(summary.totals.conformance);        // 0.64
console.log(summary.topRules[0].help);          // 'Images must have alternative text'
console.log(summary.topRules[0].pageCount);     // 19
```

---

## How the crawler behaves

- **Same-origin only.** Subdomains need `--include-subdomains`; external links are never followed.
- **Sitemap first.** `/sitemap.xml` is read when present, including nested sitemap indexes, then
  breadth-first link discovery fills the rest.
- **robots.txt is respected** by default, with longest-match `Disallow`/`Allow` resolution.
- **URLs are normalised** — fragments dropped, known tracking parameters stripped (`utm_*`,
  `fbclid`, `gclid`, `ref`…), query parameters sorted, trailing slashes collapsed — so
  `?utm_source=x` and `?b=2&a=1` don't create phantom pages. Parameters that merely *start* with a
  tracking name, like `refinement`, are kept.
- **robots.txt follows RFC 9309** — the most specific matching group wins, `*` and `$` wildcards
  are honoured, longest path match applies, and `Allow` beats `Disallow` on a tie. The start URL is
  subject to the same rules as every other page.
- **Assets are skipped.** PDFs, images, scripts and stylesheets aren't pages.
- **Concurrency is bounded** so a scan doesn't behave like a load test against someone's server.

---

## How the grade is calculated

A page counts as clean when it has **zero Level A or AA violations**. Best-practice rules are
reported but never affect the grade — they aren't legal requirements.

| Grade | Meaning |
|---|---|
| **A** | ≥95% of pages clean, no critical failures |
| **B** | ≥80% clean, no critical failures |
| **C** | ≥50% clean |
| **D** | ≥25% clean |
| **F** | <25% clean, or critical failures across the majority of the site |
| **—** | `null` — the scan reached no pages, so there is no verdict |

Only **Level A and AA** failures affect the grade. Best-practice rules appear in the report and in
`impact`, but a site with nothing but best-practice findings still grades **A**.

`impact` counts **distinct failing rules**; `occurrences` counts rule-page pairs; `nodesByImpact`
counts affected elements. The report's tiles show distinct rules.

`summary.json` also carries a weighted `debt` score — critical ×10, serious ×5, moderate ×2,
minor ×1, per affected element — which is more useful than a grade for tracking progress between runs.

---

## What automated testing cannot do

**Roughly a third of WCAG success criteria can be checked automatically.** No tool can decide
whether alternative text is *meaningful*, whether focus order is logical, whether an error message
is announced usefully, or whether a flow works end to end with a screen reader.

A clean scan is a floor, not a certificate. Treat it as the cheap layer that catches regressions,
and keep a manual audit for the rest.

Automated tools also produce false positives — decorative images flagged for missing alt text,
contrast failures on hidden elements. **Read the report before you act on it or send it to anyone.**

---

## Development

```bash
git clone https://github.com/XenofonGk/aoda-scan.git
cd aoda-scan
npm install
npx playwright install chromium

npm test        # 38 unit + regression tests, no browser needed
npm run demo    # serves fixtures/ on a free port and scans it end to end
```

`fixtures/` contains known violations — a missing `alt`, a missing `lang`, low-contrast text,
unlabelled form inputs — used by the end-to-end job in CI to prove the scanner still detects them.

`test/regression.test.js` has one test per bug found in the August 2026 audit, each named after the
behaviour it prevents returning.

```
src/
  cli.js          argument parsing, config file, console output, exit codes
  index.js        orchestration — crawl, audit, aggregate, write
  crawler.js      sitemap seeding, BFS link discovery, robots.txt, URL normalisation
  auditor.js      axe-core per page, bounded concurrency
  aggregate.js    site-wide rollup, rule ranking, grading, CI gate
  report/html.js  dashboard and per-page HTML
  report/styles.js  the report's own stylesheet
scripts/
  demo.js         serves fixtures/ and scans it, for `npm run demo`
```

---

## Contributing

Issues and pull requests are welcome. Please add a test for behaviour changes — `npm test` runs
without a browser, so the loop is fast.

## Licence

MIT © Xenofon Gkioka
