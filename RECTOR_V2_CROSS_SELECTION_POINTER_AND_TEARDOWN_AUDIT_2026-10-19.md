# Rector v2 — cross-block SelectionController pointer and teardown ownership

**Date:** 2026-10-19  
**Repository / branch:** `Shelamkoff/editor` / `refactor/rector-v2-architecture`  
**Starting HEAD:** `ce9f3d171bfc4904331de8a877c3fc1043eb17b3`  
**Production:** `core/SelectionController.js`  
**Tests:** `core/SelectionController.test.js`

## Contract and method

Continued the architecture and behavioral-parity audit of the core native/cross-block selection owner under the active `RECTOR_V2_REMEDIATION_SPEC.md` C6 selection/interaction ownership contract and `.agents/skills/tdd/SKILL.md`. A selection drag/range or whole-block author choice belongs only to the still-live controller and original document/control epoch. Native DOM adapters and observers can synchronously destroy an editor or advance its generation/revision/mode. After such callbacks, stale selection handlers must not recreate drag state, select obsolete blocks, dereference a cleared session or leave event listeners without a destroyable owner.

Used GitHub connected source reads at the latest branch state. Every commit updated the precise current blob SHA; other agents' work was not overwritten. Source-level testing used the fetched actual `SelectionController` and actual `shared/textOffset.js` + `shared/richTextCaretPadding.js`, with isolated V8 `test`/`assert`, AbortController and minimal fake-DOM adapters.

## SEL-OWNER-1 — partially registered native event listeners survived failed construction (P2)

The constructor installed root `mousedown`/`dragstart` and document `mousemove`/`mouseup`/`selectionchange`/`mousedown` listeners without a rollback boundary. An event host that throws after registering the `selectionchange` listener leaves the earlier listeners attached, but the constructor never returns the controller instance needed to destroy them.

**RED:** the newly added regression failed on baseline source because the event host retained listeners.  
**Fix:** acquire all listeners inside one provisional registration `try` block. Abort their shared signal if any registration fails, preserving the original exception.

## SEL-OWNER-2 — native mouse callbacks could resurrect canceled selection drags (P2)

`#onMouseDown()` originally performed only a check at ingress. Its hit-testing and `resolveEditableTarget()` callbacks could destroy the controller and still return a logical point. The method then cleared/recreated selection state and published a new drag on a destroyed owner.

`#onMouseMove()` similarly called `#dragCaretFromPoint()` and field/geometry resolvers while holding no stable drag lease. If a geometry callback destroyed the controller, its `#dragStart` became null. The old continuation then dereferenced `this.#dragStart.point` and threw a `TypeError`.

**RED:** two independent new tests reproduced a resurrected drag and a post-destroy `mousemove` exception.  
**Fix:** capture generation/revision/mode at mouse ingress and recheck after each host hit-test/point callback, after teardown of old selection, and before issuing a new drag. Mousemove retains the original drag object locally and requires that same object and its generation remain current after every geometry, selection and DOM callback. Native focus/drag presentation is skipped after revocation.

