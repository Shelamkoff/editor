# Rector v2 — public iterator lifetime and diagnostics boundary recheck

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ab37d00888e49fd8d6d761cbadf3ae8ca3d72da2`  
**Scope:** `core/PublicEditorApi.js`, `core/Diagnostics.js`, `core/createEditorRuntime.js`, targeted tests; no v1 compatibility layers and no edits to IME controller work already underway on the branch.

## Method and constraints

Checked the current remote source, existing tests and the active `RECTOR_V2_REMEDIATION_SPEC.md` C1/C7 ownership and content-free diagnostics contracts. GitHub contents-API edits were committed directly with each file's current blob SHA. The six source/test commits below are present on the refactor branch; unrelated files were not rewritten.

This pass is a source audit plus regression-test additions, **not** a completed local Node/TypeScript/browser run. CI minutes and a network-enabled full repository checkout were not available in the current execution environment. Do not classify added tests as passed until run from a fresh full checkout.

## Finding PUB-ITER-1 — retained block iterator remains usable after destroy (P2)

`EditorBlocksApi[Symbol.iterator]()` verified `#assertLive()` only on the first `next()`, then iterated a captured `runtime.list()`. Holding the iterator, destroying the editor, then resuming could yield another snapshot without validating editor ownership. The last-item completion path also did not observe teardown.

**Change:** recheck liveness before each snapshot and after the normal iteration loop. Preserves live block enumeration and independent `snapshot()` values; prevents a retained iterator from returning more block snapshots after the editor has been destroyed.

**Regressions added:** a two-block retained iterator, a single-block last-yield/completion case, and normal enumeration/caller-snapshot independence.

- [Test commit `c19308b`](https://github.com/Shelamkoff/editor/commit/c19308b74bf0fc6e81a283df967c06508ceaef68)
- [Fix commit `18c71a8`](https://github.com/Shelamkoff/editor/commit/18c71a8b0f0ab0fb5b7f1781da9c638a0bee3ad8)

## Finding DIAG-1 — public runtime bypasses audited diagnostics class; unsanitized event field spread (P2)

`core/Diagnostics.js` had unit coverage, but the actual `createEditorRuntime` instantiation used a separate `createDiagnostics()` implementation with duplicate threshold and emission logic. Both implementations spread every enumerable `details` field into `onDiagnostic` events. Type declarations restricting fields are not a runtime boundary: an unexpected `content`/`payload` field, object-valued metadata or caller-supplied `code`/`timestamp` could pass through (or trigger unexpected getters) if a producer accidentally supplied it. Existing ordinary internal event producers were reviewed: they currently provide declared metadata; this finding does **not** assert a demonstrated end-user content leak through existing public editor commands.

**Change:** `Diagnostics.emit()` now reads only the declared `durationMs`, `operation`, `pluginType`, `blockType`, and `errorName` fields once. It forwards a finite numeric duration and string-valued metadata only; source-owned `code` and `timestamp` cannot be overridden by `details`. Events remain frozen and deferred, and the consumer observer remains isolated through `invokeObserver`.

`createEditorRuntime` now constructs `new Diagnostics(config.onDiagnostic, config.diagnosticThresholds)` rather than keeping a second, independently drifting implementation. This makes `Diagnostics.test.js` exercise the class used by the actual editor runtime.

**Regressions added:** undeclared getters that must not be evaluated; rejection of object-valued metadata, extra fields and nonfinite duration; and early `createEditor` failure through the production diagnostics path with deferred, frozen, correctly shaped events.

- [Boundary tests `27e22a0`](https://github.com/Shelamkoff/editor/commit/27e22a0be35c8e4b20fdd650b550b2c86ca14321)
- [Allowlist fix `07b6491`](https://github.com/Shelamkoff/editor/commit/07b64914debe97edcc2ebc92986188ba8c9e1720)
- [Runtime consolidation `7883136`](https://github.com/Shelamkoff/editor/commit/78831362759c8925382be680145756286a2a2893)
- [Public creation smoke test `2a1320c`](https://github.com/Shelamkoff/editor/commit/2a1320c3f462219b4215a91dd1dd9b34bfbf9484)

## Verification status

| Check | Status |
| --- | --- |
| Current remote source and retained snapshots re-read after updates | **Done** |
| Old/new source paths, existing test contracts, declared diagnostic event fields reviewed | **Done** |
| New `PublicEditorApi.test.js` cases | **3 added; not executed** |
| New `Diagnostics.test.js` cases | **2 added; not executed** |
| New `createEditor.config.test.js` case | **1 added; not executed** |
| Full Node unit suite on final HEAD | **Not run** |
| `npm run typecheck`, package/types/docs checks | **Not run** |
| Chrome/real IME, lifecycle heap and full v1/v2 gesture parity | **Not run** |

Suggested local acceptance on a fresh checkout of this branch:

```sh
npm ci
node --test core/PublicEditorApi.test.js core/Diagnostics.test.js core/createEditor.config.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

## Remaining audit boundary

These fixes close two source-level ownership/diagnostics findings, **not** full-library behavioral parity with Rector v1. A separate end-to-end comparison of real editor authoring gestures, browser-native composition, plugin capabilities, selection, clipboard, undo/redo, read-only changes and rendering still needs to be completed against the final refactor HEAD. Previously recorded IME staging regressions are owned by the separate [IME audit](RECTOR_V2_IME_STAGING_DEFERRED_FOCUS_REENTRY_AUDIT_2026-10-18.md).
