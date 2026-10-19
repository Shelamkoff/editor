# Rector v2 — cross-block text walking and auxiliary focus ownership audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `6fae1cd07415585f8c882627b8df0416232e5b78`  
**Code checkpoint before this report:** `c00bba87e97a00b5b85b742a6a3864b768ead4ae`

## Contract and scope

Continue the [native-control logical offsets audit](RECTOR_V2_NATIVE_CONTROL_LOGICAL_OFFSETS_AUDIT_2026-10-19.md) and the remediation specification P4/I2/I6/I7/I8: only the actual editing host owns an author gesture, external controls may not use a stale native selection, and legitimate nested editable fields remain usable.

Reviewed current source of `shared/textOffset.js`, `core/BlockReconciler.js`, `core/LogicalSelection.js`, associated tests and `tests/browser/native-tools.js`. Public `master` was checked for context; its earlier text walker also primarily excluded inline widget labels, so the work is not claimed to fix exclusively v2 regressions.

## Finding WALK-CHROME-1 — unowned UI labels appeared in cross-block editable text walks (P2)

`editableTextWalker()` filtered native controls and locked subtree labels but did not require a candidate to belong to any `contenteditable=true` editing host when the supplied root was an editor shell. Ordinary text in the toolbar, insert-block chrome, or status elements was therefore returned along with the authored fields. This risks incorrect cross-block formatting targets and non-author text lookup.

**RED:** the new cross-root fixture returned static toolbar/block/status labels and failed its independently specified list of `Alpha` and `Bravo`. A formatting wrapper inside a real author host continued to work in the control case.

**Fix:** if there is no true host on the candidate's path inside the walk root, only accept the text when that root itself is within an actual authored host. Otherwise exclude UI text. This preserves walking an ordinary formatting span under its host and walking separate author fields through a `contenteditable=false` plugin shell.

