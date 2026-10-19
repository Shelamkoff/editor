# Rector v2 — transaction oracle, optional animator cleanup, and tooltip owner reentry

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `51226ddf9337adacf86d6f99807c09d183767ca6`  
**Scope:** `core/TransactionEngine.js`, `core/HistoryStore.js`, `core/DocumentStore.js`, `core/ProjectionAnimator.js`, `core/Tooltip.js` and their focused regression suites.

This pass follows `RECTOR_V2_REMEDIATION_SPEC.md` §5.2–5.3 (transaction and observer isolation), the owner-lifetime and post-commit cleanup requirements, and the repository TDD skill. Before modifying production files, source and tests were fetched at the current branch HEAD through the authorized GitHub connector. Direct branch commits were made using fresh blob SHAs; no unrelated or parallel agent edits were overwritten. No old v1 wire-format/API compatibility shim was added.

## 1. Transaction and history conformance check — no production change required

Re-executed the fetched actual transaction/history/store source in an isolated V8 runner with the project's test bodies and Node-style assertion adapters:

| Source tests | Cases | Outcome |
| --- | ---: | --- |
| `core/TransactionEngine.test.js` | 45 | 45 PASS; 242 assertions |
| `core/HistoryStore.continuation.test.js` | 9 | 9 PASS |
| `core/HistoryStore.replay-boundary.test.js` | 8 | 8 PASS |
| `core/TransactionEngine.history-continuation.test.js` | 5 | 5 PASS |
| `core/TransactionEngine.replay-lifetime.test.js` | 2 | 2 PASS |
| `core/HistoryStore.model.test.js` | 8 | 8 PASS, 183,382 assertions |

The model file exercised eight deterministic seeds, **2,500 operations each (20,000 total)**, against an independent before/after-document and Undo/Redo history snapshot oracle. Its `structuredClone` helper was replaced in the V8 adapter by the fetched project's JSON clone helper for canonical JSON documents; no production algorithm or oracle expectations were modified. The other source files used the actual fetched `DocumentStore`, `PersistentBlockMap`, `HistoryStore`, `TransactionEngine`, JSON semantics, `synchronousResult`, and `invokeObserver`.

**Total transaction/history cases verified in isolation: 77/77.** No new transaction-engine issue was confirmed by these checks, so no speculative change to C1 commit or replay sequencing was made. This does **not** certify full Node.js, browser, plugin or v1/v2 feature parity.

## 2. ANIM-1 — optional spacer allocation failure interrupted other animations (P2)

`ProjectionAnimator.animateRemovals()` created and decorated a spacer before entering its existing DOM insert/animation catch. A failed `ownerDocument.createElement('div')` (or other early host DOM callback) escaped entirely. The renderer invokes this visual-only work during `BlockReconciler` finalization *after the document commit*. Thus optional presentation failure could interrupt the remaining visual-only operations and resource-retirement sequence.

**RED:** new test supplied two independent removal snapshots and a DOM adapter whose first spacer allocation throws, then succeeds. The original implementation propagated `Error: optional animation DOM unavailable` and did not attempt the later snapshot.

**Fix:** contain each snapshot's complete allocation, decoration, insertion, animation registration and provisional cleanup in an independent error boundary. On failure, abandon only the provisional spacer; never detach a node adopted by another DOM owner. Continue attempting later independent snapshots.

