'use strict';
// One test per bug found in the August 2026 audit. Each name states the old wrong behaviour.
const { test } = require('node:test');
const assert = require('node:assert');
const { parseRobots, normalise, sameSite, decodeEntities } = require('../src/crawler');
const { criteria } = require('../src/auditor');
const { aggregate, gate } = require('../src/aggregate');
const { renderOverview, renderPage, slug } = require('../src/report/html');

const pg = (url, violations = [], extra = {}) => ({
  url, title: url, error: null, passCount: 5, incompleteCount: 0, violations, ...extra,
});
const v = (id, impact, nodes = 1, isAA = true) => ({
  id, impact, help: id, description: id, helpUrl: 'https://dequeuniversity.com/x',
  criteria: ['1.1.1'], isAA,
  nodes: Array.from({ length: nodes }, () => ({ target: ['x'], html: '<x>', summary: 's' })),
});

/* ---------- auditor ---------- */

test('criteria() keeps two-digit success criteria intact (was 1.4.10 -> 1.4.1.0)', () => {
  assert.deepEqual(criteria(['wcag1410']), ['1.4.10']);
  assert.deepEqual(criteria(['wcag1412']), ['1.4.12']);
  assert.deepEqual(criteria(['wcag2410']), ['2.4.10']);
  assert.deepEqual(criteria(['wcag111']), ['1.1.1']);
  assert.deepEqual(criteria(['wcag21aa', 'best-practice']), []);
});

/* ---------- crawler ---------- */

test('sameSite() does not treat a public suffix as the registrable domain', () => {
  assert.ok(!sameSite('https://evil.co.uk/p', 'https://www.bbc.co.uk', true));
  assert.ok(!sameSite('https://someoneelse.github.io/p', 'https://me.github.io', true));
  assert.ok(!sameSite('https://evil.com/p', 'https://x.ca', true));
});

test('sameSite() reaches the apex from a www start URL (was silently dropped)', () => {
  assert.ok(sameSite('https://example.com/p', 'https://www.example.com', true));
  assert.ok(sameSite('https://shop.example.com/p', 'https://www.example.com', true));
  assert.ok(!sameSite('https://example.com/p', 'https://www.example.com', false));
});

test('normalise() keeps params that merely start with "ref" (was stripping refinement)', () => {
  assert.equal(normalise('/shop?refinement=blue', 'https://x.ca'), 'https://x.ca/shop?refinement=blue');
  assert.equal(normalise('/p?reference=99', 'https://x.ca'), 'https://x.ca/p?reference=99');
  assert.equal(normalise('/p?ref=nav&id=7', 'https://x.ca'), 'https://x.ca/p?id=7');
  assert.equal(normalise('/p?utm_source=x&id=7', 'https://x.ca'), 'https://x.ca/p?id=7');
});

test('normalise() sorts params so link order does not defeat dedup', () => {
  assert.equal(normalise('/s?b=2&a=1', 'https://x.ca'), normalise('/s?a=1&b=2', 'https://x.ca'));
});

test('robots: the most specific agent group wins regardless of file order', () => {
  const a = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: aoda-scan\nAllow: /\n');
  const b = parseRobots('User-agent: aoda-scan\nAllow: /\n\nUser-agent: *\nDisallow: /\n');
  assert.ok(a.allowed('/about'));
  assert.ok(b.allowed('/about'));
});

test('robots: an empty Disallow means allow-everything for that agent', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: aoda-scan\nDisallow:\n');
  assert.ok(r.allowed('/about'));
});

test('robots: Allow wins a same-length tie in both orders', () => {
  assert.ok(parseRobots('User-agent: *\nDisallow: /p\nAllow: /p\n').allowed('/p'));
  assert.ok(parseRobots('User-agent: *\nAllow: /p\nDisallow: /p\n').allowed('/p'));
});

test('robots: * and $ wildcards are honoured (were matched literally)', () => {
  const r = parseRobots('User-agent: *\nDisallow: /*/print\nDisallow: /admin/*/edit\nDisallow: /*.json$\n');
  assert.ok(!r.allowed('/docs/print'));
  assert.ok(!r.allowed('/admin/1/edit'));
  assert.ok(!r.allowed('/data/x.json'));
  assert.ok(r.allowed('/data/x.json.html'));
  assert.ok(!parseRobots('User-agent: *\nDisallow: /*\n').allowed('/anything'));
});

