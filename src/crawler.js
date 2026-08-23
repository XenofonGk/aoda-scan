'use strict';
/**
 * Same-origin crawler.
 * Seeds from sitemap.xml when present, then breadth-first through in-page links.
 * Implements robots.txt per RFC 9309: the most specific matching group wins,
 * longest path match wins within it, and Allow beats Disallow on equal length.
 */

const UA = 'aoda-scan';

/** Params that are purely tracking. Matched exactly, or as a prefix only for utm_. */
const TRACKING = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid',
  'ref', 'ref_src', 'referrer', 'igshid', 'vero_id', '_ga', '_gl', 'yclid',
]);

function isTracking(name) {
  const n = name.toLowerCase();
  return n.startsWith('utm_') || TRACKING.has(n);
}

function normalise(raw, base) {
  let u;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const p of [...u.searchParams.keys()]) if (isTracking(p)) u.searchParams.delete(p);
  u.searchParams.sort();                 // order-independent dedup
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

const ASSET = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|zip|gz|tar|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|csv|rss|xml)$/i;

/** Registrable base for the scan: the start host minus a leading "www.". */
function baseHost(origin) {
  try { return new URL(origin).hostname.replace(/^www\./i, ''); } catch { return null; }
}

function sameSite(url, origin, includeSubdomains) {
  let a, b;
  try { a = new URL(url); b = new URL(origin); } catch { return false; }
  if (!includeSubdomains) return a.host === b.host;
  const base = baseHost(origin);
  if (!base) return false;
  return a.hostname === base || a.hostname.endsWith('.' + base);
}

/**
 * Match a robots path pattern (with * and $) against a path.
 *
 * Deliberately NOT a RegExp: translating `/*a*a*a…` into `.*a.*a.*a…` gives
 * catastrophic backtracking, so a hostile or merely odd robots.txt could hang
 * the crawler. This is the standard linear-time greedy wildcard match with a
 * single backtrack point — O(pattern x path) worst case, no exponential blowup.
 */
function wildcardMatch(pattern, path) {
  let pat = pattern;
  let anchorEnd = false;
  if (pat.endsWith('$')) { anchorEnd = true; pat = pat.slice(0, -1); }

  let p = 0, s = 0, starP = -1, starS = 0;

  // Backtrack to the last '*' and let it swallow one more character.
  const backtrack = () => {
    if (starP === -1 || starS >= path.length) return false;
    p = starP + 1;
    s = ++starS;
    return true;
  };

  for (;;) {
    if (p === pat.length) {
      // Robots patterns are PREFIX matches unless explicitly anchored with '$'.
      if (!anchorEnd || s === path.length) return true;
      if (!backtrack()) return false;
      continue;
    }
    if (pat[p] === '*') { starP = p++; starS = s; continue; }
    if (s < path.length && pat[p] === path[s]) { p++; s++; continue; }
    if (!backtrack()) return false;
  }
}

/** Effective length for specificity, ignoring wildcard metacharacters. */
const specificity = p => p.replace(/[*$]/g, '').length;

