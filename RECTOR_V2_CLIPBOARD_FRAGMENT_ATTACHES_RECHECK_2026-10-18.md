# Rector v2 — clipboard fragment ownership and Attaches native caret parity

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting commit:** `d9694ed41220fa5c2c827cbeb1731743f5eb8684`  
**v1 behavior reference:** `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This audit checked the public v2 private-clipboard fragment codec, Attaches filename synchronization, and prior v1 save/blur semantics. It does not reintroduce removed v1 APIs or persisted JSON formats.

## 1 — Private clipboard fragment ownership: four confirmed issues (P2)

The public `createClipboardFragment` and `transferBlockFromRecord` boundaries previously had four defects:

1. `html` was read twice. An accessor could return a valid value during validation but a different value for the resulting fragment.
2. The caller's `parts.map` method was invoked. A valid Array with an overridden method could throw, return incomplete data, or execute unexpected author code.
3. An invalid nonstring block type could be coerced through `String(type)` to a valid-looking type, invoking user-controlled `toString()`.
4. The fragment `kind` could be read twice, letting a changing accessor be rejected by one branch and accepted by a later one.

**Focused RED:** the pre-fix production implementation read an HTML accessor twice and persisted the second string; a hostile custom array `map` was executed; an object `type` was converted and accepted; and a changing `kind` getter was accepted on its second read.

**Fix:** capture `kind`, `html`, length, and block type once, require a literal nonempty type string, and iterate dense array indices without invoking a caller-owned `map`. The encoded v2 fragment envelope and supported part variants are unchanged.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/ec868b745d31c2c7415a8f244a1f2064f7955bcd) — `core/ClipboardFragment.ownership.test.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/71697c9d7029a08a69770a0799c2ac97751a452d) — `core/ClipboardFragment.js`.

**Focused GREEN:** 7/7 existing and new checked-in `node:test` test bodies passed in an isolated V8 harness using the final real `ClipboardFragment` and `jsonData` source. This is not a full installed-project Node runner execution.

## 2 — Attaches: sibling name update detached focused native editor (P2)

`createAttachesPlugin().setup().create().update(next)` previously called `project(next)` unconditionally. `project` aborts view event controllers, empties `nameFields`, calls `wrapper.replaceChildren()`, and reconstructs every filename editing host. After native authoring updates whose DOM was deliberately retained, an unrelated sibling name change detached the actively edited filename and lost focus/caret.

**Fix:** when variant, file order/IDs and media properties are unchanged, retain the existing view, use name-field equality to avoid replacing the active native source and update only externally changed sibling text. Continue the full projection on structural/media/variant changes or when a registered file field is missing. The original view/event ownership remains intact.

- [Browser regression](https://github.com/Shelamkoff/editor/commit/373ec7bef9ebd35e50f20ebb0c4876c000375ca4) — `tests/browser/native-plugin-parity.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/e8b2c5800f7b31b8fb0c738c0e32f446fe2f0ae7).

**Focused source execution:** extracted the exact final `reconcileNames` closure with a controlled owned-field Map. Verified: native committed A + sibling B rename does not write/detach A; unrelated canonical no-op does not rewrite either field; genuine remote A rename updates A; variant change chooses full projection. The registered native-browser case was **not run** in Chromium.

## 3 — Attaches: empty native filename and v1 source parity (P2)

The first narrow hypothesis, that an empty field should persist an empty author name, was **rejected on direct v1 inspection**. V1 `#syncNames()` updates only on nonempty text; its blur path restores a fallback name. The first empty-persistence patch was therefore corrected rather than being described as a parity improvement.

The actual missing behavior in v2 is that a preserved native input projection can leave the plugin-local `data` snapshot at `Alpha` even though the committed document already contains `A` after four Backspace operations. On the final Backspace, the old `read()` used the stale local `Alpha` as fallback. Instead, the fallback must come from the latest committed canonical data for that exact stable file ID.

**Fix:** during `read()`, build a map from `context.getData().files` once, prefer a nonempty live field, otherwise preserve the committed value if the file ID is present. An explicitly empty canonical name remains empty; never resurrect stale plugin-local text merely because it is truthy.

- [Canonical snapshot fallback](https://github.com/Shelamkoff/editor/commit/472511c20d5f40c78a70a7f4f0f184049740d24b).
- [v1 parity browser expectation](https://github.com/Shelamkoff/editor/commit/3151f65c506df80a10d68bff6988217c48ef4f43).
- [Preserve explicitly empty canonical values](https://github.com/Shelamkoff/editor/commit/bbd89921455bdf2bda072f652687bd99e7ede209).

**Focused GREEN:** four direct source-level checks passed: last nonempty `A` after clearing a live field; current nonempty live editing text; explicitly empty committed name; and absent field falling back to the committed name.

## Verification boundary

The four changed JavaScript files (clipboard codec, its new test, Attaches, and native-browser parity suite) were parsed by V8 after adapting static ESM syntax. The native Attaches scenarios are committed but the actual `node --test`, real browser input and complete release checks were **not executed** in this environment; container GitHub DNS resolution is unavailable. The V8 harness is narrower than the project runner.

Required final checkout verification:

```sh
npm ci
node --test core/ClipboardFragment.test.js core/ClipboardFragment.ownership.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, check focused Attaches filename edit followed by sibling-only update, additional typing, Undo/Redo and read-only transitions; repeated native Backspace until the field is empty; intentional externally authored empty values; and structural file updates that must still rebuild the view.

**Conclusion:** confirmed Clipboard boundary bugs and Attaches caret/filename issues fixed in the existing architecture. A suspected empty-string parity regression was rejected using v1 source evidence, then corrected to the true last-committed-name contract. This does not establish release-level stability or exhaustive gesture parity.
