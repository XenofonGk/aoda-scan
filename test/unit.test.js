'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseRobots, normalise, sameSite } = require('../src/crawler');
const { aggregate, gate } = require('../src/aggregate');
const { criteria, isAA } = require('../src/auditor');

test('normalise strips hashes, tracking params and trailing slashes', () => {
  assert.equal(normalise('/about/#team', 'https://x.ca'), 'https://x.ca/about');
  assert.equal(normalise('/a?utm_source=nl&id=7', 'https://x.ca'), 'https://x.ca/a?id=7');
  assert.equal(normalise('mailto:a@b.c', 'https://x.ca'), null);
  assert.equal(normalise('https://x.ca/', 'https://x.ca'), 'https://x.ca/');
});

test('sameSite honours the subdomain switch', () => {
  assert.ok(sameSite('https://x.ca/a', 'https://x.ca', false));
  assert.ok(!sameSite('https://blog.x.ca/a', 'https://x.ca', false));
  assert.ok(sameSite('https://blog.x.ca/a', 'https://x.ca', true));
  assert.ok(!sameSite('https://evil.com', 'https://x.ca', true));
});

test('robots parser applies longest-match and Allow overrides', () => {
  const r = parseRobots(`User-agent: *\nDisallow: /admin/\nAllow: /admin/public/\n`);
  assert.ok(!r.allowed('/admin/secret'));
  assert.ok(r.allowed('/admin/public/page'));
  assert.ok(r.allowed('/'));
});

test('robots parser ignores groups for other agents', () => {
  const r = parseRobots(`User-agent: BadBot\nDisallow: /\n`);
  assert.ok(r.allowed('/anything'));
});

test('criteria maps axe wcag tags to success-criterion numbers', () => {
  assert.deepEqual(criteria(['wcag2a', 'wcag111', 'cat.text']), ['1.1.1']);
  assert.deepEqual(criteria(['wcag143']), ['1.4.3']);
  assert.ok(isAA(['wcag21aa']));
  assert.ok(!isAA(['best-practice']));
});

const page = (url, viols) => ({
  url, title: url, error: null, passCount: 10, incompleteCount: 0, violations: viols,
});
const v = (id, impact, nodes = 1, aa = true) => ({
  id, impact, help: id, description: id, helpUrl: '#', criteria: ['1.1.1'], isAA: aa,
  nodes: Array.from({ length: nodes }, () => ({ target: ['x'], html: '<x>', summary: 's' })),
});

test('aggregate counts conformance from AA violations only', () => {
  const s = aggregate([
    page('https://x.ca/a', [v('image-alt', 'critical', 2)]),
    page('https://x.ca/b', []),
    page('https://x.ca/c', [v('region', 'moderate', 1, false)]),  // best-practice, not AA
  ], { site: 'https://x.ca' });

  assert.equal(s.totals.pagesScanned, 3);
  assert.equal(s.totals.pagesClean, 2, 'best-practice-only pages still count as AA-clean');
  assert.ok(Math.abs(s.totals.conformance - 2 / 3) < 1e-9);
  assert.equal(s.totals.violationInstances, 3);
});

test('aggregate ranks rules by site-wide spread, not raw count', () => {
  const s = aggregate([
    page('https://x.ca/a', [v('wide', 'serious', 1), v('deep', 'serious', 6)]),
    page('https://x.ca/b', [v('wide', 'serious', 1)]),
    page('https://x.ca/c', [v('wide', 'serious', 1)]),
  ], {});
  assert.equal(s.topRules[0].id, 'wide');
  assert.equal(s.topRules[0].pageCount, 3);
});

test('aggregate grades a clean site A and a broken one F', () => {
  const clean = aggregate([page('https://x.ca/a', []), page('https://x.ca/b', [])], {});
  assert.equal(clean.totals.grade, 'A');

  const broken = aggregate([
    page('https://x.ca/a', [v('image-alt', 'critical')]),
    page('https://x.ca/b', [v('image-alt', 'critical')]),
  ], {});
  assert.equal(broken.totals.grade, 'F');
});

test('aggregate separates unreachable pages from clean ones', () => {
  const s = aggregate([
    page('https://x.ca/a', []),
    { url: 'https://x.ca/gone', error: 'timeout', violations: [], passCount: 0, incompleteCount: 0 },
  ], {});
  assert.equal(s.totals.pagesScanned, 1);
  assert.equal(s.totals.pagesFailed, 1);
  assert.equal(s.failures[0].error, 'timeout');
});

test('gate returns a CI exit code at the configured threshold', () => {
  const s = aggregate([page('https://x.ca/a', [v('x', 'serious')])], {});
  assert.equal(gate(s, 'never'), 0);
  assert.equal(gate(s, 'critical'), 0, 'serious does not breach a critical-only gate');
  assert.equal(gate(s, 'serious'), 1);
  assert.equal(gate(s, 'any'), 1);
});
