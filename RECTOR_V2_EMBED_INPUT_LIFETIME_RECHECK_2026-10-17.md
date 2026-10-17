# Rector v2 — Embed input ownership and URL debounce recheck

**Date:** 17 October 2026  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `10c1a5a3e9e0f8c1fc8a675f31dc03f7099e08f7`  
**Last code HEAD checked:** `8e4dce8903fde4dcfad5897e1f509591cd2d87ee`  
**v1 baseline:** `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (behavioral expectation only; no legacy API/schema restored)

## Result

Two independent regressions in the **Embed authoring plugin** were confirmed and corrected. Both concerned UI ownership across changes to *other* fields of the same canonical block.

**This is a focused source-level red/green verification, not a full-editor or whole-library stability signoff.** The browser regressions are registered and syntax-checked but have not been executed with the complete editor in real Chromium at this HEAD.

### E-N1 — native caption lost its editing host on player updates (P2)

After native text input, the canonical caption may advance without calling the plugin's `update()`, intentionally retaining its focused contenteditable and browser selection. A later metadata or video-source update called `project()` and unconditionally `view.replaceChildren()`, disconnecting that caption, losing its DOM identity and active caret.

The fix compares incoming canonical caption against both the previous projected caption and the *currently mounted* authoring DOM. When its content is unchanged, only obsolete player siblings are removed; the caption remains attached while the updated player is inserted before it. Actual externally changed captions still reproject, so an obsolete DOM value cannot mask a remote authoring change.

**Red:** all 3 new focused reconciler tests failed on the previous production Embed source.  
**Green:** 3/3 passed on the fix with production Embed logic and controlled document/renderer adapters. A corrective test-fixture change ensured a synthetic `innerHTML` update did not itself manufacture a focus loss.

Files:
- `plugins/embed/index.js` — [caption fix](https://github.com/Shelamkoff/editor/commit/efa621f1a6a9633a77f4346e185c86deb4eb25e7)
- `plugins/embed/reconciliation.test.js` — [initial regression](https://github.com/Shelamkoff/editor/commit/f70e61525ae0c4f2ea91549e83ad3ec02252ef54), [fixture correction](https://github.com/Shelamkoff/editor/commit/e0cbbdb921f48eb6ca3244f14ce9633b003a201a)
- `tests/browser/native-plugin-parity.js` — [browser integration case](https://github.com/Shelamkoff/editor/commit/c3acef8023dce354c381137ba269a9ad7d86d19a)

### E-N2 — unrelated update erased URL draft and canceled/deferred parsing (P2)

The same `project()` reset the active `.oe-embed__url-input` to the current canonical provider URL and cleared the pending 500 ms parse timer. As a result, an unrelated title or duration update could delete an unfinished pasted/typed video URL before it was applied.

The fix retains the focused URL draft **and the original pending timer/deadline** while the canonical video source is unchanged and the plugin remains editable. It deliberately invalidates stale drafts when the video source changes or the editor becomes read-only. Preserving the timer identity also ensures frequent unrelated updates cannot postpone URL parsing indefinitely.

**Red:** the URL-draft test failed before the first fix; following the initial fix, the strict original-timer-identity assertion still failed (4/5 suite passing).  
**Green:** 5/5 focused tests passing on the final code, including the negative control where a genuine remote source replacement invalidates the pending draft.

Files:
- `plugins/embed/index.js` — [draft fix](https://github.com/Shelamkoff/editor/commit/55f16b83cd5447156614794393c1176503488636), [stable debounce deadline](https://github.com/Shelamkoff/editor/commit/8e4dce8903fde4dcfad5897e1f509591cd2d87ee)
- `plugins/embed/reconciliation.test.js` — [draft cases](https://github.com/Shelamkoff/editor/commit/f3c8d0042da4818ad9856ef53d58aa8d7ccabe9b), [timer ownership](https://github.com/Shelamkoff/editor/commit/1d48084e6c59620bb37ea3865230a8ec604f4451)
- `tests/browser/native-plugin-parity.js` — [browser scenario](https://github.com/Shelamkoff/editor/commit/88026a5f17ec6916a2f4af19cba8be6ed9867c4a)

## Evidence and execution boundaries

The focused regression suite exercises the actual `createEmbedPlugin` implementation fetched by Git blob, using a deterministic V8 adapter for imported helpers, the media player builder, browser events, timers and an owning Document. The committed five test bodies were executed against both the earlier and repaired production sources. This verifies caption identity, focus ownership, player metadata, URL draft, timer identity, eventual URL parse and intentional invalidation of obsolete state **within that isolated contract**.

The registered browser additions exercise:
1. native caption typing → metadata change → source change → continued typing → independent Undo operations;
2. live URL input → pending input event → unrelated host update → eventual parse → separate Undo.

Browser test files and modified production JavaScript passed syntax parsing; those browser tests **have not been run** in the complete `createEditor` runtime. The latter URL scenario dispatches a synthetic `input` event to deterministically exercise the debounce; it must not be reported as a trusted native event verification.

A compare against the starting HEAD showed **9 commits ahead, 0 behind**, confined to `plugins/embed/index.js`, `plugins/embed/reconciliation.test.js` and `tests/browser/native-plugin-parity.js` before this report. Existing Image/Gallery work and other parallel changes were not overwritten.

## Remaining acceptance gates

Run against the eventual **final** branch HEAD on a complete checkout with the declared dependencies:

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

The full v1/v2 gesture differential, actual browser caret/selection, native IME, clipboard, Undo/Redo, read-only transitions, media/player behavior and heap/resource lifetime remain part of whole-library acceptance. The limited focused pass must not be used to claim every v1 behavior or all plugin paths are already stable.

## Addendum — empty-caption cleanup after clearing the source

A second-order regression was found after the first caption-retention fix. When a configured Embed had an empty caption, clearing `service` and `videoId` could retain the obsolete empty caption editor in the DOM. The previous full-replace implementation removed it.

A sixth regression was added and reproduced the incorrect state. **RED: 5/6**, with the empty-caption case failing. The reconciliation now preserves the caption only when the incoming canonical state actually requires one (configured player or nonempty caption). **GREEN: 6/6** focused tests with actual production Embed source and controlled DOM/dependency adapters.

Commits: [failing Node test](https://github.com/Shelamkoff/editor/commit/25ac0a0bbee5bc75fc23c88cef826345eae5c834), [fix](https://github.com/Shelamkoff/editor/commit/49d15fa6a7bcbe91b3abf4a0844af7842454d1fb), [registered native browser case](https://github.com/Shelamkoff/editor/commit/db84771d58a0caf9cf384fafcc73a8ec45ac8b4c).

The browser case checks removal of obsolete caption and player plus Undo restoration. It passed syntax parsing but was **not run in real Chromium**. This addendum supersedes the previous 5/5 targeted count; it does not establish full-library/browser acceptance.
