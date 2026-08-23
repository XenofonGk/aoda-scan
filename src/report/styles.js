'use strict';
// The report is itself held to WCAG 2.1 AA: contrast-checked palette, semantic markup,
// visible focus, and no meaning carried by colour alone.
module.exports = `
:root{
  --bg:#FAFAF8;--panel:#FFFFFF;--rule:#DFDDD6;--ink:#15181D;--text:#1F2229;
  --muted:#565C66;--faint:#5F6570;
  --crit:#96271A;--ser:#8A4A12;--mod:#6B5410;--min:#3E5560;--ok:#25604F;
  --crit-s:#FBE6E2;--ser-s:#FAEDE0;--mod-s:#F7F0D9;--min-s:#E8EFF2;--ok-s:#DCEAE4;
  --accent:#96271A;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0F1216;--panel:#171B21;--rule:#2A3038;--ink:#EDEDEB;--text:#E2E3E2;
  --muted:#A0A7B2;--faint:#98A0AB;
  --crit:#F0836A;--ser:#E0A05C;--mod:#D4BC63;--min:#8FB0BF;--ok:#6FC4A8;
  --crit-s:#331812;--ser-s:#2E2113;--mod-s:#2A2612;--min-s:#16232A;--ok-s:#0F2620;
  --accent:#F0836A;
}}
:root[data-theme="dark"]{
  --bg:#0F1216;--panel:#171B21;--rule:#2A3038;--ink:#EDEDEB;--text:#E2E3E2;
  --muted:#A0A7B2;--faint:#98A0AB;
  --crit:#F0836A;--ser:#E0A05C;--mod:#D4BC63;--min:#8FB0BF;--ok:#6FC4A8;
  --crit-s:#331812;--ser-s:#2E2113;--mod-s:#2A2612;--min-s:#16232A;--ok-s:#0F2620;
  --accent:#F0836A;
}
@media print{:root{--bg:#fff;--panel:#fff}body{font-size:10.5pt}.card,.rule{break-inside:avoid}
  details{display:block}summary{display:none}nav.skip{display:none}}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px}
a{color:var(--accent)}
a:focus-visible,summary:focus-visible,button:focus-visible{
  outline:3px solid var(--accent);outline-offset:2px;border-radius:2px}
.skip a{position:absolute;left:-9999px}
.skip a:focus{left:8px;top:8px;background:var(--panel);padding:10px 16px;z-index:10;
  border:2px solid var(--accent);border-radius:3px}

header{padding:44px 0 24px;border-bottom:3px solid var(--ink)}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent);margin:0 0 10px}
h1{font-size:clamp(26px,4.4vw,40px);line-height:1.08;margin:0;letter-spacing:-.02em;color:var(--ink)}
.sub{color:var(--muted);margin:10px 0 0;font-size:17px}
.meta{margin-top:18px;display:flex;flex-wrap:wrap;gap:6px 26px;font-size:13px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:600}

section{margin-top:40px}
h2{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
  margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
h3{margin:0;font-size:18px;color:var(--ink);line-height:1.3}
p{margin:12px 0 0}

/* ---- verdict ---- */
.verdict{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;
  background:var(--panel);border:1px solid var(--rule);border-radius:6px;padding:24px}
@media(max-width:620px){.verdict{grid-template-columns:1fr;gap:16px}}
.grade{width:104px;height:104px;border-radius:6px;display:grid;place-items:center;
  font-size:52px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.grade small{display:block;font-size:10px;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;margin-top:6px}
.g-A{background:var(--ok-s);color:var(--ok)}.g-B{background:var(--ok-s);color:var(--ok)}
.g-C{background:var(--mod-s);color:var(--mod)}.g-D{background:var(--ser-s);color:var(--ser)}
.g-F{background:var(--crit-s);color:var(--crit)}
.g-none{background:var(--min-s);color:var(--min)}
.verdict h3{font-size:21px}
.bar{height:10px;background:var(--rule);border-radius:5px;overflow:hidden;margin-top:14px}
.bar span{display:block;height:100%;background:var(--ok);border-radius:5px}

/* ---- stat tiles ---- */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:12px;margin-top:16px}
.tile{background:var(--panel);border:1px solid var(--rule);border-radius:5px;padding:16px;
  border-top:3px solid var(--rule)}
.tile .n{font-size:30px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:var(--ink)}
.tile .l{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-top:8px}
.tile.critical{border-top-color:var(--crit)}.tile.critical .n{color:var(--crit)}
.tile.serious{border-top-color:var(--ser)}.tile.serious .n{color:var(--ser)}
.tile.moderate{border-top-color:var(--mod)}.tile.moderate .n{color:var(--mod)}
.tile.minor{border-top-color:var(--min)}.tile.minor .n{color:var(--min)}

/* ---- generic card ---- */
.card{background:var(--panel);border:1px solid var(--rule);border-radius:5px;padding:20px;margin-top:14px}
.note{color:var(--muted);font-size:15px}

/* ---- rules ---- */
.rule{background:var(--panel);border:1px solid var(--rule);border-left-width:4px;
  border-radius:5px;padding:18px;margin-bottom:12px}
.rule.critical{border-left-color:var(--crit)}.rule.serious{border-left-color:var(--ser)}
.rule.moderate{border-left-color:var(--mod)}.rule.minor{border-left-color:var(--min)}
.rule-top{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.rule-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--faint)}
.tags{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:9px;font-size:12px}
.badge{padding:3px 8px;border-radius:3px;font-size:10px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase}
.b-critical{background:var(--crit-s);color:var(--crit)}.b-serious{background:var(--ser-s);color:var(--ser)}
.b-moderate{background:var(--mod-s);color:var(--mod)}.b-minor{background:var(--min-s);color:var(--min)}
.chip{background:var(--min-s);color:var(--min);padding:3px 8px;border-radius:3px;font-size:11px}
.spread{background:var(--crit-s);color:var(--crit);padding:3px 9px;border-radius:3px;
  font-size:12px;font-weight:600;white-space:nowrap}
.desc{color:var(--muted);font-size:15px;margin-top:11px}
details{margin-top:12px}
summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--accent);padding:5px 0}
pre{background:#12151A;color:#E8E8E6;padding:12px;border-radius:4px;overflow-x:auto;
  font-size:12px;line-height:1.5;margin:8px 0 0}
code.sel{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--min-s);
  color:var(--min);padding:2px 6px;border-radius:2px;display:inline-block;word-break:break-all}
.fix{font-size:14px;color:var(--muted);margin-top:8px}
.node{padding-top:12px;margin-top:12px;border-top:1px solid var(--rule)}
.pagelist{margin:10px 0 0;padding-left:20px;font-size:14px;color:var(--muted)}
.pagelist li{margin-top:4px;word-break:break-all}

/* ---- table ---- */
.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:5px;background:var(--panel);margin-top:14px}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:600px}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--rule)}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  background:var(--bg);position:sticky;top:0}
tbody tr:last-child td{border-bottom:0}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.url{word-break:break-all;max-width:380px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px}
.d-critical{background:var(--crit)}.d-serious{background:var(--ser)}
.d-moderate{background:var(--mod)}.d-minor{background:var(--min)}.d-ok{background:var(--ok)}

.crumb{margin:22px 0 0;font-size:14px}
footer{margin-top:52px;padding-top:20px;border-top:1px solid var(--rule);
  font-size:13.5px;color:var(--muted)}
footer b{color:var(--ink)}
`;