test('robots: other agents\' groups stay ignored', () => {
  assert.ok(parseRobots('User-agent: BadBot\nDisallow: /\n').allowed('/anything'));
});

test('decodeEntities() unescapes sitemap <loc> values', () => {
  assert.equal(decodeEntities('https://x.ca/p?id=1&amp;lang=en'), 'https://x.ca/p?id=1&lang=en');
  assert.equal(decodeEntities('a&amp;amp;b'), 'a&amp;b');
});

/* ---------- aggregate ---------- */

test('impact counts distinct rules, not one per page (was 3 for a single rule)', () => {
  const s = aggregate([
    pg('https://x.ca/a', [v('image-alt', 'critical')]),
    pg('https://x.ca/b', [v('image-alt', 'critical')]),
    pg('https://x.ca/c', [v('image-alt', 'critical')]),
  ], {});
  assert.equal(s.totals.impact.critical, 1);
  assert.equal(s.totals.occurrences.critical, 3);
  assert.equal(s.totals.ruleCount, 1);
});

test('best-practice violations never affect the grade (was C instead of A)', () => {
  const s = aggregate([
    pg('https://x.ca/a', [v('region', 'critical', 1, false)]),
    pg('https://x.ca/b', []),
  ], {});
  assert.equal(s.totals.conformance, 1);
  assert.equal(s.totals.grade, 'A');
});

test('a scan that reached nothing is "no data", not grade F', () => {
  const empty = aggregate([], {});
  assert.equal(empty.totals.grade, null);
  assert.equal(empty.totals.conformance, null);
  assert.equal(empty.totals.scanUsable, false);

  const allFailed = aggregate([{ url: 'https://x.ca', error: 'dns', violations: [] }], {});
  assert.equal(allFailed.totals.grade, null);
  assert.equal(allFailed.totals.pagesFailed, 1);
});

test('gate() fails a scan that reached no pages, at every level', () => {
  for (const level of ['never', 'critical', 'serious', 'moderate', 'any']) {
    assert.equal(gate(aggregate([], {}), level), 1, `level ${level}`);
  }
});

test('gate() throws on an unknown level instead of silently weakening', () => {
  const s = aggregate([pg('https://x.ca/a', [v('x', 'serious')])], {});
  assert.equal(gate(s, 'serious'), 1);
  for (const bad of ['Serious', 'serious ', 'high', 'toString', 'constructor', '', null, 7]) {
    assert.throws(() => gate(s, bad), /Unknown --fail-on/, `should reject ${String(bad)}`);
  }
});

test('summary does not alias the input pages', () => {
  const page = pg('https://x.ca/a', [v('image-alt', 'critical')]);
  const s = aggregate([page], {});
  s.topRules[0].criteria.push('9.9.9');
  s.topRules[0].example.target.push('mutated');
  assert.deepEqual(page.violations[0].criteria, ['1.1.1']);
  assert.deepEqual(page.violations[0].nodes[0].target, ['x']);
});

test('criteriaFailing sorts numerically, not lexicographically', () => {
  const mk = c => ({ ...v('r' + c, 'minor'), criteria: [c] });
  const s = aggregate([pg('https://x.ca/a', [mk('2.4.10'), mk('2.4.3'), mk('1.4.10'), mk('1.1.1')])], {});
  assert.deepEqual(s.totals.criteriaFailing, ['1.1.1', '1.4.10', '2.4.3', '2.4.10']);
});

/* ---------- report ---------- */

test('slug() never collides across distinct URLs', () => {
  const urls = [
    'https://x.ca/a/b', 'https://x.ca/a-b', 'https://x.ca/about?x=1', 'https://x.ca/about-x-1',
    'https://x.ca/', 'https://x.ca/!!!', 'https://x.ca/@@@',
    'https://x.ca/' + 'a'.repeat(90) + '/one', 'https://x.ca/' + 'a'.repeat(90) + '/two',
    'https://x.ca/caf%C3%A9', 'https://x.ca/%E4%B8%AD',
  ];
  const slugs = urls.map(slug);
  assert.equal(new Set(slugs).size, urls.length, 'every URL must map to a unique file');
  slugs.forEach(s => assert.match(s, /^[a-zA-Z0-9-]+$/, `unsafe filename: ${s}`));
});

test('slug() does not throw on relative or empty input', () => {
  for (const s of ['/relative', '', 'not a url', null, undefined]) {
    assert.match(slug(s), /^[a-zA-Z0-9-]+$/);
  }
});

