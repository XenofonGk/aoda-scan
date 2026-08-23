'use strict';
const CSS = require('./styles');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Escape a URL for href. Only http(s) and mailto survive; anything else —
 * javascript:, data:, vbscript: — is neutralised. Report content comes from
 * crawled third-party pages, so this sink must defend itself.
 */
const SAFE_SCHEME = /^(https?:|mailto:)/i;
function href(u) {
  const s = String(u ?? '').trim();
  if (!SAFE_SCHEME.test(s)) return '#';
  return esc(s);
}

const pct = n => (typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');

const crypto = require('crypto');

/**
 * Filesystem-safe, collision-free page filename.
 * The readable part is truncated for humans; an 8-char hash of the full URL
 * guarantees two distinct URLs never share a file.
 */
function slug(url) {
  const full = String(url ?? '');
  let raw = full;
  try {
    const u = new URL(full);
    raw = u.pathname + u.search;
    try { raw = decodeURIComponent(raw); } catch { /* malformed %-escape: keep it encoded */ }
  } catch { /* not an absolute URL: slug the whole string */ }
  const readable = raw.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const hash = crypto.createHash('sha1').update(full).digest('hex').slice(0, 8);
  return `${(readable || 'page').slice(0, 60)}-${hash}`;
}

function shell({ title, body, theme }) {
  const t = theme === 'dark' || theme === 'light' ? theme : null;
  return `<!doctype html><html lang="en"${t ? ` data-theme="${t}"` : ''}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><nav class="skip"><a href="#main">Skip to main content</a></nav>
<div class="wrap">${body}</div></body></html>`;
}

const GRADE_TEXT = {
  A: 'Conformant on automated checks',
  B: 'Broadly conformant, isolated gaps',
  C: 'Partially conformant — remediation needed',
  D: 'Substantially non-conformant',
  F: 'Non-conformant — significant legal exposure',
};

function tiles(t) {
  return `<div class="tiles">
    <div class="tile critical"><div class="n">${t.impact.critical}</div><div class="l">Critical rules</div></div>
    <div class="tile serious"><div class="n">${t.impact.serious}</div><div class="l">Serious rules</div></div>
    <div class="tile moderate"><div class="n">${t.impact.moderate}</div><div class="l">Moderate rules</div></div>
    <div class="tile minor"><div class="n">${t.impact.minor}</div><div class="l">Minor rules</div></div>
    <div class="tile"><div class="n">${t.violationInstances}</div><div class="l">Elements affected</div></div>
    <div class="tile"><div class="n">${t.pagesScanned}</div><div class="l">Pages scanned</div></div>
  </div>`;
}

function ruleCard(r, { linkPages = true } = {}) {
  const shown = Array.isArray(r.pages) ? r.pages.slice(0, 6) : [];
  const crit = Array.isArray(r.criteria) ? r.criteria : [];
  return `<article class="rule ${r.impact}">
    <div class="rule-top">
      <div>
        <h3>${esc(r.help)}</h3>
        <div class="tags">
          <span class="badge b-${r.impact}">${r.impact}</span>
          ${crit.length ? `<span class="chip">WCAG ${crit.map(esc).join(', ')}</span>` : ''}
          ${r.isAA ? '<span class="chip">Level AA</span>' : '<span class="chip">Best practice</span>'}
          <span class="rule-id">${esc(r.id)}</span>
        </div>
      </div>
      ${r.pageCount !== undefined
      ? `<span class="spread">${r.pageCount} page${r.pageCount === 1 ? '' : 's'} · ${r.nodes} element${r.nodes === 1 ? '' : 's'}</span>`
      : `<span class="spread">${(r.nodes || []).length} element${(r.nodes || []).length === 1 ? '' : 's'}</span>`}
    </div>
    <p class="desc">${esc(r.description)}</p>
    ${r.example ? `<details><summary>Example of the failure</summary>
      <div class="node"><code class="sel">${esc([].concat(r.example.target || []).join(' '))}</code>
      <pre>${esc(r.example.html)}</pre>
      <p class="fix">${esc(r.example.summary)}</p></div>
      <p class="fix"><a href="${href(r.helpUrl)}">How to fix this →</a></p></details>` : ''}
    ${linkPages && shown.length ? `<details><summary>Where it occurs</summary>
      <ul class="pagelist">${shown.map(u =>
        `<li><a href="pages/${esc(slug(u))}.html">${esc(u)}</a></li>`).join('')}
      ${r.pageCount > 6 ? `<li>+ ${r.pageCount - 6} more page${r.pageCount - 6 === 1 ? '' : 's'}</li>` : ''}
      </ul></details>` : ''}
  </article>`;
}

/** ---------------- site overview ---------------- */
function renderOverview(summary, opts = {}) {
  const { totals: t, meta, topRules, worstPages, failures } = summary;
  const site = meta.site || '';
  const when = typeof meta.generatedAt === 'string' ? meta.generatedAt
    : meta.generatedAt instanceof Date ? meta.generatedAt.toISOString()
      : new Date(0).toISOString();
  const host = (() => { try { return new URL(site).host; } catch { return site; } })();

  const quickWins = topRules.filter(r => r.pageCount > 1).slice(0, 3);
  const cascade = quickWins.reduce((s, r) => s + r.nodes, 0);

  const body = `
<header>
  <p class="eyebrow">Site accessibility report · WCAG 2.1 AA · AODA</p>
  <h1>${esc(host)}</h1>
  <p class="sub">${t.pagesScanned} page${t.pagesScanned === 1 ? '' : 's'} crawled and tested against
    ${t.criteriaFailing.length ? `${t.criteriaFailing.length} failing success criteri${t.criteriaFailing.length === 1 ? 'on' : 'a'}` : 'the WCAG 2.1 A and AA rule sets'}.</p>
  <div class="meta">
    <span><b>Scanned</b> ${esc(when.slice(0, 10))}</span>
    <span><b>Standard</b> WCAG 2.1 Level AA</span>
    <span><b>Engine</b> axe-core</span>
    ${t.pagesFailed ? `<span><b>Unreachable</b> ${t.pagesFailed} page${t.pagesFailed === 1 ? '' : 's'}</span>` : ''}
  </div>
</header>

<main id="main">
<section>
  <h2>Where you stand</h2>
  ${!t.scanUsable ? `<div class="verdict">
    <div class="grade g-none">?<small>No data</small></div>
    <div>
      <h3>The scan could not reach any pages</h3>
      <p class="note">No page was successfully loaded, so this report says nothing about the site's
      accessibility — it is not a passing or a failing result. Check the start URL, the network, and
      whether robots.txt permits crawling, then run the scan again.</p>
    </div>
  </div>` : `<div class="verdict">
    <div class="grade g-${t.grade}">${t.grade}<small>Grade</small></div>
    <div>
      <h3>${GRADE_TEXT[t.grade] || 'Result'}</h3>
      <p class="note"><strong>${t.pagesClean} of ${t.pagesScanned} pages</strong>
        (${pct(t.conformance)}) pass every automated WCAG 2.1 AA check.
        ${t.aaImpact.critical > 0
          ? `${t.aaImpact.critical} critical Level AA rule${t.aaImpact.critical === 1 ? '' : 's'} ${t.aaImpact.critical === 1 ? 'is' : 'are'} failing — these block assistive-technology users outright.`
          : 'No critical Level AA failures were detected.'}</p>
      <div class="bar"><span style="width:${pct(t.conformance)}"></span></div>
    </div>
  </div>`}
  ${tiles(t)}
</section>

<section>
  <h2>Ontario legal position</h2>
  <div class="card">
    <p class="note">Under the <strong>Accessibility for Ontarians with Disabilities Act</strong>, organisations
    with 50 or more employees have been required to meet WCAG 2.0 Level AA on public-facing websites since
    <strong>1 January 2021</strong>. Organisations with 20 or more employees file accessibility compliance
    reports with the province. Penalties reach <strong>$100,000 per day</strong> for corporations.</p>
    <p class="note">${!t.scanUsable
      ? 'This scan reached no pages, so it establishes nothing about the site\'s legal position.'
      : t.impact.critical + t.impact.serious > 0
        ? `This scan found <strong>${t.impact.critical + t.impact.serious} distinct critical or serious rules failing</strong>
           across ${t.violationInstances} elements. Those are the findings a complaint or audit would surface first.`
        : 'No critical or serious failures were detected by automated testing.'}</p>
  </div>
</section>

${quickWins.length ? `<section>
  <h2>Fix these first</h2>
  <p class="note">These rules fail on more than one page, so a single fix — usually in a shared template or
  component — clears <strong>${cascade} elements</strong> at once. This is the cheapest available progress.</p>
  ${quickWins.map(r => ruleCard(r)).join('')}
</section>` : ''}

${topRules.length ? `<section>
  <h2>Every failing rule — ${topRules.length} total, ranked by site-wide cost</h2>
  ${topRules.slice(0, 25).map(r => ruleCard(r)).join('')}
  ${topRules.length > 25 ? `<p class="note">+ ${topRules.length - 25} further rules in <code>summary.json</code>.</p>` : ''}
</section>` : `<section><h2>Findings</h2>
  <div class="card"><p class="note">No automated WCAG 2.1 AA failures were detected across the pages scanned.</p></div></section>`}

<section>
  <h2>Pages ranked worst first</h2>
  <div class="scroll"><table>
    <thead><tr><th scope="col">Page</th><th scope="col" class="num">Critical</th>
      <th scope="col" class="num">Serious</th><th scope="col" class="num">Moderate</th>
      <th scope="col" class="num">Minor</th><th scope="col" class="num">Elements</th></tr></thead>
    <tbody>${worstPages.map(p => `<tr>
      <td class="url"><span class="dot d-${p.counts.critical ? 'critical' : p.counts.serious ? 'serious' : p.counts.moderate ? 'moderate' : p.nodes ? 'minor' : 'ok'}"></span>
        <a href="pages/${esc(slug(p.url))}.html">${esc(p.title || p.url)}</a><br>
        <span class="rule-id">${esc(p.url)}</span></td>
      <td class="num">${p.counts.critical || '—'}</td><td class="num">${p.counts.serious || '—'}</td>
      <td class="num">${p.counts.moderate || '—'}</td><td class="num">${p.counts.minor || '—'}</td>
      <td class="num">${p.nodes || '—'}</td></tr>`).join('')}
    </tbody></table></div>
</section>

${failures.length ? `<section><h2>Pages that could not be scanned</h2>
  <div class="card"><ul class="pagelist">${failures.map(f =>
    `<li>${esc(f.url)} — ${esc(f.error)}</li>`).join('')}</ul></div></section>` : ''}

<section>
  <h2>What this scan does and does not cover</h2>
  <div class="card">
    <p class="note">Automated testing reliably detects roughly <strong>a third of WCAG success criteria</strong>.
    It cannot judge whether alternative text is <em>meaningful</em>, whether focus order is logical, whether a
    form error is announced usefully, or whether a page works end to end with a screen reader. A clean automated
    result is a floor, not a certificate.</p>
    <p class="note">Recommended next steps: remediate critical and serious findings, commission a manual audit
    covering keyboard and screen-reader flows, then run this scan in CI so new violations never reach production.</p>
  </div>
</section>
</main>

<footer>
  <p>Generated by <b>aoda-scan</b> · axe-core · ${esc(when)}</p>
  <p>Automated testing only. This report does not constitute legal advice or a certification of compliance.</p>
</footer>`;

  return shell({ title: `Accessibility report — ${host}`, body, theme: opts.theme });
}

/** ---------------- per-page detail ---------------- */
function renderPage(page, opts = {}) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let nodes = 0;
  const viols = Array.isArray(page.violations) ? page.violations : [];
  viols.forEach(v => { if (counts[v.impact] === undefined) counts[v.impact] = 0; counts[v.impact]++; nodes += (v.nodes || []).length; });
  const order = ['critical', 'serious', 'moderate', 'minor'];
  const sorted = [...viols].sort((a, b) => order.indexOf(a.impact) - order.indexOf(b.impact));

  const body = `
<header>
  <p class="eyebrow">Page report</p>
  <h1>${esc(page.title)}</h1>
  <p class="sub"><a href="${href(page.url)}">${esc(page.url)}</a></p>
  <div class="meta">
    <span><b>Rules failing</b> ${viols.length}</span>
    <span><b>Elements</b> ${nodes}</span>
    <span><b>Checks passed</b> ${page.passCount ?? 0}</span>
    ${page.incompleteCount ? `<span><b>Needs review</b> ${page.incompleteCount}</span>` : ''}
  </div>
</header>
<p class="crumb"><a href="../index.html">← Back to site overview</a></p>
<main id="main">
<section>
  <h2>Summary</h2>
  <div class="tiles">
    <div class="tile critical"><div class="n">${counts.critical}</div><div class="l">Critical</div></div>
    <div class="tile serious"><div class="n">${counts.serious}</div><div class="l">Serious</div></div>
    <div class="tile moderate"><div class="n">${counts.moderate}</div><div class="l">Moderate</div></div>
    <div class="tile minor"><div class="n">${counts.minor}</div><div class="l">Minor</div></div>
  </div>
</section>
${sorted.length ? `<section><h2>Findings</h2>${sorted.map(v => ruleCard({
    ...v, example: v.nodes[0], pageCount: undefined,
  }, { linkPages: false })).join('')}</section>`
    : `<section><h2>Findings</h2><div class="card"><p class="note">This page passed every automated WCAG 2.1 AA check.</p></div></section>`}
</main>
<footer><p>Generated by <b>aoda-scan</b> · axe-core</p></footer>`;

  return shell({ title: `Accessibility — ${page.title}`, body, theme: opts.theme });
}

module.exports = { renderOverview, renderPage, slug };
