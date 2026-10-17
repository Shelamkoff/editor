# Rector v2 — SourceEditor reentrancy and DOM-ownership audit

Date: 2026-10-17. Branch: `refactor/rector-v2-architecture`.
Starting HEAD: `9dc670c13f347c27e8244242ec1cabc6a1eaf776`.

## Scope and outcome

Three confirmed defects were found and fixed in the **shared `plugins/shared/sourceEditor.js`** implementation used by Image, Gallery, Carousel, Attaches and other source-authoring plugins. No versioned schema changes, legacy compatibility, external libraries, or public API changes were required.

**Acceptance limit:** These are targeted Node-style tests of the actual SourceEditor and layer module source with a deterministic signal-aware DOM adapter; the full installed-repository `node --test`, TypeScript, browser/native/IME, package, heap and differential v1/v2 gates were **not run at this HEAD**. Do not claim global stability on their basis.

## SE-R1 — owner cancellation during validation still submitted data (P1/P2)

Before the fix, the SourceEditor `submit` handler called the consumer-defined synchronous `normalize(field.value)`. That callback may reenter the editor, synchronously abort its owner, close the current form or open a replacement. Even after cancellation it proceeded to `close();config.onSubmit(value)` for a valid return, potentially invoking an obsolete authoring action after the owning block/view was revoked.

The related invalid-result branch could show validation feedback and `focus()` a field that had already been removed by owner cancellation.

**Fix:** after returning from `normalize()` (including its exception path), check `closed || config.signal.aborted` before either error feedback or `onSubmit`. Normal valid submissions remain unchanged; a superseded form cannot write or steal focus.

**RED:** three relevant contract tests added in `plugins/shared/sourceEditor.reentry.test.js`: abort during valid normalization, successor opened during validation, abort during invalid normalization. Against the pre-fix module, all three failed for their intended contract; ordinary validated source submission succeeded.

**GREEN:** all **4/4** focused cases passed after this change.

Commits: [tests](https://github.com/Shelamkoff/editor/commit/109d1c57ea43636334d52b6db483c6883fb64d8), [fixture correction](https://github.com/Shelamkoff/editor/commit/49fd3c314cc89eb76873f54bbff8a0fa30753015), [fix](https://github.com/Shelamkoff/editor/commit/4acc05722e0b4ab1434d84f0be0f3b54b8ac2652).

## SE-R2 — close/focus restoration allowed an older open request to overwrite a newer successor (P2)

Calling `openSourceEditor` when one session was open first called its `close()`. That function may restore focus to a previously focused control. The control's synchronous focus handler can open **another** SourceEditor session. After this nested latest open returned, the original outer `openSourceEditor` continued creating a session and overwrote it. Two source surfaces could remain visible at once, with the stale session becoming authoritative.

**Fix:** immediately after closing the previous editor, check the original owner signal again and check whether another reentrant session has already claimed `activeEditors.get(wrapper)`. If a successor exists, the superseded request returns a no-op handle. The most recently opened form remains the only authoritative session.

**RED:** the fifth test used a real source-editor `close()` path and signal-aware DOM `focus` event to synchronously open an HTML source editor while replacing a URL editor. Before the fix, the older URL request reactivated after HTML was opened. **4/5** passed.

**GREEN:** after the fix **5/5** passed. Opening the newest source, normal cancel and normal submission remain intact.

Commits: [test](https://github.com/Shelamkoff/editor/commit/ce3c3c090bed29626a1bc53aa9c09dfde6ec8f58), [fix](https://github.com/Shelamkoff/editor/commit/c7cd0ef7c61cddc26afae37afd480b7d84fe309c).

## SE-O1 — SourceEditor teardown removed a DOM surface reparented to a foreign host (P2)

The cached `SourceEditor` surface starts under its plugin wrapper. If a host later reparents it elsewhere, the former wrapper no longer owns the DOM node. On cache refresh or scope cancellation `ensureSurface().destroy()` previously executed unconditional `root.remove()`. This destructively removed the formerly owned node from a different host/container.

**Fix:** still abort all obsolete event listeners, close any current session and clear the wrapper's cache, but remove the surface DOM only if `root.parentNode === wrapper`. A node reparented to another owner is left in place for that owner; normal plugin-owned DOM is still removed.

**RED:** three new tests (cache replacement after reparent, original owner abort after reparent, and expected cleanup while still mounted under the original wrapper). Against the previous module, foreign-host cache refresh and owner abort failed, whereas ordinary original-wrapper cleanup passed: **6/8** total.

**GREEN:** all **8/8** new SourceEditor tests passed on exact production source in a controlled signal-aware DOM. The previous, independently registered `plugins/shared/sourceEditor.realm.test.js` also passed **1/1**, preserving owning-document and owning-realm behavior.

Commits: [tests](https://github.com/Shelamkoff/editor/commit/7c2a2393e0c53b63a1a02a0f2c6284be80328caf), [fix](https://github.com/Shelamkoff/editor/commit/a3d6388d7407ce9b6af98f6a304592f7852b0511).

## Verification details

- Scoped red/green runs evaluated the **unaltered production function bodies** of `plugins/shared/sourceEditor.js` plus the actual `plugins/shared/layer.js` layer management module, with a real abort-event contract implemented by a deterministic test controller.
- `plugins/shared/sourceEditor.reentry.test.js` is a source-level, public API test suite: it exercises only `openSourceEditor` and `preloadSourceEditor`, publicly observable callbacks, visible/hidden dialog state, retained DOM ownership and teardown. It does not invoke SourceEditor's cache or private helpers directly.
- The eight new cases plus the preexisting realm case pass in that targeted execution; this is **not equivalent** to complete Vite/Chromium user gestures or all `node --test` cases in an installed checkout.
- No other repository modules required editing; all three ownership/reentrancy flaws were corrected in their shared owning implementation.

## Follow-up gates

On the final SHA run locally `npm ci`, `node --test plugins/shared/sourceEditor.reentry.test.js plugins/shared/sourceEditor.realm.test.js`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, as well as physical IME, browser engines, and memory/retention checks. Keep prior green results scoped to their actual SHA and harness.

**Conclusion:** three proven SourceEditor defects closed with test-first evidence. Full-library Rector v2 stability and full v1 functional parity remain unverified.