- [RED tests `85f4bdd4`](https://github.com/Shelamkoff/editor/commit/85f4bdd446a626eb0acb30140c5ebf714c23de2a)
- [Fix `07b23a78`](https://github.com/Shelamkoff/editor/commit/07b23a78da634db969eb86dd93694a80d7f43c53)
- [Scope formatting `c7477839`](https://github.com/Shelamkoff/editor/commit/c7477839cbf79736ed5ce2e0c7ffb8d7b1c86b7a)

## 3. ANIM-2 — one broken spacer removal stranded independent resources (P2)

`#clearSpacers()` previously iterated its map and called `spacer.remove()` without per-spacer containment. If one adapter threw, later independent spacers were not released and the ledger remained active. Completion callbacks likewise risked leaking exceptions from visual-only DOM removal.

**RED:** a second new regression created two live spacers and made the first one's `remove()` throw. `animator.destroy()` threw and left the independent sibling attached.

**Fix:** retire the complete spacer ledger before calling fallible DOM adapters; release each independently, and contain a broken removal. The same best-effort boundary applies to completion/cancellation of a single spacer. Any node whose parent no longer matches the original owning container is left with its newer owner.

**GREEN:** **10/10 complete `core/ProjectionAnimator.test.js` test bodies, 33 assertions**, against the final formatted source in isolated V8. Both added regressions first failed against the old class, then passed after the fix.

## 4. TIP-1 — reentrant tooltip scheduling could retain obsolete timers (P2)

`Tooltip.show()` assigned `this.#timer` from the return of `window.setTimeout()` directly. A supplied timer host could synchronously call `show()` or `destroy()` during registration. The old outer call then overwrote the newer timer handle or retained a timer after destruction. A callback invoked synchronously during registration could also leave an already-fired handle erroneously pending.

**RED:** new tests showed a superseded live timer, a timer owned by a destroyed tooltip, and a completed inline callback resurrected as a pending lease.

**Fix:** capture the epoch and callback-completion state before registration; after the host returns, publish the handle only for the still-live matching owner. Clear returned stale handles without affecting a successor; never retain a completed inline callback.

- [Initial RED tests `ce69a575`](https://github.com/Shelamkoff/editor/commit/ce69a5756506b906c025957c9658af980e1ecf76)
- [Test host dequeue correction `d3991980`](https://github.com/Shelamkoff/editor/commit/d3991980a8182dfb9cdb64c55787e4b90ee7ae4d)
- [Fix `9a3d5a37`](https://github.com/Shelamkoff/editor/commit/9a3d5a37e9aba8d7815321bd08590443bc4384b2)
- [Inline-fired regression `0a2a4a66`](https://github.com/Shelamkoff/editor/commit/0a2a4a665994d18fb0be26a1af42d0396abf7d60)

## 5. TIP-2 — a clearTimeout host callback could overwrite successor presentation (P2)

During `show()` replacement, `hide()` cancelled a previous timer. A reentrant `clearTimeout` callback could create a newer tooltip, but the enclosing older `show()` continued after `hide()` and scheduled itself over the successor.

**RED:** controlled test found two handles `[2,3]` rather than the sole successor handle `[2]`; the outer abandoned caller had allocated handle 3.

**Fix:** capture the owner epoch before `hide()` and abandon the old caller if `hide()` installed a successor or destroyed the tooltip.

- [RED test `90f3f95f`](https://github.com/Shelamkoff/editor/commit/90f3f95fd1628d3377a420bd32772c33082095b2)
- [Fix `1aeafc88`](https://github.com/Shelamkoff/editor/commit/1aeafc8838a2573eb0dab69f36922d3d2bc17b07)

## 6. TIP-3 — obsolete timer wrote visible/ARIA state after DOM callback reentry (P2)

The delayed display callback checked its generation after geometry measurement, but then called fallible DOM `replaceChildren()`, `append()`, and `anchor.getAttribute('aria-describedby')` without immediate revalidation. Child removal can notify another custom-element owner; an external ARIA accessor can also open a successor tooltip. The previous callback could continue and show stale content or re-attach a retired ARIA id.

**RED:** one test reentered `show()` from `replaceChildren()` and reproduced stale `display:flex`; another reentered from the old anchor's ARIA getter and reproduced the obsolete `aria-describedby` value.

**Fix:** recheck the owner epoch immediately after child replacement/badge insertion and again after reading the current ARIA attribute, before publishing any associated old value.

- [DOM replacement RED `0b7c6fcd`](https://github.com/Shelamkoff/editor/commit/0b7c6fcd07b48e1a299f001d675005924234a215)
- [Fix `77f9e412`](https://github.com/Shelamkoff/editor/commit/77f9e412657a0fa49e489358924ae2ee05ca1026)
- [ARIA getter RED `01a9577b`](https://github.com/Shelamkoff/editor/commit/01a9577b194c7996889235c9ac2442b1027409ff)
- [Fix `3d31d925`](https://github.com/Shelamkoff/editor/commit/3d31d9254ae0911baac99fe2bbf4026c95ca21d3)

**GREEN:** **15/15 complete `core/Tooltip.test.js` test bodies, 54 assertions**, evaluated against the final source in isolated V8 using the test harness with a synthetic timer host and document. Four of the new timer scenarios were also compared against the original Tooltip implementation: 9/13 passed before the fixes, 13/13 after. The two subsequent DOM/ARIA scenarios each failed against the intervening source and passed after their own production fix.

## Verification summary and acceptance boundaries

| Area | Actual checked outcomes | Remaining validation |
| --- | --- | --- |
| Transaction/history suites | 77/77 | Full Node runner and integration |
| Independent snapshot oracle | 20,000 actions, 8/8 seeds, 183,382 assertions | Browser/native user gestures |
| ProjectionAnimator | 10/10 in isolated V8 | Real DOM/WAAPI/custom-element timing |
| Tooltip | 15/15 in isolated V8 | Native browser event/timer/ARIA checks |
| All focused tests together | **102/102 test bodies passed** under the described adapted executions | Full `npm test` and typecheck |
| End-to-end Rector v1/v2 behavioral parity | Not established | Dedicated local acceptance matrix |

These checks execute real fetched production modules with limited module-import adaptation and synthetic collaborators. They do **not** constitute the standard Node `node --test` process; browser integration, actual CSS animation timing, package exports, performance and native IME were not exercised. No claim is made that arbitrary malicious same-origin JavaScript is sandboxed; these are normal authoring/observer authority safeguards against stale and fallible callbacks.

## Required local acceptance on the final HEAD

```sh
npm ci
node --test core/TransactionEngine.test.js core/TransactionEngine.history-continuation.test.js core/TransactionEngine.replay-lifetime.test.js
node --test core/HistoryStore.continuation.test.js core/HistoryStore.replay-boundary.test.js core/HistoryStore.model.test.js
node --test core/ProjectionAnimator.test.js core/Tooltip.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium test an interrupted remove animation with one failed spacer, simultaneous independent animations, custom tooltip child-removal callbacks that install a successor tooltip, and native focus/ARIA updates. Confirm successful canonical commit and Undo/Redo, no unhandled Promise rejections, no stale ARIA IDs, and exactly-once resource teardown.

## Conclusion

This pass found and corrected actual optional-animation and tooltip owner-lifetime defects with failing-first regressions, while extending the transaction/history audit without inventing unproven engine bugs. Global library stability and full functional/behavioral parity with Rector v1 remain open until the full project and browser acceptance suite passes on the final branch.