- [RED and compatibility unit fixtures](https://github.com/Shelamkoff/editor/commit/9eea99c10e9d097d20ecd7d106284a368461b7bd)
- [Production fix](https://github.com/Shelamkoff/editor/commit/39d5737ca58c2b364e41469a80e89c5e5841e8ab)
- [Native-browser regression](https://github.com/Shelamkoff/editor/commit/100d2dc27dc54a998647eaaf6463559034875589)

## Finding FIELD-OWNER-2 — native controls could borrow a parent editable field (P2)

`BlockReconciler.resolveEditableTarget()` climbed the DOM to the nearest registered editing field, even if the target was inside a native button, nested `contenteditable=false` owner, unregistered independent editing host, inline widget or role-button control. Returning a parent field for a control-owned node misclassifies interaction ownership.

**RED:** evaluated the exact previous `resolveEditableTarget()` method with synthetic live field owners: both a nested button and its label incorrectly resolved the author's `fieldKey: text`.

**Fix:** walk only as far as the first independent editing/control boundary. Check an exact registered field **before** that boundary, so a legitimately registered input remains addressable. Preserve the existing on-demand refresh for remounted fields: after refreshing, retry exact owner resolution, then stop at the same control boundary. `resolveBlockTarget()` remains unchanged, since an auxiliary control may belong to a block without owning its text.

- [Regression for nested button/locked/widget/role/independent-editor targets](https://github.com/Shelamkoff/editor/commit/51adf995c76bc49c504213d070cd0bf10f51d439)
- [Production fix](https://github.com/Shelamkoff/editor/commit/11d3e67ac19b449a0fc5320f6b77f71f38138317)
- [Compatibility regression for remounted registered native input](https://github.com/Shelamkoff/editor/commit/c00bba87e97a00b5b85b742a6a3864b768ead4ae)

**Focused GREEN:** the real current method returned the parent field for an ordinary author child and `null` for all eight tested independent control targets. A newly registered plain-text input resolved successfully after exactly one refresh. This is a simulated method-level check; the full `BlockReconciler.test.js` has **not** been run in Node.

## Finding LOGICAL-FOCUS-3 — focused in-block controls reused stale author selection (P2)

`LogicalSelection.capture()` already distinguished a fieldless block from a block with fields. When a native control inside a **fielded block** owned focus, however, it continued into the document's still-present `window.getSelection()` and could capture a stale authored range as if the editing field were active.

**RED:** a new unit case failed on the previous implementation: a focused button with an old text selection returned an author bookmark.

**Fix:** when the focused block contains actual authoring fields but the active element has no registered field ownership, reject capture rather than reuse its earlier native selection. Preserve the existing fieldless-block focus contract and legitimate registered rich/plain-text field capture.

- [Failing test](https://github.com/Shelamkoff/editor/commit/77bad2e9d26f7260f84c2e53de5ffaea971bd533)
- [Fix](https://github.com/Shelamkoff/editor/commit/10833ae3c71179d93afb211f3e9b51ea6c80d0d9)
- [Native browser fixture](https://github.com/Shelamkoff/editor/commit/ccf8bcf9bcf87c5cdcbff7c8c5d70ceb5c95be07)

## Finding LOGICAL-FOCUS-4 — external focused controls also retained stale editor selection (P2)

Even if the active control was **outside** the editor, `LogicalSelection.capture()` could read an earlier author selection still present in the global Selection. This is not hypothetical browser state: a standalone Chromium DOM test confirmed that focusing an outside `button` preserves the editor's selected `lph` substring, with the button becoming the active element.

**RED:** the independently added test failed with the old implementation, capturing the stale bookmark for external button focus.

**Fix:** reject stale selection capture when an unregistered active element is an auxiliary native/role control, an independent editing host, or a focused element outside the editor root. Preserve default `body`/`documentElement` fallback behavior, and keep restricted test adapters supported through optional root containment.

- [RED test](https://github.com/Shelamkoff/editor/commit/c5cccee9872a3ca6591bd8ba0215a6054372f2d1)
- [Fix](https://github.com/Shelamkoff/editor/commit/e626398e5694451e9028c57662e62a5588bd0f65)
- [Restricted root adapter compatibility fix](https://github.com/Shelamkoff/editor/commit/0eeaa5ce33b4a9f2dec9c98d6a57153deec107af)
- [Native browser fixture](https://github.com/Shelamkoff/editor/commit/b77805b4dec92ca5f30044f08c97453872445256)

## Focused verification and limits

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Cross-block walker RED | **1 intended failure** | Actual previous source in isolated V8 |
| Cross-block walker GREEN | **9/9** | Actual helper and test cases under a V8 test adapter |
| Exact BlockReconciler method RED/GREEN | **Bug reproduced, then guarded** | Real extracted method with a synthetic mounted owner; not full package tests |
| LogicalSelection stale in-block focus RED | **1 intended failure** | Actual previous class + test |
| LogicalSelection stale external focus RED | **1 intended failure** | Actual previous class + test |
| Current LogicalSelection | **28/28** | Actual class, shared helpers and test code; isolated V8 |
| InlineSelectionAuthority | **22/22** | Current source/test, isolated V8 |
| Inline normalization | **9/9** | Current source/test, isolated V8 |
| Owner-realm helper | **1/1** | Current source/test, isolated V8 |
| Combined source-backed suites | **69/69 passed** | V8 test/assert adapter, **not** a full `node --test` run |
| Syntax of involved source/test JS | **12/12 parsed** | Imports/exports stripped for V8 parsing; **not** TypeScript validation |
| Standalone Chromium DOM smoke | **Passed** | TreeWalker excludes static UI while finding two true fields; native button focus retains selected author text |
| New full Rector browser cases | **Authored, not run** | Project test harness not executed |
| Full stability, Undo/Redo and v1/v2 behavioral parity | **Not established** | Requires full local acceptance |

The GitHub repository is accessible through the connected GitHub integration, but the local container cannot resolve `github.com` for a `git clone`. A full checkout with project dependencies was unavailable in this pass. It would be inaccurate to label Chromium standalone DOM smoke or V8 method tests as full integration acceptance.

## Required local acceptance

```sh
npm ci
node --test shared/textOffset.surrogate.test.js \
  core/LogicalSelection.test.js core/BlockReconciler.test.js \
  core/InlineSelectionAuthority.test.js inline-tools/inlineContent.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In native browser acceptance, test an author selection retained after clicking an in-block button and an external button, then verify no stale authored operation, no extra Undo entry and no focus reclamation. Verify a newly registered native plain-text field is still a valid editor target. Repeat normal backward Unicode cross-block formatting/Undo/Redo with inline widgets and native controls interleaved.

All changes in this pass were committed directly to `refactor/rector-v2-architecture` using current GitHub blob SHAs; no force push or unrelated file overwrites.
