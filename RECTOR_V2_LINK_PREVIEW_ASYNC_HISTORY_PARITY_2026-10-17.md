# Rector v2 — LinkPreview: guarded asynchronous Undo/Redo parity

**Date:** 17 October 2026  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `9cf0101813a81b8c76f7de1a31c01d05570de057`  
**Code HEAD before this report:** `28e7f013845d01b5dd8ee667c8a1f80f4b64875b`  
**v1 reference:** `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`

## Summary

Closed the previously documented *adjacent URL authoring + delayed metadata history* discrepancy between v1 and v2. A submitted LinkPreview URL is still committed immediately and the asynchronous metadata fetch remains revocable. Its completion now **extends the same Undo/Redo record only when it safely belongs to the immediately preceding URL edit**. If another document mutation, Undo/Redo, a different field edit, or a newer URL update intervenes, the completion is a separate transaction/history step (when still authorized).

No legacy v1 runtime, migration path, compatibility facade, arbitrary last-record coalescing, or new persisted JSON fields were added.

**Verification boundary:** actual production `PersistentBlockMap`, `DocumentStore`, `HistoryStore`, `TransactionEngine`, `InstanceScope` and plugin factories were evaluated in isolated V8 using their committed tests and controlled dependency/DOM adapters. The complete `DocumentRuntime` and full `createEditor` browser acceptance on the final HEAD **have not run**. This is a focused parity improvement, **not proof that all Rector v2 behavior matches v1 or that the entire library is release stable**.

## Guarded continuation protocol

The protocol is opt-in for the result of an existing `DataTask`: `task.commit(producer, { mergeWithPreviousField: 'url' })`.

1. `InstanceScope` captures a canonical store **revision at task acquisition**. Its task may forward a one-shot `historyContinuation` token with the selected data field. No options are supplied to ordinary tasks.
2. `DocumentRuntime.update()` accepts the internal continuation only when the store is still at that **exact revision**; otherwise metadata remains a normal standalone update. The block ID comes from the owning instance context, not an untrusted plugin argument.
3. `TransactionEngine` validates the token before a transaction and passes it to the prepared `HistoryStore` update.
4. `HistoryStore` checks: the previous action is the immediately preceding single-block authoring update; its revision and block ID match; the named field **changed in the first record but not in the metadata record**; the first record's after snapshot equals the metadata record's before snapshot; there is no redo branch/replay boundary. Only then are the first `before` and final `after` composed into one record. The async completion closes ordinary native typing coalescence.

The store still publishes both canonical transactions and their revisions in order; only the adjacent history representation is folded. The new record preserves the first selectionBefore and the last selectionAfter.

No continuation can rewrite an older history record across an unrelated action even when the later data producer runs successfully. There is no time-based guessing or global mutable extension state.

## Commits

| Area | Primary changes |
|---|---|
| History boundary | [`04eb408`](https://github.com/Shelamkoff/editor/commit/04eb4085de3bf13898d6bfebb445d70bc7dde39e) |
| Scope revision lease | [`ae3fb8e`](https://github.com/Shelamkoff/editor/commit/ae3fb8edfb8111589130eb22571872146e8b4725) |
| Transaction validation/propagation | [`8f1d0df`](https://github.com/Shelamkoff/editor/commit/8f1d0dfc753905dd93e5b4e73b4ee3f1423ae3c1) |
| Runtime authority and store revision | [`a20341c`](https://github.com/Shelamkoff/editor/commit/a20341cb5a3748f5bdbfe0ffde22a44f7e00ef19) |
| LinkPreview explicit-submit opt-in | [`491edaf`](https://github.com/Shelamkoff/editor/commit/491edafb414a6d0642b4558320e7a5fd6c27b3ce) |
| Type/API documentation | [`f5e37d1`](https://github.com/Shelamkoff/editor/commit/f5e37d1590c85cdb8d57f57ed529b20108fc39a2), [EN](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/docs/guide/extensions.md), [RU](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/docs/ru/guide/extensions.md) |

## Executable evidence

| Test scope | Results | Evidence boundary |
|---|---:|---|
| Five new continuation tests of actual HistoryStore | **5/5 PASS** | RED before fix: 3/5; 2 failures specifically expected coalescence and sealing later typing |
| Three new InstanceScope revision/authority tests | **3/3 PASS** | Production scope with controlled AbortController |
| Three new TransactionEngine integration tests | **3/3 PASS** | Actual PersistentBlockMap + DocumentStore + HistoryStore + TransactionEngine, no-op projection |
| Seven existing HistoryStore tests | **7/7 PASS** | Production implementation under a deterministic V8 adapter |
| Existing replay-boundary tests | **8/8 PASS** | Actual core store/history/transaction code |
| Existing TransactionEngine tests | **28/28 PASS** | Actual `synchronousResult` and core modules, controlled microtasks |
| Existing InstanceScope tests | **17/17 PASS** | V8 strict-mode ESM semantics and controlled AbortController |
| Independent history/document model | **8/8 PASS**, 20,000 actions | 8 deterministic seeds x 2,500 mixed operations |
| LinkPreview production source-level fixture | **18/18 PASS** | Controlled DOM, task, URL and timer adapters |

**Additional registered tests requiring normal project execution:**
- `core/DocumentRuntime.test.js`: 2 revision-lease and intervening-host scenarios, registered but not executed as the full runtime suite.
- `tests/browser/native-plugin-parity.js`: 2 end-to-end URL/metadata Undo/Redo cases, one adjacent and one with an interleaved host template edit. Syntax-checked, not run in Chromium.
- Earlier Media/LinkPreview native IME/ABA cases remain registered and were not executed by this pass.

## Remaining release gates

The source connection permitted commits and per-file review, but the runtime container could not resolve `github.com` for cloning a full checkout. Therefore this pass did **not** run:

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

These must run against the **final HEAD**, including real Chromium/Firefox/WebKit keyboard/IME, native input ordering, Undo/Redo selection and caret, heap/resource lifetime, installed package exports and a broad v1/v2 gesture differential for all block and inline capabilities. In particular, the one-step LinkPreview history proof is conditional on an adjacent edit; delayed metadata after any intervening authoring command **correctly remains separate**, not force-merged.

This audit supersedes the previous report's statement that LinkPreview adjacent URL/metadata Undo parity is wholly open; it does not supersede that report's acceptance limitations or unresolved overall library parity.
