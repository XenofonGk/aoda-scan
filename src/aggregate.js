'use strict';
const { IMPACTS } = require('./auditor');

const WEIGHT = { critical: 10, serious: 5, moderate: 2, minor: 1 };

/**
 * Roll per-page results up into a site-wide picture.
 * The headline question this answers: "where do we stand, and what do we fix first?"
 */
function aggregate(pages, meta = {}) {
  const scanned = pages.filter(p => !p.error);
  const failed = pages.filter(p => p.error);

  const occurrences = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const nodesByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const rules = new Map();      // ruleId -> { ...rule, pages:Set, nodes:number }
  const criteriaHit = new Set();

  for (const p of scanned) {
    for (const v of p.violations) {
      occurrences[v.impact]++;
      nodesByImpact[v.impact] += v.nodes.length;
      v.criteria.forEach(c => criteriaHit.add(c));

      let r = rules.get(v.id);
      if (!r) {
        r = { id: v.id, help: v.help, description: v.description, helpUrl: v.helpUrl,
              impact: v.impact, criteria: [...v.criteria], isAA: v.isAA,
              pages: new Set(), nodes: 0,
              example: v.nodes[0] ? { ...v.nodes[0], target: [...v.nodes[0].target] } : null };
        rules.set(v.id, r);
      }
      r.pages.add(p.url);
      r.nodes += v.nodes.length;
    }
  }

  // Pages with zero AA-level violations are the conformance numerator.
  const cleanPages = scanned.filter(p => !p.violations.some(v => v.isAA));
  const conformance = scanned.length ? cleanPages.length / scanned.length : null;

  // Distinct failing rules by impact — what the report's tiles mean.
  const impact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const aaImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const r of rules.values()) {
    impact[r.impact]++;
    if (r.isAA) aaImpact[r.impact]++;
  }

  const totalNodes = Object.values(nodesByImpact).reduce((a, b) => a + b, 0);
  const debt = IMPACTS.reduce((sum, i) => sum + nodesByImpact[i] * WEIGHT[i], 0);
  const debtPerPage = scanned.length ? debt / scanned.length : 0;

  // Grade: conformance first, then let unresolved AA criticals pull it down.
  // Best-practice rules are reported but never affect the grade.
  let grade;
  if (!scanned.length) grade = null;                       // nothing tested — not a failing site
  else if (aaImpact.critical > 0 && conformance < 0.5) grade = 'F';
  else if (conformance >= 0.95 && aaImpact.critical === 0) grade = 'A';
  else if (conformance >= 0.8 && aaImpact.critical === 0) grade = 'B';
  else if (conformance >= 0.5) grade = 'C';
  else if (conformance >= 0.25) grade = 'D';
  else grade = 'F';

  const topRules = [...rules.values()]
    .map(r => ({ ...r, pages: [...r.pages], pageCount: r.pages.size }))
    .sort((a, b) =>
      (WEIGHT[b.impact] * b.pageCount) - (WEIGHT[a.impact] * a.pageCount) ||
      b.nodes - a.nodes);

  const worstPages = scanned
    .map(p => {
      const c = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      let n = 0;
      p.violations.forEach(v => { c[v.impact]++; n += v.nodes.length; });
      return {
        url: p.url, title: p.title, counts: c, nodes: n,
        score: IMPACTS.reduce((s, i) => s + c[i] * WEIGHT[i], 0),
        ruleCount: p.violations.length,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    meta: { ...meta, generatedAt: meta.generatedAt || new Date().toISOString() },
    totals: {
      pagesScanned: scanned.length,
      pagesFailed: failed.length,
      pagesClean: cleanPages.length,
      conformance,
      grade,
      ruleCount: rules.size,
      violationInstances: totalNodes,
      impact,
      aaImpact,
      occurrences,
      nodesByImpact,
      debt,
      debtPerPage,
      scanUsable: scanned.length > 0,
      criteriaFailing: [...criteriaHit].sort((a, b) => {
        const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
        return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
      }),
    },
    topRules,
    worstPages,
    failures: failed.map(p => ({ url: p.url, error: p.error })),
  };
}

const GATE_LEVELS = Object.freeze({
  __proto__: null,
  never: [],
  critical: ['critical'],
  serious: ['critical', 'serious'],
  moderate: ['critical', 'serious', 'moderate'],
  any: IMPACTS,
});

function isGateLevel(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(GATE_LEVELS, v);
}

/**
 * Non-zero exit when the site breaches the configured gate. Used in CI.
 * A scan that reached no pages always breaches: a green build must never mean
 * "we could not test anything".
 * @throws if failOn is not one of the known levels — a typo must not silently
 *         weaken the gate.
 */
function gate(summary, failOn = 'never') {
  if (!isGateLevel(failOn)) {
    throw new Error(
      `Unknown --fail-on value "${failOn}". Expected one of: ${Object.keys(GATE_LEVELS).join(', ')}`);
  }
  if (!summary.totals.scanUsable) return 1;
  if (failOn === 'never') return 0;
  const i = summary.totals.impact;
  return GATE_LEVELS[failOn].some(k => i[k] > 0) ? 1 : 0;
}

module.exports = { aggregate, gate, WEIGHT, GATE_LEVELS, isGateLevel };
