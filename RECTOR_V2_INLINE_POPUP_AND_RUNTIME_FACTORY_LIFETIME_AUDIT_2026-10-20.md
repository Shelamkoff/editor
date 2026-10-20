# Rector v2 — retained inline popup authority and synchronous runtime factory audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `cb92d9b82342f55c79e68fe69933be04e2962541`  
**Scope:** `core/ExtensionRegistry.js`, `core/ExtensionRegistry.test.js`, `plugin-kit/types.d.ts`, `core/BlockReconciler.js`, `core/InlineProjectionRuntime.js`, `core/createEditorRuntime.js`.

## Purpose and contract

Continued source-backed v2 architecture/behavior audit following the previous ownership and runtime retirement fixes. Checked the active `RECTOR_V2_REMEDIATION_SPEC.md` and project TDD skill. Relevant requirements include P1 (retain all inline/block plugin capabilities), P5 (safe owner-document resources), I7 (revoked context cannot acquire new UI/producer authority) and I11 (fixed, editor-owned extension contracts). The public plugin-kit declaration requires **synchronous** `BlockPluginRuntime.create(): BlockInstance` and `InlinePluginRuntime.create(): InlineWidgetInstance`. The block and inline DOM projection consumers likewise snapshot and mount the resulting instances synchronously.

No v1 compatibility path, second popup registry, document schema, or new public API was introduced.

## Finding EXT-POPUP-RETAINED-1 — a retired plugin context could present UI (P2)

### Reproduction

When constructing an inline runtime, `ExtensionRegistry` previously handed the extension a `showPopup()` closure that read `options.showPopup` each time it was called. The extension could retain that closure beyond the editor registry's lifetime. Two failures followed:

1. Mutation of the original caller-owned `options.showPopup` redirected an already initialized plugin to a different host callback, violating the captured configuration identity.
2. After `registry.destroy()`, a retained `showPopup()` could still call the host and create new UI using a retired owner.

### Correction

- Snapshot the declared host popup presenter **once** before any plugin setup; retain its original `options` receiver via `Reflect.apply`.
- Check the registry's active lifetime before forwarding an inline popup request.
- Once retired, decline publication, best-effort invoke the caller's provisional `cleanup` callback through existing `invokeObserver`, and return the established inert `{close(){}}` handle.
- Preserve current fallback behavior when no host popup provider is configured.

### Regression proof

The new `core/ExtensionRegistry.test.js` test retains an inline `setup()` popup closure, exercises the active host, mutates `options.showPopup`, and attempts a popup after registry destruction. The old source failed when it consulted the mutated host callback: **41/42 existing plus new tests passed**. After the source fix, **42/42 passed** against the unchanged test suite.

Commits:
- [RED popup lifetime test](https://github.com/Shelamkoff/editor/commit/d43874a7061a8f15ad83c03f967d4e91f8319b3e)
- [Production host snapshot + revocation](https://github.com/Shelamkoff/editor/commit/6b321bcf9b637fcfc2c070a49558073394479a82)

## Finding EXT-CREATE-SYNC-1 — promise-producing instance factories crossed a synchronous contract (P2)

### Reproduction

`snapshotBlockRuntime()` and `snapshotInlineRuntime()` used `bindMethod(..., {synchronous:false})` for plugin `create()`. Therefore Promise-returning implementations could cross the registry boundary without rejection. The actual `BlockReconciler.snapshotBlockInstance` and `InlineProjectionRuntime.snapshotInlineInstance` immediately require a synchronous element-bearing instance and invoke `synchronousResult()` later, after extension execution. The public `plugin-kit/types.d.ts` also specifies a non-Promise result.

### Correction

Remove the asynchronous opt-out **only** from the two runtime `create()` bindings. The existing shared `synchronousResult` enforces the declared synchronous completion and observes returned thenable rejection. Deliberately asynchronous plugin `setup()` and paste `resolve()` bindings are unchanged.

### Regression proof

A new test supplies a Promise-producing block instance factory and a rejecting Promise-producing inline widget factory. The old production source failed the synchronous contract test (**42/43 passed**); after the fix, **43/43 passed** with the same test bodies. Ordinary synchronous runtime creation, plugin setup and retained runtime revocation cases in the suite remained green.

Commits:
- [RED asynchronous instance factory test](https://github.com/Shelamkoff/editor/commit/b7cb3eac704174c402cc6c0fb73d2c7fd14988c4)
- [Production synchronous factory guard](https://github.com/Shelamkoff/editor/commit/09cded1f69a2648b80871601461884a639365799)

## Verification limitations

For RED and GREEN, fetched the exact current production/test contents of the following modules via the GitHub connector:

`shared/jsonData.js`, `shared/cloneEditorData.js`, `shared/documentValidationIssue.js`, `shared/synchronousResult.js`, `shared/invokeObserver.js`, `shared/snapshotDataSchema.js`, `shared/styleRegistry.js`, `core/instanceMethods.js`, `core/ExtensionRegistry.js`, and `core/ExtensionRegistry.test.js`.

Executed **all 43 actual registered test bodies** in an isolated JavaScript/V8 runner using small controlled adapters for Node's test/assert API and owner document/AbortController, replacing ES module import/export declarations but not rewriting production behavior. This proves bounded source-level regressions, **not** the native Node/TypeScript, real popup DOM, or complete v1/v2 capability suite.

A local environment check confirmed Node v22.16.0 but no repository checkout. `git ls-remote https://github.com/Shelamkoff/editor.git` failed with `Could not resolve host: github.com`; the authorized GitHub connector was used to read sources and create direct branch commits. Do not claim native `npm test` ran or any browser acceptance passed.

## Required local release acceptance

In a full installed checkout of the latest `refactor/rector-v2-architecture`:

```sh
npm ci
node --test core/ExtensionRegistry.test.js core/InlinePopupHost.test.js \
  core/BlockReconciler.test.js shared/snapshotDataSchema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, test a real inline plugin holding its setup context while the owning editor is destroyed/recreated, provisional popup cleanup, async/thenable block/widget factory rejection, popup ownership after host change, rich-field editing, and heap-retention of retired editor instances. A full 21-block-type and 12-inline-tool behavior parity assessment against Rector v1 remains separate and incomplete.

**Result:** two independently verified boundary defects fixed, two new regression test bodies committed, current scoped `ExtensionRegistry` focused tests **43/43** green. This does **not** establish overall release readiness or complete v1/v2 behavioral parity.
