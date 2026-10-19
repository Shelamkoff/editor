# Rector v2 — inline formatting author-text ownership audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `28e3d873040fb7a3686e9266fd6f6e042447d2a0`  
**Scope:** `inline-tools/caseTransform.js`, `inline-tools/utils.js`, `shared/editableFields.js` and `tests/browser/native-tools.js`

## Contract and source comparison

`RECTOR_V2_REMEDIATION_SPEC.md` invariants P4/P6/I6 require native controls and non-author content to retain event and mutation ownership. A text selection extending through multiple editor blocks is not permission to edit native buttons, `contenteditable="false"` descendants or static labels between editing hosts.

The v1 `master` implementation of `inline-tools/caseTransform.js` also walked `editableTextWalker()` leaves without a native/locked text guard. This is an existing boundary defect, not a claim that v2 introduced it. The v2 work improves the safety/ownership contract while preserving ordinary selected author-text behavior, UTF-16 offset accounting and history authority.

## Finding INLINE-AUTHOR-1 — case conversion changed locked/native labels (P2)

`createCaseTransformTool().toggle()` filtered inline-widget leaves, but did not verify that the remaining intersecting text leaves belonged to a live authored editing field. A cross-block range could therefore uppercase a locked label, an embedded native button and an action label between blocks.

**RED:** Execute the original production function with a controlled synthetic DOM: selecting `alpha … beta … bravo` also changed `locked label`, `inner button` and `native action` to uppercase.

**GREEN:** Add an author-text ownership guard. The same full function now produces `ALPHA`, `BETA` and `BRAVO`, retaining all three protected labels exactly. The guard is extracted to `shared/editableFields.js` for reuse rather than left as a case-tool-specific rule.

- Regression test: [`50b2866c`](https://github.com/Shelamkoff/editor/commit/50b2866c52c42cd361cec4d9eca281e73cd62054), expanded in [`4e171897`](https://github.com/Shelamkoff/editor/commit/4e1718976947458a3c6c466a86c2d09d296f0206).
- Production fix: [`b6e308ca`](https://github.com/Shelamkoff/editor/commit/b6e308caa82ee172a40da131a3e375247ad50c4f), null-flow tightening [`e5cd925b`](https://github.com/Shelamkoff/editor/commit/e5cd925b278d0bb0d1bb8bcb24fae104fc7061b1), shared helper [`25762b9d`](https://github.com/Shelamkoff/editor/commit/25762b9d2491bdef13934e5594b15c969dbb9abc), callsite reuse [`e4d2ce89`](https://github.com/Shelamkoff/editor/commit/e4d2ce891657b5d6166ff00a0b27fbbb9a19f1d3).

## Finding INLINE-AUTHOR-2 — shared targets crossed native/locked content (P2)

`collectTextTargets()` powered Font Size, Color and ancestor-based formatting. It accepted every intersected text leaf excluding inline-plugin labels, including text from locked descendants and native buttons.

**RED:** The original collector returned six fragments for a selection spanning three authored and three protected text leaves.

**GREEN:** The real current collector, executed with a controlled synthetic TreeWalker, returns only the three authored fragments. The editor's `.oe-block` plus `editableAtBoundary` establish the editing-host ownership; native/role buttons, input controls, widget labels and nested false editing hosts are excluded.

- Collector regression test: [`bd92b71e`](https://github.com/Shelamkoff/editor/commit/bd92b71e6f4b81df32ba0855899a0bc380d8f66d).
- Collector fix: [`c77ba876`](https://github.com/Shelamkoff/editor/commit/c77ba876dc5eb19fa1b175677a15450bf0aacee4).

## Finding INLINE-AUTHOR-3 — tag wrapping fallback bypassed shared targets (P2)

`toggleTag()` handled cross-block `surroundContents()` failures with another independent TreeWalker. Its fallback still wrapped native/locked labels even after the shared collector was corrected.

**RED:** Isolated real-source fallback run wrapped all six selected text nodes, including the three protected labels.

**GREEN:** Reuse `collectTextTargets()` in the fallback. Reverse traversal still wraps only `bravo`, `beta` and `alpha` (reversed deliberately to avoid invalidating offsets); protected labels are untouched.

- Regression test: [`85c1930b`](https://github.com/Shelamkoff/editor/commit/85c1930b4ae18daad3790579aa774c6efa39cfae).
- Production fix: [`c2be6031`](https://github.com/Shelamkoff/editor/commit/c2be60315fa6c2ac44beb49bf7f892597fc21a0a).

## Finding INLINE-AUTHOR-4 — same-field surround fast path wrapped controls (P2)

When a single field includes a selected native button or locked span, `Range.surroundContents()` can succeed and wrap the protected element as a whole. Merely filtering the fallback therefore does not protect native controls.

**RED:** On the previous code, the protected-content scenario still called `surroundContents()`, where the surrounding wrapper would include the control.

**GREEN:** Inspect protected elements intersecting the requested range before taking the native fast path. If protected content is present, use the vetted authored-text fallback. In isolated function checks, the protected fixture no longer calls the surround fast path and wraps only author text; an ordinary unprotected fixture still calls `surroundContents()` exactly once.

- Regression test: [`b130e3a0`](https://github.com/Shelamkoff/editor/commit/b130e3a0ca7e0656551bb39196bfc2f3bf1bce21).
- Production fix: [`1b9afb54`](https://github.com/Shelamkoff/editor/commit/1b9afb5428bc3a8e5178a1ad08d857151fbf246d).

## Verification

| Check | Result | Evidence limit |
| --- | --- | --- |
| Original vs patched full Case Transform | RED → GREEN; 3 protected fragments preserved | Real production functions, simulated DOM, V8 |
| Original vs patched `collectTextTargets` | RED 6 targets → GREEN 3 author targets | Real collector plus controlled fake TreeWalker |
| Tag fallback before vs after | RED 6 wrapped leaves → GREEN 3 | Real `toggleTag` source, synthetic DOM and forced split |
| Protected `surroundContents` path before vs after | RED 1 forbidden fast-path invocation → GREEN 0 | Real `toggleTag` source, synthetic host |
| Unprotected `surroundContents` fast path | 1 invocation before and after | Same isolated harness |
| Syntax parsing of four modified test/runtime files | Passed | V8 parse after stripping static ESM imports/exports; not TypeScript |
| Authored browser tests in `tests/browser/native-tools.js` | 3 scenarios added/expanded | Native Chromium was **not** run |
| Full `npm test`, `typecheck`, package/browser/docs gates | **Not run** | Complete checkout and dependencies unavailable in this environment |
| Complete v1/v2 user-gesture parity | **Not established** | Separate native acceptance still required |

The browser regression fixtures directly exercise the exported case tool, shared target collector and `toggleTag` with nested `contenteditable="false"`, a button within an editing host, and an action between blocks. These tests are authored but not asserted green until actual Chromium execution.

## Remaining audit and local acceptance

The existing-wrapper remove/unwrap branches of `toggleTag()`, Clear Formatting and Font Size Reset should be independently audited for protected-content ownership; no claim is made here that those paths are corrected. Also recheck selection bookmarks, undo/redo and real keyboard/pointer gestures on the native fixtures.

Run from a complete repository checkout:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Do not treat these focused, simulated checks as global stability or v1/v2 parity acceptance. All changes were committed directly on the requested branch, using each file's current GitHub blob SHA to avoid overwriting concurrent work.