function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, '').trim();
    if (!l) continue;
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();

    if (field === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'disallow' || field === 'allow')) {
      // `Disallow:` with an empty value means "allow everything" — keep it as an Allow of "/".
      if (field === 'disallow' && value === '') current.rules.push({ allow: true, path: '/' });
      else if (value) current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  // RFC 9309: the single most specific matching group applies. Our own name beats "*".
  const own = groups.filter(g => g.agents.includes(UA));
  const star = groups.filter(g => g.agents.includes('*'));
  const chosen = own.length ? own : star;
  const rules = chosen.flatMap(g => g.rules)
    .map(r => ({ ...r, len: specificity(r.path) }));

  return {
    allowed(pathname) {
      let best = null;
      for (const r of rules) {
        if (!wildcardMatch(r.path, pathname)) continue;
        if (!best || r.len > best.len || (r.len === best.len && r.allow && !best.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

/** Minimal XML entity decoding for sitemap <loc> values. */
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');           // last, so &amp;lt; survives correctly
}

async function fetchText(page, url) {
  try {
    const res = await page.request.get(url, { timeout: 15000 });
    if (!res.ok()) return null;
    return await res.text();
  } catch { return null; }
}

async function seedFromSitemap(page, origin, opts, log) {
  const { includeSubdomains = false, maxUrls = 5000 } = opts;
  const found = new Set();
  const queue = [new URL('/sitemap.xml', origin).toString()];
  const seen = new Set();

  while (queue.length && found.size < maxUrls) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    // never follow a sitemap index off-site
    if (!sameSite(sm, origin, includeSubdomains)) continue;

    const xml = await fetchText(page, sm);
    if (!xml) continue;

    const isIndex = /<sitemapindex/i.test(xml);
    for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      if (found.size >= maxUrls) break;
      const u = normalise(decodeEntities(m[1]), origin);
      if (!u) continue;
      if (isIndex) queue.push(u); else found.add(u);
    }
  }
  if (found.size) log(`sitemap: ${found.size} URL${found.size === 1 ? '' : 's'} listed`);
  return [...found];
}

/** Coerce an option to a positive integer, falling back to `d` on anything invalid. */
function posInt(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
}

/**
 * @returns {Promise<string[]>} ordered list of page URLs to audit
 */
async function crawl(browser, startUrl, opts = {}) {
  const maxPages = Math.max(1, posInt(opts.maxPages, 50));
  const maxDepth = posInt(opts.maxDepth, 3);
  const {
    includeSubdomains = false, useSitemap = true, respectRobots = true,
    include = null, exclude = null, log = () => {},
  } = opts;

  const start = normalise(startUrl, startUrl);
  if (!start) throw new Error(`Not an http(s) URL: ${startUrl}`);
  const origin = new URL(start).origin;

  const ctx = await browser.newContext({ userAgent: `Mozilla/5.0 (compatible; ${UA}/1.0)` });
  const page = await ctx.newPage();

  try {
    let robots = { allowed: () => true };
    if (respectRobots) {
      const txt = await fetchText(page, new URL('/robots.txt', origin).toString());
      if (txt) { robots = parseRobots(txt); log('robots.txt: loaded'); }
    }

    const permitted = (u) => {
      let path;
      try { path = new URL(u).pathname; } catch { return false; }
      if (!sameSite(u, origin, includeSubdomains)) return false;
      if (ASSET.test(path)) return false;
      if (!robots.allowed(path)) return false;
      if (include && !include.test(u)) return false;
      if (exclude && exclude.test(u)) return false;
      return true;
    };

    // The start URL is subject to the same rules as everything else.
    if (!robots.allowed(new URL(start).pathname)) {
      throw new Error(`robots.txt disallows ${start} — rerun with --no-robots if you own this site`);
    }
    if (exclude && exclude.test(start)) throw new Error(`--exclude matches the start URL ${start}`);

    const seen = new Set([start]);
    const out = [start];
    const queue = [{ url: start, depth: 0 }];

    if (useSitemap) {
      const listed = await seedFromSitemap(page, origin, { includeSubdomains }, log);
      let queued = 0;
      for (const u of listed) {
        if (out.length >= maxPages) break;
        if (seen.has(u) || !permitted(u)) continue;
        seen.add(u); out.push(u); queue.push({ url: u, depth: 0 }); queued++;
      }
      if (listed.length) log(`sitemap: ${queued} queued after filtering`);
    }

    while (queue.length && out.length < maxPages) {
      const { url, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      let hrefs = [];
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
      } catch { continue; }

      for (const h of hrefs) {
        if (out.length >= maxPages) break;
        const u = normalise(h, url);
        if (!u || seen.has(u) || !permitted(u)) continue;
        seen.add(u); out.push(u); queue.push({ url: u, depth: depth + 1 });
      }
      log(`crawl: ${out.length} page${out.length === 1 ? '' : 's'} found (depth ${depth})`);
    }

    return out.slice(0, maxPages);
  } finally {
    await ctx.close();
  }
}

module.exports = { crawl, parseRobots, normalise, sameSite, decodeEntities, posInt, wildcardMatch };
