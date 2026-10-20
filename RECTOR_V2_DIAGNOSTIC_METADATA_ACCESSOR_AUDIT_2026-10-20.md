# Rector v2 — diagnostic metadata accessor isolation audit

**Date:** 2026-10-20
**Repository:** `Shelamkoff/editor`
**Branch:** `refactor/rector-v2-architecture`
**Baseline HEAD:** `59f17de71b8e984bcbcfe97f92030fdd3fac6f91`

## Scope

Reviewed current `core/Diagnostics.js`, `core/Diagnostics.test.js`, `shared/invokeObserver.js` and `core/ChangeNotifier.js`. The history cursor revocation issue was already addressed in the preceding commits and was not reworked.

## Finding DIAGNOSTICS-ACCESSOR-1 (P2)

`Diagnostics.emit()` used object destructuring on caller-supplied `details`, synchronously evaluating accessors for the allowlisted properties. An extension-provided object with `get pluginType() { throw ... }` could therefore throw during a diagnostic emission, breaking the advertised observer isolation. The existing test only checked undeclared fields and did not cover getter-backed *declared* fields.

## Remediation

- Added a regression in `core/Diagnostics.test.js` asserting that a throwing allowed-field getter is never evaluated, the call does not throw, and ordinary data fields still arrive at the observer.
- Replaced property-value destructuring with own-property descriptor reads for exactly the permitted fields in `core/Diagnostics.js`.
- Accessors are ignored, as are descriptor lookup failures caused by Proxy traps; arbitrary additional fields remain unread.
- No changes to the public diagnostics event schema or to the notification queue.

Commits:
- Test: `81c5bf8fc80b8cc28d79e1abda5047155342a023`
- Fix: `be129187374c7a36e5bedb069c957e6bd33511d6`

## Verification boundary

GitHub accepted both direct branch commits. The new test is a targeted source-level regression but a complete Node/browser test run was **not executed** in this session. No claim of full v1/v2 parity or release readiness is made.

Run on an installed checkout:

```sh
node --test core/Diagnostics.test.js core/ChangeNotifier.test.js
npm run typecheck
npm test
npm run test:browser
```

Also verify that third-party diagnostic inputs cannot execute getters (including Proxy get traps), that valid primitive metadata fields retain their values, and that diagnostic observer rejections remain contained.