- [Initial RED tests `ce528f02`](https://github.com/Shelamkoff/editor/commit/ce528f02882e7271e4ea3a67014673ecffde4fce)
- [Fix `98011bbf`](https://github.com/Shelamkoff/editor/commit/98011bbfb34aeb44f96398f10c7c2360e0129ac3)

## SEL-OWNER-3 — public selection API could publish stale blocks/native ranges (P2)

`selectBlocks(ids)` checked controller liveness before iterating membership checks, but `runtime.has(id)` is a fallible callback that can synchronously destroy the scope. The method then still invoked `view.select(ids)` after teardown. Likewise `activate(range)` could resolve its first native endpoint through a callback that destroys the controller while returning an old rich-text field; it then published a valid-looking cross-block range and selected blocks after the owner was dead.

**RED:** new public API regressions showed an obsolete whole-block selection and `activate()` returning true for a detached owner. The range test explicitly uses two different canonical block IDs so that it tests an actual cross-block range rather than an invalid same-field selection. The fixture also maintains the selected-ID state.

**Fix:** bind `selectBlocks()` and `activate()` to captured document generation, revision, control-mode epoch and terminal AbortSignal. Revalidate after ID membership, native endpoint/Selection/Range reads and before publishing selections. No new outward API or persisted-data shape was introduced.

- [RED tests `3fd1592b`](https://github.com/Shelamkoff/editor/commit/3fd1592b7166a8f0158d21665ff7776bfa21b5ef)
- [Fixture corrections `da285b8f`, `68309782`, `de803ca2`](https://github.com/Shelamkoff/editor/commit/de803ca29d51d1e20d9f98953714e8b591e6fd2e)
- [Fix `b2455167`](https://github.com/Shelamkoff/editor/commit/b2455167816810f57a969df9b0b972bf991bae46)

## SEL-OWNER-4 — destroy was reentrant and fallible (P2)

`destroy()` previously invoked `clear()` and therefore `view.clearSelection()` **before** aborting the listener scope. A host observer could synchronously call `destroy()` again, recursively cleaning the same owner. A throwing cleanup observer could prevent the subsequent `controller.abort()`, keeping retired native event listeners operational.

**RED:** one test observed three nested cleanup calls where exactly one is expected; another observed an exception escaping teardown and consequently failed the requirement that retained native callbacks be inert.

**Fix:** abort the listener/owner signal at the beginning of destroy, make further destroys return immediately, retire logical range/drag bookkeeping, and independently attempt class cleanup, view selection release and CSS Highlight release so one fallible callback cannot block the rest.

- [RED tests `e82c93c6`](https://github.com/Shelamkoff/editor/commit/e82c93c6a1bbab9b0da8fe65e63f07b2386e7728)
- [Fix `fb52962e`](https://github.com/Shelamkoff/editor/commit/fb52962e8e9a3ff63f64c969304b2c02089661b7)

## Focused verification and limits

The same **complete final 50 test bodies** from `core/SelectionController.test.js` were run against the original and fixed production source.

| Production | Passing | Failures | Assertions exercised |
| --- | ---: | ---: | ---: |
| Baseline blob `b81bba9470bf7fb75d82950df836b84eb84e15d4` | **43/50** | All seven new regressions RED | 190 |
| Final blob `29f3d6a9432d6d5d0b2a031a5237b2ad14a9d448` | **50/50** | 0 | **196** |

The seven RED failures directly observed retained event listeners, resurrected drag state, native mouse error, obsolete selected blocks, accepted range from a dead owner, duplicate destruction or escaping teardown error. All baseline tests retained their passing behavior. No red/green claim is based solely on reading private fields.

**Important limitation:** this evaluation used actual fetched JavaScript source and full test bodies in an isolated V8 adapter with synthetic DOM and AbortController. It was **not** a real repository checkout, `node --test` run, TypeScript typecheck or Chromium/native Selection/IME run. Complete Rector v1/v2 feature and gesture parity remains unverified.

## Local acceptance on final HEAD

```sh
npm ci
node --test core/SelectionController.test.js core/LogicalSelection.test.js core/LogicalSelection.ownership.test.js
node --test core/KeyboardRouter.test.js core/DragController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In real Chromium: cross-block mousedown→mousemove→mouseup, document-owner replacement during caret hit testing, read-only/generation changes during selection, public `blocks.select` and `restore`, focus/IME while selecting across hosts, and destruction from a selection observer. Verify no post-destroy DOM callbacks, no stale native caret, no orphan CSS Highlights, and correct Undo/Redo for subsequent author actions.

## Conclusion

This pass corrected four related cross-selection ownership and teardown defects, backed by seven failing-first regressions and the complete focused suite going from 43/50 to 50/50. It does **not** certify the complete library as stable or behaviorally identical to Rector v1 without the final full local acceptance gates.
