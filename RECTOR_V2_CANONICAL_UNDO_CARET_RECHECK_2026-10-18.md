# Rector v2 — canonical caption rollback and native editing parity audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting head:** `b1cd7fbd3114481e8be75dbee7f34cc5e404ee72`  
**v1 behavioral reference:** `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This pass investigated a shared regression in the **Gallery**, **Carousel**, and **Attaches** editor instances when native input was committed with the source DOM retained, followed by Undo or a host-origin author-data reversion. The user-visible invariant is that a successful canonical Undo/Redo or host update must restore the displayed author value, including when that value coincides with an older plugin-local cache. Unrelated updates must not detach a live editing field.

## Root cause

`BlockReconciler` deliberately skips `instance.update()` for a source block in a native `preserveSourceProjection` transaction. The mounted editable DOM therefore contains the latest committed native text while the plugin-local `data` may still contain the text from before that input. Later reconciliation calls `instance.update(next.data, before.data)` for real canonical changes.

Before the fixes, Gallery and Carousel decided an author caption was unchanged when `next.caption === data.caption`, even though that `data` was **not** the prior canonical value. Following native `Alpha → AlXpha`, Undo/host update `AlXpha → Alpha` incorrectly took the no-redraw path and left `AlXpha` in the live DOM. The same false equivalence existed in the recently introduced Attaches `reconcileNames` for a filename.

### G-UNDO-1: Gallery stale caption after Undo or host reversion (P1)

**RED:** the prior Gallery fast-path expression returned true for an exact author-text reversion (`previousCanonical.caption='AlXpha'`, `next.caption='Alpha'`, local cached `data.caption='Alpha'`, live field `innerHTML='AlXpha'`). It would not replace the field despite a real author change.

**Fix:** `instance.update(next, previousCanonical)` now compares caption equality with the **actual canonical predecessor** for the corresponding image ID, falling back to the projected snapshot only for unsupported standalone caller contexts. It can still skip repaint if the new canonical caption already equals the mounted field. Structural, option and layout guards remain intact.

- [Gallery browser regression](https://github.com/Shelamkoff/editor/commit/303c5b62231a8d34b2c8c587df8a90cf40021a73)
- [Gallery fix](https://github.com/Shelamkoff/editor/commit/7fe21d4d1eff83afc2fd45345275d585070beab0)
- [Gallery source-level mounted instance tests](https://github.com/Shelamkoff/editor/commit/fc37ddbea3651f6011b8a21f6b802db263ad0a49)

### C-UNDO-1: Carousel stale active caption after Undo or host reversion (P1)

**RED:** the prior Carousel `unchangedActiveView` condition likewise returned true when Undo restored the stale pre-edit caption text. The rendered stage could disagree with the canonical slide while its settings picker was updated independently.

**Fix:** the active slide comparison uses the actual `previousCanonical.slides[index].caption` for the matching stable slide ID; retaining an editing host is allowed when caption is unchanged from that canonical predecessor or the new caption matches the mounted field. Media source/order, playback options and other structural changes continue to trigger projection.

- [Carousel browser regression](https://github.com/Shelamkoff/editor/commit/4d8ead6d6c01dd60d95916c50a25747f21bc1828)
- [Carousel fix](https://github.com/Shelamkoff/editor/commit/c609e2719c78cda57c96fd478d36844a58c9d57c)

### A-UNDO-1: Attaches filename reversion dropped in its retained DOM (P1)

**RED:** `reconcileNames()` returned true but left `AlXpha` in the mounted name field when the author reset its canonical value from `AlXpha` to `Alpha` and the plugin-local value was still `Alpha`. This is the same source-retention behavior as native caption input.

**Fix:** use the prior canonical record's name when determining whether a mounted field must be updated. Unrelated sibling changes retain the field identity and caret; true remote/Undo reversion assigns its updated text. File structural properties and variant changes still invoke full projection.

- [Attaches browser regression](https://github.com/Shelamkoff/editor/commit/73f8e38c2b45249bffa6b311af53eb4ffacb317b)
- [Attaches fix](https://github.com/Shelamkoff/editor/commit/c66c68b55c3890a6c30a0004a1e8f7a97bed9e6c)

An immediate syntax inspection also discovered that the new Attaches `update` method was missing a separating comma before `editableFields`. This introduced a parse error and was corrected in [`c972cd9`](https://github.com/Shelamkoff/editor/commit/c972cd90296269a1c7a4a33a55dbafd8673f4001); its repaired production module passed V8 syntax inspection. The original broken source was **not** counted as successful.

## Verification actually performed

1. **RED source execution:** extracted exact old Gallery/Carousel fast-path predicates and old Attaches reconciler from authenticated branch source. Each accepted a canonical Undo/reversion without updating the live text.
2. **GREEN focused paths:** evaluated updated production predicates and reconciler from the final branch:
   - Gallery and Carousel: canonical reversion requires repaint; a new remote value differing from live DOM requires repaint; an unchanged active value can retain native field/caret.
   - Attaches: canonical reversion writes the prior name; sibling-only updates keep the active field; pending uncommitted DOM changes are not overwritten by an unrelated sibling edit; genuinely changed remote name updates its field.
3. **Mounted Gallery production instance:** executed all **5/5** existing and newly added `plugins/gallery/settings-lifecycle.test.js` test bodies against the updated factory and source in a controlled V8 DOM adapter with injected local dependencies. Both specific Undo-repaint and native-style-retention regressions passed alongside three existing panel-lifetime tests.
4. Parsed the touched production and browser regression JavaScript in V8 after ESM-import adaptation; corrected the Attaches delimiter error and rechecked successfully.
5. Inspected `BlockReconciler` to verify `instance.update(item.after.data, item.before.data)` supplies the prior canonical snapshot; the fix does not depend on ambient global state or add another state owner.

The controlled execution does **not** replace the actual project-pinned Node runner, Chromium-native input, OS IME, packaging, typecheck, or whole v1/v2 gesture differential. Browser regression scenarios are registered in `tests/browser/native-plugin-parity.js` but were not executed through its Vite/Chromium runner during this session. The container cannot access GitHub via DNS; files were read/committed using the authenticated GitHub connection instead.

## Release gate remaining

```sh
npm ci
node --test plugins/gallery/settings-lifecycle.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Add live Chrome/Firefox/WebKit validation of native rich-text and plain-text inputs followed immediately by Undo, Redo, and host reversion in Gallery, Carousel, Attaches, plus inactive sibling changes, IME, selection restoration, teardown and heap retention. Keep all previously reported pass/fail evidence scoped to its own exact source SHA.

**Conclusion:** three confirmed source-retention/Undo parity defects fixed; the focused execution described above passed. Whole-editor release stability and exhaustive behavioral parity with v1 remain unverified.
