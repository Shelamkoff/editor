# Browser verification

Use Node.js 22 and an installed Chrome or Chromium. Install dependencies in this
repository (`npm install --ignore-scripts`); no neighboring repositories are
required. The scripts resolve their own checkout location, so its name and the
shell working directory are not part of the test contract.

Run `npm run test:browser` for the page suites (including `audit.html`), physical
keyboard/mouse history tests, and heap/lifecycle checks. Run `npm run docs:check`
for the built documentation and its browser smoke test.

`EDITOR_CHROME_PATH` selects a browser executable when it is not on the standard
OS path. `EDITOR_VITE_PATH` can select a different Vite CLI; the default is the
repository's installed Vite. To run a single page, use
`EDITOR_BROWSER_PAGE=audit.html node tests/browser/run.mjs` (set the environment
variable using your shell's syntax).

The runners bind temporary servers to loopback only and clean up their browser
profiles and child processes. A browser navigation restriction is a failed or
unavailable browser check, not a successful test. Synthetic composition and
clipboard-failure cases do not replace manual testing with OS input methods and
real clipboard permission dialogs.

Tests belonging to the standalone cropper/expose repositories are not part of
this checkout. Rector's own lifecycle and plugin integration suites still test
its use and cleanup of those installed packages.
