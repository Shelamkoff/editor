# Rector v2 — safe inline unwrap, clear formatting and font-size reset

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `f048cb9475e9943f19125ad77941fd6677cf706c`  
**Code checkpoint before this report:** `9b01b451132228a4fcd6bb70109b34e7f72164a8`

## Contract

The current remediation spec requires native control and inline widget DOM ownership (I6/I7) and native-selection/history integrity (P4). A selected author-text command cannot clear formatting from a `contenteditable=false` descendant or from an embedded native button merely because that element is inside the DOM wrapper intersected by the selection.

Prior audit [INLINE FORMATTING AUTHOR TEXT OWNERSHIP](RECTOR_V2_INLINE_FORMATTING_AUTHOR_TEXT_OWNERSHIP_AUDIT_2026-10-19.md) covered applying tags and collecting authored text targets. This pass covers removing existing formatting and resetting font size without broadening the editor's public API.

## Finding UNWRAP-1 — whole-wrapper removal erased protected inherited styling (P2)

The former `toggleTag()` Case 1 unwrapped an entire matching `<b>` when a selected range covered the author's first and last characters. That same wrapper could contain locked/native descendants not owned by the text command. Case 2's `extractContents()` branches could likewise operate on intersected descendants without verifying authored text.

**RED (isolated DOM-model evaluation of the actual old `toggleTag` source):** selecting the `alpha` and `beta` endpoints inside `<b>alpha<span contenteditable=false>LOCKED</span><button>ACTION</button>beta</b>` left `alpha` and `beta` unstyled but dropped the `b` ancestor from both protected controls.

**Fix:** derive formatting-removal candidates exclusively from `collectTextTargets()`, identify their matching styling ancestors within the current contenteditable host, isolate each selected text fragment before removing the wrapper, and preserve sibling nodes and their live DOM ownership. The shared `isolateAncestor` implementation was moved into `inline-tools/utils.js` and reused by `selectedAncestors.js`, avoiding a duplicate splitter or a circular import. The unprotected wrapping fast path remains available.

**GREEN (same focused isolated evaluator):** both authored endpoints are unstyled, while locked and button nodes retain their own `b` ancestors. Ordinary partial removal is additionally represented by a new browser regression expecting `<b>before</b>selected<b>after</b>`.

- RED browser cases: [`d1daa7e`](https://github.com/Shelamkoff/editor/commit/d1daa7e045ece4cef1762a549eefbbb80cbe1aea).
- Production fix: [`9be23fc`](https://github.com/Shelamkoff/editor/commit/9be23fcba44e2155e747de301164cb0426add582).
- Shared splitter reuse: [`8245d7a`](https://github.com/Shelamkoff/editor/commit/8245d7a08895d0d32c8b0823247b037baa795e7f).
- Partial-removal parity regression: [`9b01b45`](https://github.com/Shelamkoff/editor/commit/9b01b451132228a4fcd6bb70109b34e7f72164a8).

## Finding UNWRAP-2 — Clear Formatting acted on bold text belonging only to locked/native controls (P2)

`hasClearableWrapper()` previously inspected every `b/i/span/...` wrapper intersected by a range. When the only styled text was inside a locked span, it could invoke `toggleTag()` on a plain author selection, either modifying protected markup or introducing a new author wrapper. The call's existence was not proof that a selected author fragment carried that style.

**RED (actual old helper, focused simulated host):** a protected-only `<b>` returned `hasClearableWrapper(range, 'b') === true` despite no selected author text having a bold ancestor.

**Fix:** require at least one selected authored text fragment with the matching style in its ancestor chain, stopping at its contenteditable boundary.

**GREEN (actual new helper under the same conditions):** protected-only styling produces `false`, allowing Clear Formatting to leave plain author text and protected elements unchanged.

- Production fix [`9c49bf9`](https://github.com/Shelamkoff/editor/commit/9c49bf9ace7986ec6c9dae372d4d14892af27306).
- Browser test added in [`d1daa7e`](https://github.com/Shelamkoff/editor/commit/d1daa7e045ece4cef1762a549eefbbb80cbe1aea).

## Finding UNWRAP-3 — font-size reset included protected-only style and could revisit inert markers (P2)

`fontSize.js` previously determined reset relevance by geometrical `range.intersectsNode(span)`. Thus a selection spanning authored text around a locked/control-owned styled span could trigger an unnecessary style mutation. Its temporary `oe-font-size` cleanup loop similarly used `intersectsNode(marker)` even after all authored text had left that marker, risking repeated format toggles while the protected marker remained between range endpoints.

**Fix:** `selectedWrappers(root, range, selector)` returns only wrappers containing the selected authored text leaves. It now filters the initial relevance check, conversion candidates, and `oe-font-size` replay loop. Protected-only wrappers never enter the reset operation; after an authored segment is split away, leftover protected markers cannot count as remaining author formatting.

**Focused validation:** the guarded selector excludes a protected-only 28px span, retains an actual authored 24px span, and excludes a marker containing only protected text. The previous geometrical intersection condition was true on both protected-only examples. A real Chromium integration run is still required for selection restoration and undo/redo.

- Test [`494df3a`](https://github.com/Shelamkoff/editor/commit/494df3aed2b313094f2297d3ad3f3f69da082b8d).
- Fix [`214a4ef`](https://github.com/Shelamkoff/editor/commit/214a4ef4d9c846aa530db0ca228c3039247a4706).
- Shared-style wrapper browser regression [`1a5c593`](https://github.com/Shelamkoff/editor/commit/1a5c5932b653fd1e27486bda3d17e2f3b9e89e9a).

## Verification and limitations

| Gate | Result | Evidence scope |
| --- | --- | --- |
| Old/new full `toggleTag` conditional unwrap | **RED → GREEN** | Actual old/new source executed in a small synthetic DOM ownership model |
| Old/new `hasClearableWrapper` | **true → false** for protected-only bold | Actual helper in a focused controlled host |
| Font-size wrapper authorization | Protected-only excluded; authored span retained | Current `selectedWrappers` extracted from actual source with controlled targets |
| Parse of changed `utils`, `clearFormatting`, `fontSize`, `selectedAncestors`, browser fixture | **Passed** | V8 parsing with ESM imports/exports stripped; not a TypeScript check |
| Browser regressions | **5 scenarios authored** | Full native browser suite **not executed** |
| Chromium execution attempt in available container | **No valid result** | Headless Chromium also hung on a minimal page, with D-Bus/socket errors |
| `npm test`, `typecheck`, `test:browser`, `test:types`, `test:package`, `test:docs` | **Not run** | Full project checkout and dependency environment unavailable |
| Complete v1/v2 feature parity | **Not established** | Requires the full real-gesture acceptance matrix |

Neither isolated V8 checks nor authored browser tests establish complete editor stability.

## Follow-up

1. Execute the full native browser suite, including five added regression cases, from the project checkout; inspect canonical `save()` and one-operation Undo/Redo on mixed protected/authored selections.
2. Check how `removeEmptyInlineTags()`, `mergeAdjacentTags()` and `normalizeAfterEdit()` treat nested `contenteditable=false`, native buttons and plugin-owned empty elements; those deeper normalization boundaries were **not** changed in this pass.
3. Verify font-size reset with multiple simultaneous authored font-size spans, nested style spans, backward selection, and cross-block selections.
4. Re-run normal package, declaration, docs and type checks before considering v1/v2 parity accepted.

Changes are committed directly on `refactor/rector-v2-architecture` using the fetched blob SHA for each write. Parallel agents' files outside the scoped changes were not rewritten.
