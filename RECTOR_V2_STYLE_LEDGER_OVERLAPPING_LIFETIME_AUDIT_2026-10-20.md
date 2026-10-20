# Rector v2 — overlapping stylesheet acquisition and last-owner teardown

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e9b13675233e95eb8e7d891bd086984a9af0710d`  
**Finding:** STYLE-LEASE-1 (P2, shared CSS lifetime integrity)  
**Files:** `shared/styleRegistry.js`, `shared/styleRegistry.realm.test.js`, `core/ExtensionRegistry.test.js`

## Contract and scope

Continued Rector v2 audit after JSON metadata isolation. The current `RECTOR_V2_REMEDIATION_SPEC.md` requires per-owner-document resource isolation (P5), exactly one resource owner / no revoked ownership authority (I7), and per-editor extension setup/teardown consistency (I11). The stylesheet registry maintains a reference-counted `Map<URL, { count, link }>` stored in a `WeakMap<Document, Map>` and must reuse the same link when multiple editor instances acquire the same URL. The project's TDD skill was consulted and a concrete public-boundary regression was reproduced before the production change.

The previous style-registry audits covered overlapping acquisitions, DOM adoption, failed append, URL array snapshots and recursive acquisition. This pass targets **last-owner release during an ongoing new acquisition**, rather than duplicating those checks. No legacy API, second CSS registry or global observer was introduced.

## Reproduction — old lease disposal deleted a live acquisition's ledger

Prior `acquireStyleUrls(urls, ownerDocument)` held a local `entries` map, acquired the per-document mutation gate and created a `<link>` before recording its URL. The `release()` closure belonging to a previously acquired stylesheet did:

```js
if (entries.size === 0) entriesByDocument.delete(ownerDocument)
```

A valid sequence:

1. Editor A acquires `/old.css` and owns the only entry in the document map.
2. Editor B begins acquiring `/new.css`; its `head.appendChild(link)` callback synchronously destroys Editor A.
3. A's `release()` deletes `/old.css`, sees an empty map, and **removes the WeakMap document entry** while B is still using that same map for the unfinished `/new.css` insertion.
4. Editor B publishes `/new.css` into its *orphaned* map.
5. Editor C acquires `/new.css`; it finds no document ledger, creates a second `<link>` and starts a second independent reference count.

The original actual source was executed with a controlled DOM callback. It produced **two active links for `/new.css`**, rather than one. A second regression reproduced the same issue when disposal happens during `document.createElement('link')`.

This is a shared-resource integrity fault: real editor/renderer consumers may duplicate styles and release the wrong underlying DOM link when editor instances overlap in one document. It does not mean native DOM `appendChild` inherently destroys editors; the callback is a controlled reentrancy/extension-host boundary.

## Fix and invariants

- When a release empties the map, do **not** delete the document's ledger while that same document is inside the `acquiringByDocument` gate.
- Only delete when the WeakMap still points to the releasing ledger; a stale closure cannot delete a newer generation's map.
- After `acquiringByDocument.delete(ownerDocument)` in `finally`, prune any still-empty ledger, including failed-acquisition rollback; never leave an empty registry unnecessarily retained.
- Preserve existing link-ref counting, partial append rollback, foreign-adopted link protection, and recursive acquisition rejection.

No change to public API, stylesheet URLs, DOM asset format, or browser feature list.

## RED → GREEN and regression coverage

The first two `shared/styleRegistry.realm.test.js` regressions were committed before production changes. A follow-up commit corrected a test assertion quote **before running the RED check** (no production change in that correction).

The **actual previous source** `shared/styleRegistry.js` blob `216db304198e7ec39d5f54b0251225de56fb04e3` against the corrected test file:
- **10/12 passed**; both new last-lease/overlap tests failed for the intended duplicate-link behavior.

After the production fix (`shared/styleRegistry.js` blob `86297f36b983bdaea75c6f0127951eb92608c45e`):
- All **12/12** stylesheet tests passed in isolated JavaScript execution.
- A third, positive rollback test covers a failed new append that synchronously destroys the final previous owner; **13/13** stylesheet tests passed.
- A new `core/ExtensionRegistry.test.js` test creates two new editor-scoped registries while an old registry is destroyed from an owner-document append callback. It failed with the old production style registry and passed with the new one.
- The complete current `core/ExtensionRegistry.test.js` source was exercised using actual `ExtensionRegistry`, schema snapshot, JSON clone, style registry, lifecycle and observer implementations with controlled AbortController, document and assertion adapters: **35/35 tests passed**.

**Total current focused checks: 48/48** (13 style-registry and 35 extension-registry). This represents source-backed isolated V8 execution, **not** the repository's native `node --test` runner or actual Chromium DOM.

## Direct commits

- [Initial overlapping lease tests](https://github.com/Shelamkoff/editor/commit/09691c43d3cd8d8d67797ca4fcb8b650e1e01f26)
- [Test assertion syntax correction](https://github.com/Shelamkoff/editor/commit/080ec14b944ff3dadcc51f1f19a54889b8a92013)
- [Production style-ledger fix](https://github.com/Shelamkoff/editor/commit/9d7d6f4d65416b125807baa271f53a8374e7d9d0)
- [Failed overlapping acquisition rollback regression](https://github.com/Shelamkoff/editor/commit/31bcd7c087b08839bb8880326457fbca8b38417c)
- [Editor ExtensionRegistry integration regression](https://github.com/Shelamkoff/editor/commit/47e01393d7bd1847bebb0b64355840c0de3081a6)

## Required final local acceptance

In an installed checkout of the final branch:

```sh
npm ci
node --test shared/styleRegistry.realm.test.js core/ExtensionRegistry.test.js plugins/style-ownership.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

In Chromium, mount two editor/renderer instances sharing one document, trigger new stylesheet acquisition while removing the previous instance, and check real `<link>` count plus CSS continuity before/after each destroy. Validate failed append recovery, theme changes and retained plugin instance CSS. Run the full v1/v2 behavioral capability matrix separately.

**Not executed:** native Node/npm, actual Chromium DOM, heap retention, TypeScript typecheck, full package consumer gate and comprehensive v1/v2 behavior parity. This audit closes only the reproduced style-ownership defect and does **not** certify overall release readiness.
