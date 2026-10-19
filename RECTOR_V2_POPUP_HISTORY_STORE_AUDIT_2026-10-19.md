# Rector v2 — popup DOM ownership, history coalescence, and store no-op audit

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `f4b096a5aec9dae7a1e0164fa300229edeace5dd`

## Scope and method

This pass reviewed the active `RECTOR_V2_REMEDIATION_SPEC.md` (§5: canonical state/history, §9–10: owner lifetime) and `.agents/skills/tdd/SKILL.md`, then read current `core/InlinePopupHost.js`, `core/HistoryStore.js`, `core/DocumentStore.js`, `core/TransactionEngine.js` and their tests. Repository writes were direct commits to the existing refactor branch using each file's freshly fetched blob SHA; unrelated concurrent code was not overwritten.

Tests exercised real, current source bodies via isolated V8, with ESM imports adapted and synthetic DOM/AbortController/timer/assertion dependencies where necessary. **Neither a real Node.js `node --test` run nor Chromium/typecheck/package acceptance was executed.**

## POPUP-OWNER-1 — content adopted between validation and host insertion (P2)

`InlinePopupHost.showPopup()` correctly rejected content already connected/parented at initial admission, but then ran injected `isReadOnly()`, retired popup cleanup and DOM append callbacks before mounting the new element. A callback could transfer the candidate content to another detached application subtree. The old code then moved the now-foreign content into the editor's popup or published an empty popup shell if its child moved during the host append.

**RED:** two new tests fail against the old actual `InlinePopupHost` source: an `isReadOnly()` callback claims the content after initial validation, or a `root.appendChild` callback reparents the child during native-style connection.

**Fix:** repeat detached-content validation after control preflight and after cleaning the displaced popup, before claiming the candidate. Check popup child and shell parent/realm ownership after potentially reentrant DOM insertions, before final publication; undo only host-owned shell DOM and settle provisional cleanup exactly once. Rollback never deletes a shell adopted by another application.

- [RED tests `42892e9d`](https://github.com/Shelamkoff/editor/commit/42892e9de729f91717869650c6cbd1218087237b)
- [Fix `44ff6a99`](https://github.com/Shelamkoff/editor/commit/44ff6a99ad2c1dbed58d71ad9864a42a0449120d)
- [Additional positive controls `f66c0369`](https://github.com/Shelamkoff/editor/commit/f66c03693b520d76985828630f65495ff35f9661)
- [Real native custom-element browser regression `df5ba1db`](https://github.com/Shelamkoff/editor/commit/df5ba1dbef76e6f10daec48980aac6ff3f66d460)

**Focused GREEN:** the entire fetched `core/InlinePopupHost.test.js` suite passed in isolated V8: **18/18 tests, 97 assertions**. The added `tests/browser/runtime-contracts.js` custom-element `connectedCallback` test is **written, not run in Chromium**. That test verifies the actual owner-document DOM callback instead of relying solely on FakeDOM.

## HISTORY-CONTINUITY-1 — coalescing mismatched transitions loses an Undo boundary (P2, defensive invariant)

`HistoryStore.compatibleUpdate()` previously compared transaction origin/name/group, change kind and block ID, but not whether the first update's canonical `after` state equals the second update's `before` state. When those records are nonadjacent, the history could merge them into one `before(first) → after(second)` entry, omitting the distinct transition.

**RED:** a focused test prepared a `first→second` entry followed by a `unrelated→third` entry with `coalesce: true`; pre-fix the history mistakenly reported `coalesced=true` and lost one Undo step. A positive control used the same canonical JSON under differing object-key insertion order to require valid coalescence.

**Fix:** require `equalJsonValue(previous.after, next.before)` for ordinary update coalescence, following the existing exact-continuity guard used for async history continuations.

**Qualification:** the normal transaction engine generally prepares history from contiguous committed state, so this test establishes a hardening of the history boundary, **not proof of a user-visible v2-only regression on the ordinary typing path**.

- [RED and positive-control tests `22209f33`](https://github.com/Shelamkoff/editor/commit/22209f33254ff6284bb5a73c056ed800f6c36bcb)
- [Fix `e0d5a296`](https://github.com/Shelamkoff/editor/commit/e0d5a2969d62b53b4b3143fa1c9a430340576ae2)

**Focused GREEN:** **9/9 `core/HistoryStore.test.js`** test bodies passed against current real HistoryStore and `shared/jsonData.js` in isolated V8.

## STORE-NOOP-1 — identical drafts created false changes (P2)

`DocumentDraft.update()` cloned its input through `ownBlock()` and compared that new clone by identity with the old frozen record (`next === current`). This condition was unreachable in valid normal updates. Hence an otherwise identical block update created an unnecessary `block.update` record, causing a nonempty draft that downstream engine callers could publish as a false history/event step.

**RED:** a test updated the same block with equivalent canonical nested JSON but reversed object-key order; the old draft incorrectly generated one `block.update`. The same test asserts that a real text edit still produces one correct before/after change.

**Fix:** use shared `equalJsonValue(next, current)` to detect canonical JSON equality without conflating object-key order with a real edit. This preserves the unchanged frozen-record identity, avoids false draft changes, and leaves actual updates untouched. `DocumentRuntime.update()` already has its own high-level no-op guard, but this check closes the underlying draft contract for other internal transaction paths.

- [RED test `bb7533d8`](https://github.com/Shelamkoff/editor/commit/bb7533d82b0e908cfe09e8e12e6a8b5751bd841c)
- [Fix `53dcb335`](https://github.com/Shelamkoff/editor/commit/53dcb33574830dbcdc02c2cadfcf9f6c161d138a)

**Focused GREEN:** **10/10 `core/DocumentStore.test.js`** test bodies passed (58 assertions) against current real `DocumentStore`, `PersistentBlockMap`, and `shared/jsonData.js`.

## Transaction regression and verification

To guard against accidentally changing the transaction/historical semantics, the actual current `DocumentStore`, `HistoryStore`, `TransactionEngine`, persistent AVL index, and source observer/thenable helpers were loaded together and the full existing `core/TransactionEngine.test.js` test body suite was executed through isolated V8 with a microtask and Node-style assertion adapter.

| Test or check | Isolated source execution | Real Node/Chromium |
| --- | ---: | --- |
| `core/InlinePopupHost.test.js` | 18/18 tests, 97 assertions | Not run |
| `core/HistoryStore.test.js` | 9/9 tests | Not run |
| `core/DocumentStore.test.js` | 10/10 tests, 58 assertions | Not run |
| `core/TransactionEngine.test.js` | 45/45 tests, 242 assertions | Not run |
| Native custom-element ownership browser regression | Authored | Not run |
| TypeScript/declaration/package and v1 parity suite | Not run | Not run |

These are focused source-level checks and must not be treated as an npm acceptance certificate. Existing synthetic DOM/runner adapters cannot simulate all browser Custom Elements, native selection and composition behavior, package imports, or CSS/runtime errors.

## Required local acceptance on final HEAD

```sh
npm ci
node --test core/InlinePopupHost.test.js core/HistoryStore.test.js core/DocumentStore.test.js core/TransactionEngine.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Specifically test a native `connectedCallback` that reparents popup content during mounting, DOM-content and shell adoption before/after cleanup, typed text Undo groups, no-op updates with different JSON property order, and the full editor render-to-history-to-observer lifecycle.

## Conclusion

The pass fixes two source-level owner/semantic bugs and hardens history continuity. The local acceptance suite and end-to-end behavioral parity with Rector v1 remain unverified. A successful targeted isolated V8 run is **not** evidence that the entire library is stable or fully at parity.
