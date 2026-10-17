# Rector v2 — extension callback authority and descriptor snapshot audit

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `5e7f57a3211b4a3c174ff539c065446eb363da65`  
**Last production commit:** `334d8764c4887b912d83a96f0e32c9df8d6548b3`  
**v1 comparison reference:** `master` (`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`).

## Overview

This pass continued the Rector v2 audit from popup/toolbar DOM lifetimes into an independent but related class of failures: **an extension callback or caller-owned descriptor can execute JavaScript while the host believes it is only validating a returned value or copying metadata.** The focus was on the synchronous extension contract and snapshot-by-declared-member architecture, not on reintroducing legacy v1 runtime behavior.

Confirmed defects were first recorded as new failing tests, then fixed by changing the existing ownership boundaries. **16 new regression scenarios** were added: 3 for `InlineToolMounts`, 2 for `SettingsActions`, and 11 for `ExtensionRegistry` (five unknown-getter scenarios, four array-method/iterator scenarios, and two double-read settings label scenarios).

## A1 — InlineToolMounts returned thenables escaped observation authority

The previous fix placed `bindSelectionPort()`, `onMount()`, `bindSelectionPort(null)`, and `destroy()` under `runtime.observeExtension()`, but evaluated each returned value's `then` getter in `synchronousResult()` **after leaving that guard**. This permitted a getter owned by the extension to reenter a model command during mount or teardown.

**RED:** 10/13 targeted tests passed; each of three new cases failed because the `then` getter ran outside the protected phase.  
**Fix:** call both the lifecycle method **and `synchronousResult`** within the same `observeExtension` callback, preserving one-shot cleanup and error propagation.  
**GREEN:** 13/13 targeted tests passed.

- [Failing tests](https://github.com/Shelamkoff/editor/commit/b2cd695731bf85703ad0a14dbc1a14f570ca27ab)
- [Production fix](https://github.com/Shelamkoff/editor/commit/3d3478cf92618ae324fd4f228ed588732ebac549)

## A2 — SettingsActions.apply could reenter document mutation before validation

`prepareSettingsActions()` correctly prepared action lists and localized labels under `runtime.prepareExtensionValue()`, but the captured `apply()` callback returned by the preparation was invoked in a later block-data producer **without** the same preparation gate. A user-supplied `apply()` callback could attempt reentrant document mutation, while a returned thenable's getter was evaluated outside the guarded phase.

**RED:** 21/23 focused tests passed; two additional tests reproduced both problems.  
**Fix:** run captured `apply()` and `synchronousResult()` together inside `runtime.prepareExtensionValue()`; retain the callback's original receiver, newest author data input and existing operation context.  
**GREEN:** 23/23 focused tests passed.

- [Failing tests](https://github.com/Shelamkoff/editor/commit/71f3d8b11d7ba13f49531c190664ee2348903fb9)
- [Production fix](https://github.com/Shelamkoff/editor/commit/f382507a72ee1d52959d6c5d55f32b74d8d7855d)

## A3 — ExtensionRegistry inspected undeclared descriptor getters

Several snapshot functions copied the **entire** caller-owned object using object spread, despite requiring only a bounded set of declared descriptor fields. Enumerable getters on unsupported fields of a block definition, inline definition, label, capabilities object, or toolbox item were therefore executed during registration, and could throw or change external state. The remediation specification calls for snapshotting **used** descriptor members, not arbitrary extras.

**RED:** five independent new tests failed on the prior source (0/5).  
**Fix:** capture the precise declared fields of each descriptor and retain their original method receivers. Do not enumerate or execute extra property getters.  
**GREEN:** all five passed.

- [Failing tests](https://github.com/Shelamkoff/editor/commit/f6176d2e032b86f12600113b947978a6c7e02fbc)
- [Production fix](https://github.com/Shelamkoff/editor/commit/97bbea69c78a0c8111f637e0a2280d8c769d13d8)

## A4 — caller-defined array methods could bypass registry snapshots

Registration used `options.blocks.map`, `inline.map`, `toolbox.map`, and `paste.patterns.map` directly on extension-owned arrays. Styles used `for...of` and spread; formatting inline tools used `for...of` and spread. A valid **dense array** with overridden `map`/`Symbol.iterator` could therefore throw, return fabricated entries, or bypass expected indexed metadata validation.

**RED:** four independent tests failed on the prior source (0/4), covering registration arrays, toolbox variants, inline regex patterns, and formatting/style arrays.  
**Fix:** snapshot validated dense arrays by numeric index through a private `mapDenseArray()` helper. Validate each captured entry and detach arrays/regexes before publication. No caller-defined array map or iterator executes.  
**GREEN:** all four passed.

- [Failing tests](https://github.com/Shelamkoff/editor/commit/1a584cc84f06a7a903efe1ae056fa843ffba6257)
- [Production fix](https://github.com/Shelamkoff/editor/commit/00ae00754344af2c7585b349b665fca0cfa2c0a9)

## A5 — settings and inline-controls label accessors were evaluated twice

The `snapshotSettings()` branch for action capabilities used `source.label` to check for presence and then read `source.label` a second time when constructing the snapshot. A stateful getter could return two different values or throw during otherwise valid registration.

**RED:** two new tests failed on prior code (0/2).  
**Fix:** capture the optional label property once before checking/validating it.  
**GREEN:** both passed.

- [Failing tests](https://github.com/Shelamkoff/editor/commit/ada2563f87ba94371605ad3f16070e78778cdea5)
- [Production fix](https://github.com/Shelamkoff/editor/commit/334d8764c4887b912d83a96f0e32c9df8d6548b3)

## Executed tests and limitations

| Committed test file | Focused pass | Relevant production source |
|---|---:|---|
| `core/InlineToolMounts.test.js` | **13/13 PASS** | Real `InlineToolMounts` + `synchronousResult`; controlled observation authority |
| `core/SettingsActions.test.js` | **23/23 PASS** | Real `SettingsActions` + `synchronousResult`; controlled preparation authority |
| `core/ExtensionRegistry.test.js` | **34/34 PASS** | Real `ExtensionRegistry`, `snapshotDataSchema`, `styleRegistry`, `instanceMethods`, `synchronousResult`; controlled JSON clone, validation wrapper, AbortController |
| **Total** | **70/70 PASS** | Deterministic production-source tests in V8; not the complete project runner |

The red phase was recorded **before the corresponding production code changes**. The green tests were rerun against committed production sources. The complete official suite, physical browser behavior, TypeScript/JSDoc diagnostics and package export/build checks were **not** run during this pass.

Local acceptance still needs `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, `npm run docs:check`, and the broader comparative v1/v2 interaction matrix at the final synchronized commit. This scoped audit does **not** assert that the whole Rector v2 library is release-stable or completely behaviorally equivalent to v1.
