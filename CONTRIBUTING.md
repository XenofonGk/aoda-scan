# Contributing

Thanks for taking a look.

## Getting set up

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` runs the unit suite with Node's built-in test runner and needs no browser, so it's fast.
The end-to-end path needs Chromium and the fixture server:

```bash
npx http-server fixtures -p 8901 &
node src/cli.js http://localhost:8901/index.html --out demo-report
```

## What makes a good pull request

- **Add a test.** Behaviour changes need coverage in `test/`. If you're changing detection, add the
  case to `fixtures/` so the CI end-to-end job proves it.
- **Keep dependencies minimal.** The package currently has two, both essential. New runtime
  dependencies need a clear justification.
- **The report is held to WCAG 2.1 AA.** It would be embarrassing otherwise. Contrast-checked
  colours, semantic markup, visible focus, and no meaning carried by colour alone.
- **Don't overstate what the tool can do.** Automated testing covers roughly a third of WCAG. The
  README and the report both say so, and they should keep saying so.

## Reporting a bug

Include the URL if it's public, the flags you ran, and what you expected. A `summary.json` from the
run is the most useful attachment.
