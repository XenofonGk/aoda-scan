'use strict';
const AxeBuilder = require('@axe-core/playwright').default;

const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

/**
 * Which WCAG success criteria a rule maps to, e.g. ["1.1.1"], ["1.4.10"].
 * axe encodes them as wcagPSC where P and S are single digits and C may be two,
 * so the last component takes whatever digits remain.
 */
function criteria(tags) {
  return tags
    .filter(t => /^wcag\d{3,4}$/.test(t))
    .map(t => {
      const d = t.slice(4);
      return `${d[0]}.${d[1]}.${d.slice(2)}`;
    });
}

function isAA(tags) {
  return tags.some(t => AA_TAGS.includes(t));
}

async function auditPage(browser, url, opts = {}) {
  const { standard = 'aa', timeout = 45000, settle = 2000 } = opts;
  const tags = standard === 'all'
    ? [...AA_TAGS, 'best-practice']
    : AA_TAGS;

  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (compatible; aoda-scan/1.0)',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const started = Date.now();

  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(settle);
    const title = (await page.title()) || url;
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    await ctx.close();

    const violations = results.violations.map(v => ({
      id: v.id,
      impact: v.impact || 'minor',
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      criteria: criteria(v.tags),
      isAA: isAA(v.tags),
      nodes: v.nodes.map(n => ({
        target: n.target,
        html: (n.html || '').slice(0, 300),
        summary: (n.failureSummary || '').replace(/\n+/g, ' — '),
      })),
    }));

    return {
      url, title,
      status: res ? res.status() : null,
      ms: Date.now() - started,
      violations,
      passCount: results.passes.length,
      incompleteCount: results.incomplete.length,
      error: null,
    };
  } catch (e) {
    await ctx.close().catch(() => {});
    return { url, title: url, status: null, ms: Date.now() - started,
             violations: [], passCount: 0, incompleteCount: 0, error: e.message };
  }
}

/** Run pages through auditPage with bounded concurrency. */
async function auditAll(browser, urls, opts = {}) {
  const { onPage = () => {} } = opts;
  const raw = Number(opts.concurrency);
  const concurrency = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
  const out = new Array(urls.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= urls.length) return;
      out[i] = await auditPage(browser, urls[i], opts);
      onPage(out[i], ++done, urls.length);
    }
  }

  const workers = Math.max(1, Math.min(concurrency, urls.length));
  if (!urls.length) return [];
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

module.exports = { auditPage, auditAll, IMPACTS, criteria, isAA };
