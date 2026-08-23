'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { crawl } = require('./crawler');
const { auditAll } = require('./auditor');
const { aggregate, gate } = require('./aggregate');
const { renderOverview, renderPage, slug } = require('./report/html');

/** Preinstalled Chromium in sandboxed CI images; falls back to Playwright's own. */
function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

async function scan(site, options = {}) {
  const {
    maxPages = 50, maxDepth = 3, concurrency = 3, standard = 'aa',
    includeSubdomains = false, useSitemap = true, respectRobots = true,
    include = null, exclude = null, out = 'a11y-report', failOn = 'never',
    log = () => {}, generatedAt,
  } = options;

  const exe = resolveChrome();
  const browser = await chromium.launch(
    exe ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });

  try {
    log(`crawling ${site}`);
    const urls = await crawl(browser, site, {
      maxPages, maxDepth, includeSubdomains, useSitemap, respectRobots,
      include: include instanceof RegExp ? include : (include ? new RegExp(include) : null),
      exclude: exclude instanceof RegExp ? exclude : (exclude ? new RegExp(exclude) : null),
      log,
    });
    log(`found ${urls.length} page${urls.length === 1 ? '' : 's'}; auditing`);

    const pages = await auditAll(browser, urls, {
      standard, concurrency,
      onPage: (p, i, n) => {
        const c = p.violations.filter(v => v.impact === 'critical').length;
        const s = p.violations.filter(v => v.impact === 'serious').length;
        log(`  [${String(i).padStart(String(n).length)}/${n}] ${p.error ? 'ERROR' : `${c}C ${s}S`}  ${p.url}`);
      },
    });

    const summary = aggregate(pages, { site, standard, maxPages, generatedAt });

    // ---- write artefacts ----
    try {
      fs.mkdirSync(path.join(out, 'pages'), { recursive: true });
    } catch (e) {
      const err = new Error(`Cannot write the report to "${out}": ${e.code || e.message}. ` +
        'Choose a different --out directory.');
      err.userFacing = true;
      throw err;
    }
    fs.writeFileSync(path.join(out, 'index.html'), renderOverview(summary, options));
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify(pages, null, 2));
    for (const p of pages) {
      if (!p || p.error) continue;
      fs.writeFileSync(path.join(out, 'pages', `${slug(p.url)}.html`), renderPage(p, options));
    }

    return { summary, pages, exitCode: gate(summary, failOn) };
  } finally {
    await browser.close();
  }
}

module.exports = { scan, crawl, auditAll, aggregate, gate };
