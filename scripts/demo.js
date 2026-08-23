#!/usr/bin/env node
'use strict';
/** Serves fixtures/ on a free port, scans it, prints where the report landed. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { scan } = require('../src/index');

const DIR = path.join(__dirname, '..', 'fixtures');
const TYPES = { '.html': 'text/html', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(DIR, rel);
  if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  console.error(`demo site: ${url}\n`);
  try {
    const { summary } = await scan(url, {
      maxPages: 10, out: 'demo-report', log: m => console.error(m),
    });
    const t = summary.totals;
    console.error(`\n  Grade ${t.grade}   ${t.pagesClean}/${t.pagesScanned} pages clean`);
    console.error(`  Report: ${path.resolve('demo-report', 'index.html')}\n`);
  } finally {
    server.close();
  }
});
