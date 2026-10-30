# Resumed published baseline browser gate — 2026-10-30

The complete `npm run test:browser` passed on clean published source `afea0f347db7dc047c5f19b9c2c9fe4caf4ebc30`, tree `00fca46974e17e4f1a2a323a343d2aaf311fb69c`, with unchanged C11 source identity. This includes the ten previously local Person/Table commits and the native vertical-selection repair, before the subsequent LinkPreview, generic source-completion, Gallery, Poll, Image/Person and other fixes.

- All **36 ordinary browser pages** reached their own passing status. The harness-contract page deliberately contains six negative cases and verifies that its harness reports them as failures; those expected harness controls are not product failures.
- All **2,168 native cases** in the final driver's result passed, including 42 cross-selection and 84 design cases. The cumulative driver counts are retained separately in `summary.json`.
- Heap checks passed: **23 disposal sentinels, none retained**, plus the history eviction and retained-control release checks.

Execution was `2026-10-29T22:50:37.836Z`–`2026-10-29T23:07:40.489Z` (17 minutes 2.649 seconds), using Node 24.22.1, npm 11.9.0 and Chrome for Testing 156.0.8078.47. `browser.log.gz` is the exact compressed C11 log; `manifest.json` is the completed original manifest. `summary.json` records hashes and the observed counts without summing overlapping focused tests.

This supersedes the earlier failed Table viewport and vertical-selection attempts only for this tested published source. It is not evidence for later source changes or an assertion of full v1 functional parity. The final combined source has its own integration gate and source manifest.
