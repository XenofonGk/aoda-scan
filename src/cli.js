#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { scan } = require('./index');
const { GATE_LEVELS, isGateLevel } = require('./aggregate');

const HELP = `
aoda-scan — crawl a whole site and report where it stands against WCAG 2.1 AA

USAGE
  aoda-scan <url> [options]

OPTIONS
  --max-pages <n>       Pages to crawl                          (default 50)
  --max-depth <n>       Link depth from the start URL           (default 3)
  --concurrency <n>     Pages audited in parallel               (default 3)
  --out <dir>           Output directory                        (default a11y-report)
  --standard <aa|all>   'all' adds axe best-practice rules      (default aa)
  --include <regex>     Only crawl URLs matching this pattern
  --exclude <regex>     Skip URLs matching this pattern
  --include-subdomains  Follow links to subdomains
  --no-sitemap          Skip sitemap.xml discovery
  --no-robots           Ignore robots.txt  (use only on sites you own)
  --fail-on <level>     critical | serious | moderate | any | never   (default never)
  --json                Print the summary as JSON to stdout
  --quiet               Suppress progress output
  --help                Show this message

EXAMPLES
  aoda-scan https://example.ca
  aoda-scan https://example.ca --max-pages 200 --concurrency 5
  aoda-scan https://example.ca --exclude '/blog/' --fail-on serious
  aoda-scan https://example.ca --out ./reports/october --json > summary.json

EXIT CODES
  0  scan completed and the --fail-on gate passed
  1  the gate was breached (use this to fail a CI build)
  2  the scan could not run
`;

const BOOL_FLAGS = {
  'include-subdomains': 'includeSubdomains', 'no-sitemap': 'noSitemap',
  'no-robots': 'noRobots', json: 'json', quiet: 'quiet', help: 'help',
};
const VALUE_FLAGS = new Set([
  'max-pages', 'max-depth', 'concurrency', 'out', 'standard', 'include', 'exclude', 'fail-on',
]);

class UsageError extends Error {}

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const key = a.slice(2);

    if (BOOL_FLAGS[key]) { o[BOOL_FLAGS[key]] = true; continue; }
    if (!VALUE_FLAGS.has(key)) throw new UsageError(`Unknown option --${key}`);

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new UsageError(`--${key} needs a value`);
    }
    o[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    i; // value consumed
  }
  return o;
}

/** Strict positive-integer option. Rejects NaN rather than silently scanning nothing. */
function posInt(name, v, d) {
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new UsageError(`--${name} must be a positive whole number, got "${v}"`);
  }
  return n;
}

function regex(name, v) {
  if (!v) return null;
  try { return new RegExp(v); }
  catch (e) { throw new UsageError(`--${name} is not a valid regular expression: ${e.message}`); }
}

function loadConfig(cwd) {
  for (const f of ['.aodascanrc.json', 'aoda-scan.config.json']) {
    const p = path.join(cwd, f);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
      catch (e) { console.error(`Ignoring ${f}: ${e.message}`); }
    }
  }
  return {};
}

(async () => {
  let a, opts, site;
  const cfg = loadConfig(process.cwd());

  try {
    a = parse(process.argv.slice(2));

    if (a.help) { console.log(HELP); process.exit(0); }

    site = a._[0] || process.env.AODA_SCAN_URL || cfg.site;
    if (!site) { console.log(HELP); process.exit(2); }

    let parsed;
    try { parsed = new URL(site); }
    catch { throw new UsageError(`Not a valid URL: ${site}`); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new UsageError(`Only http and https URLs can be scanned, got "${parsed.protocol}"`);
    }

    const standard = a.standard || cfg.standard || 'aa';
    if (standard !== 'aa' && standard !== 'all') {
      throw new UsageError(`--standard must be "aa" or "all", got "${standard}"`);
    }

    const failOn = a.failOn || cfg.failOn || 'never';
    if (!isGateLevel(failOn)) {
      throw new UsageError(
        `--fail-on must be one of: ${Object.keys(GATE_LEVELS).join(', ')} (got "${failOn}")`);
    }

    opts = {
      maxPages: posInt('max-pages', a.maxPages ?? cfg.maxPages, 50),
      maxDepth: posInt('max-depth', a.maxDepth ?? cfg.maxDepth, 3),
      concurrency: posInt('concurrency', a.concurrency ?? cfg.concurrency, 3),
      out: a.out || cfg.out || 'a11y-report',
      standard,
      include: regex('include', a.include || cfg.include),
      exclude: regex('exclude', a.exclude || cfg.exclude),
      includeSubdomains: a.includeSubdomains ?? cfg.includeSubdomains ?? false,
      useSitemap: a.noSitemap ? false : (cfg.useSitemap ?? true),
      respectRobots: a.noRobots ? false : (cfg.respectRobots ?? true),
      failOn,
      generatedAt: process.env.AODA_SCAN_DATE || undefined,
      log: a.quiet || a.json ? () => {} : (m) => console.error(m),
    };
  } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\nRun aoda-scan --help for usage.`); process.exit(2); }
    throw e;
  }

  try {
    const { summary, exitCode } = await scan(site, opts);
    const t = summary.totals;

    if (a.json) {
      process.stdout.write(JSON.stringify(summary, null, 2));
    } else {
      console.error('');
      if (!t.scanUsable) {
        console.error('  No pages could be scanned.');
        if (t.pagesFailed) console.error(`  ${t.pagesFailed} page${t.pagesFailed === 1 ? '' : 's'} failed to load:`);
        summary.failures.slice(0, 5).forEach(f => console.error(`    ${f.url} — ${f.error}`));
        console.error('');
        console.error('  Check the URL, the network, and whether robots.txt permits crawling.');
        console.error('');
        process.exit(exitCode);
      }
      const pc = Math.round(t.conformance * 100);
      console.error(`  Grade ${t.grade}   ${t.pagesClean}/${t.pagesScanned} pages clean (${pc}%)`);
      console.error(`  ${t.impact.critical} critical · ${t.impact.serious} serious · ` +
                    `${t.impact.moderate} moderate · ${t.impact.minor} minor  (distinct rules)`);
      console.error(`  ${t.violationInstances} elements affected across ${t.ruleCount} rules`);
      if (t.pagesFailed) console.error(`  ${t.pagesFailed} page${t.pagesFailed === 1 ? '' : 's'} could not be loaded`);
      if (summary.topRules.length) {
        console.error('');
        console.error('  Fix first:');
        summary.topRules.slice(0, 3).forEach(r =>
          console.error(`    ${r.impact.padEnd(8)} ${r.help} (${r.pageCount} page${r.pageCount === 1 ? '' : 's'})`));
      }
      console.error('');
      console.error(`  Report: ${path.resolve(opts.out, 'index.html')}`);
      console.error('');
    }
    process.exit(exitCode);
  } catch (e) {
    console.error(e.userFacing ? `\n${e.message}` : `\nScan failed: ${e.message}`);
    if (/Executable doesn't exist|browserType.launch/.test(e.message)) {
      console.error('Install the browser with:  npx playwright install chromium');
    }
    process.exit(2);
  }
})();