test('href sink neutralises javascript: URLs', () => {
  const page = pg("javascript:alert(document.domain)", [], { title: 'Evil' });
  const html = renderPage(page);
  assert.ok(!/href="javascript:/i.test(html), 'javascript: must not survive into href');
  assert.ok(html.includes('href="#"'));
});

test('single quotes are escaped so future attribute contexts stay safe', () => {
  const page = pg('https://x.ca/a', [], { title: "x' onmouseover='alert(1)" });
  const html = renderPage(page);
  assert.ok(!html.includes("onmouseover='alert(1)"));
  assert.ok(html.includes('&#39;'));
});

test('theme is constrained to known values', () => {
  const s = aggregate([pg('https://x.ca/a', [])], { site: 'https://x.ca' });
  const tag = h => h.slice(0, h.indexOf('<head>'));   // the <html ...> tag only; CSS also mentions data-theme
  const bad = renderOverview(s, { theme: '"><script>alert(1)</script>' });
  assert.ok(!bad.includes('<script>alert(1)'));
  assert.ok(!tag(bad).includes('data-theme'), 'an unknown theme must be dropped');
  assert.ok(tag(renderOverview(s, { theme: 'dark' })).includes('data-theme="dark"'));
});

test('report renders without crashing on hostile or partial input', () => {
  const s = aggregate([], {});
  assert.ok(renderOverview(s, {}).length > 100);                       // zero pages
  assert.ok(renderOverview({ ...s, meta: { site: 'https://x.ca' } }).length > 100);  // no generatedAt
  assert.ok(renderOverview({ ...s, meta: { site: 'https://x.ca', generatedAt: new Date(0) } }).length > 100);

  assert.ok(renderPage(pg('https://x.ca/a', [{ ...v('x', 'critical'), nodes: [] }])).length > 100);
  assert.ok(renderPage({ url: 'https://x.ca/a' }).length > 100);       // no violations array
  assert.ok(renderPage(pg('https://x.ca/a', [{ ...v('x', 'critical'), criteria: undefined }])).length > 100);
  const strTarget = { ...v('x', 'critical') };
  strTarget.nodes[0].target = 'not-an-array';
  assert.ok(renderPage(pg('https://x.ca/a', [strTarget])).length > 100);
});

test('a no-data report says so instead of claiming legal exposure', () => {
  const html = renderOverview(aggregate([], { site: 'https://x.ca' }));
  assert.ok(html.includes('could not reach any pages'));
  assert.ok(!html.includes('significant legal exposure'));
  assert.ok(!html.includes('NaN'));
});

/* ---------- robustness (Aug 2026 stress pass) ---------- */

test('robots matching is linear — a pathological pattern cannot hang the crawler', () => {
  const { wildcardMatch } = require('../src/crawler');
  const path = '/' + 'a'.repeat(5000);
  for (const pat of ['/' + '*'.repeat(50) + 'x', '/' + '*a'.repeat(80), '/a' + '*b'.repeat(100) + '$']) {
    const t = Date.now();
    wildcardMatch(pat, path);
    assert.ok(Date.now() - t < 200, `pattern of length ${pat.length} took too long`);
  }
});

test('wildcardMatch implements robots prefix and $ semantics', () => {
  const { wildcardMatch } = require('../src/crawler');
  assert.ok(wildcardMatch('/admin', '/admin/secret'), 'bare pattern is a prefix match');
  assert.ok(!wildcardMatch('/admin', '/public'));
  assert.ok(wildcardMatch('/*/print', '/docs/print'));
  assert.ok(wildcardMatch('/*.json$', '/d/x.json'));
  assert.ok(!wildcardMatch('/*.json$', '/d/x.json.html'), '$ anchors the end');
  assert.ok(wildcardMatch('/', '/anything'));
  assert.ok(wildcardMatch('/*', '/anything'));
});

test('slug() survives malformed percent-escapes without throwing', () => {
  for (const u of ['https://x.ca/%E0%A4%A', 'https://x.ca/%', 'https://x.ca/%ZZ', 'https://x.ca/a%2']) {
    assert.match(slug(u), /^[a-zA-Z0-9-]+$/);
  }
  // still unique, and still derived from the path rather than the whole URL
  assert.notEqual(slug('https://x.ca/%'), slug('https://x.ca/%ZZ'));
});
