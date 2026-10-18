# Rector v2 — visually empty rich-text action parity audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ce017ea45707e6424d97ab063a294f4d7793cca4`  
**Historical comparison:** v1 `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This audit moved beyond prior Clipboard/blob ownership work to **native keyboard and clipboard actions for rich-text blocks**. Four distinct discrepancies were reproduced and fixed in the existing plugin/host architecture. The changes add two narrow owner-document properties to existing public operation contexts; no compatibility adapter or old persisted schema path was added.

## Findings

### R-EMPTY-1 — Checklist Enter treated empty HTML as authored content (P2)

The v2 `Checklist.shortcuts.handle()` branch used `!current.text.trim()` to decide whether Enter in an item should exit/remove that empty item or split the item. Markup such as `<br>`, `<strong></strong>` or `&nbsp;` is not a blank string, but is visually empty in an editing host. v1 inspected actual DOM `textContent` when classifying empty items; the new v2 branch did not preserve that behavior.

**RED:** 2/3 focused Checklist tests failed because an empty HTML item reached `splitField` instead of returning `kind:'exit'`. The normal nonempty HTML split case passed.

**Fix:** use the same `isRichTextEmpty(current.text, context)` helper already used by the plugin's public `empty.isEmpty` capability. The Enter behavior, checked state and history action contract are unchanged.

- [New regression tests](https://github.com/Shelamkoff/editor/commit/8e8d2d6cd31e3ac9769e441d4ee0c2fcf6e3680b)
- [Fix](https://github.com/Shelamkoff/editor/commit/21fba8127adb6f7f1a25af46b4e530cd90387d08)

### R-EMPTY-2 — List Enter parsed HTML in the ambient global DOM realm (P2)

`List.shortcuts.handle()` already called `isRichTextEmpty(current.text)`, but failed to pass the editor-owned document. For HTML it used `globalThis.document`, which is wrong for an editor in an iframe, cross-realm host, or headless DOM adapter. Without an ambient document the action threw rather than exiting an empty list item.

**RED:** both new List HTML shortcut tests failed with `Rich-text emptiness requires the owning document for HTML` despite having a valid `context.ownerDocument`.

**Fix:** extend `ShortcutOperationContext` with `readonly ownerDocument: Document`, supply it from `DocumentRuntime.prepareShortcutAction` in the existing frozen context, and use it inside List's rich-text emptiness check. There is no new service or state owner.

- [Tests](https://github.com/Shelamkoff/editor/commit/cf18accfbb9b998426248ba6cf3c6d13aa27c2e7)
- [Core ownership contract test](https://github.com/Shelamkoff/editor/commit/e47ab3d78269763f9e3b3efd9fb119f5af30ee3)
- [List fix](https://github.com/Shelamkoff/editor/commit/a6a5c60afdc966f818b503989596701a9e43e069)
- [Core context fix](https://github.com/Shelamkoff/editor/commit/98df6c5305c2f0cd7deb4421e0abe540ce038edc)
- [Public type](https://github.com/Shelamkoff/editor/commit/bddf84945c285562d0cd06e23a87651a4b99d801)

### R-EMPTY-3 — Poll Backspace would not delete visually empty HTML options (P2)

The Poll shortcut used `!data.options[index].text.trim()` when determining whether Backspace should remove an option beyond the required two-option minimum. V1 classified emptiness by the mounted option's DOM `textContent`. A visually blank mark persisted as HTML prevented deletion in v2.

**RED:** the direct shortcut test rejected removal of `<br>` as if the option had text; the separate negative control for real author text/two-option minimum already passed.

**Fix:** use `isRichTextEmpty(data.options[index].text, context)` with the owning-document shortcut contract. Normal nonempty Backspace remains native.

- [Tests](https://github.com/Shelamkoff/editor/commit/038fe1db9e443000da62d58b38b27f464acd8561)
- [Fix](https://github.com/Shelamkoff/editor/commit/ef1e98c5f54633b61f5394713a7cf601ee65e398)

### R-EMPTY-4 — Quote Cut left markup-only empty residual blocks (P2)

`Quote.clipboard.slice()` checked `!remaining.text.trim() && !remaining.caption.trim()` to decide whether a Cut should delete the source block. Removing the last visible author content can leave empty formatting marks such as `<strong></strong>`. V2 then retained an effectively empty Quote block even though the plugin's own `empty.isEmpty` capability correctly identified that HTML as empty.

**RED:** the focused Quote clipboard test returned a residual block instead of `null` after removing selected content and leaving `<strong></strong>`; a nonempty quote/caption negative control already passed.

**Fix:** use `isRichTextEmpty` for both remaining fields; extend `ClipboardSliceContext` with `ownerDocument` and supply the editor's owning document from the existing `prepareClipboardBlockSlice` capability dispatch.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/f074e81515ce48db2a54a2fa5cf60c0e642b2a98)
- [Quote fix](https://github.com/Shelamkoff/editor/commit/a9b4b22fd4891a17b310f71ae4124bd5c1b9b749)
- [Clipboard host dispatch](https://github.com/Shelamkoff/editor/commit/e44b3e4ead095183e677ca4f91a4e25acb8cadcb)
- [Public type](https://github.com/Shelamkoff/editor/commit/0b964ebae40a0c8bc603973cf59d7a0163b6e81a)

## Recorded tests and evidence

- **RED to GREEN:** Executed actual shortcut/clipboard callback source in an isolated V8 harness with the real `isRichTextEmpty` implementation and a deterministic owning-document HTML template projection. Before fixes: Checklist 2 failed, List 2 failed, Poll 1 failed, Quote 1 failed. After fixes: **9/9** focused test bodies passed: Checklist 3, List 2, Poll 2, Quote 2.
- **Browser regression fixtures:** Three new native keyboard cases were committed in `tests/browser/native-plugin-parity.js` for Checklist, List and Poll, including Undo/Redo checks. [Checklist/List test commit](https://github.com/Shelamkoff/editor/commit/55cd0d4a7da37b2bd135d308de5aa5cd6009dc61); [Poll test commit](https://github.com/Shelamkoff/editor/commit/24d58f67ec360c4d453d578ed62b3780f8e9b76a).
- **Owner-context coverage:** The `DocumentRuntime` owning-document regression test is recorded. The exact modified core context creation and type declarations were inspected, but the complete `DocumentRuntime.test.js` body was **not** executed in an installed project.
- **Syntax:** All 12 modified/new JavaScript production/test files parsed successfully under V8 after static ESM import adaptation.
- **Documentation:** English/Russian extension guides and affected plugin README notes were updated to describe visual emptiness and DOM-realm ownership.

## Outstanding acceptance

The V8 adapter is not a native HTML parser. No full `node --test`, installed TypeScript typecheck, real Chromium/native input, actual Undo/Redo integration, package smoke test, alternate browser engine, or physical IME pass was performed here. GitHub source was accessed and committed through the authenticated repository connector; local checkout was unavailable in this environment.

Run against the **final branch HEAD**:

```sh
npm ci
node --test plugins/checklist/shortcut-empty.test.js plugins/list/shortcut-empty.test.js plugins/poll/shortcut-empty.test.js plugins/quote/clipboard-empty.test.js core/DocumentRuntime.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Confirm actual input selection and caret preservation for Checklist/List/Poll in native browser; quote Cut behavior for formatting-only marks; alternate DOM document ownership (iframe); and editor rollback after a malformed/unregistered inline occurrence.

**Conclusion:** four confirmed rich-text emptiness mismatches repaired at the existing capability seams. Release stability and exhaustive v1 behavioral parity are **not certified** by this focused pass.
