# Rector v2 — public control-input ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `1635d6da811dd64026827920848b97d5c0d69d5e`  
**Scope:** `EditorBlocksApi.select`, `EditorBlocksApi.focus`, `EditorBlocksApi.convert`, including their existing public runtime and browser tests.

## Contract and audit boundary

The v2 remediation specification (§5.1–5.2 and C6) requires external input preparation and explicit control authority, with no unprotected reentry from caller/plugin code into canonical mutations. An external iterable or accessor is executable application code. It must not run **between** an already-granted authority check and the editor/view operation that uses its result.

This pass does not add v1 compatibility aliases, migrations or a new persisted format. In contrast to other controller teardowns, public `editor.destroy()` from an ordinary synchronous `onCommit` observer is **already blocked** by `DocumentRuntime.assertControlAuthority()` during the engine's `publishing` phase. This audit does not claim that a forbidden publishing-phase destroy is a valid bug reproduction.

## Finding P1 — block-selection iterable could mutate or destroy the editor before selection dispatch

Previously `EditorBlocksApi.select(ids)` called `runtime.assertControlAuthority()`, then expanded caller-owned `[...ids]` outside the preparation boundary. A custom iterator could invoke a host `clear()` or `editor.destroy()` during that expansion. The stale method would subsequently invoke view/selection control after the document or owner had been replaced.

**RED evidence:** two added public API regressions cover an iterator invoking `handle.destroy()` and an iterator invoking `runtime.clear()`. Against the exact original `PublicEditorApi.js` source, an isolated real-class execution reproduced a destroyed owner followed by an old selection dispatch, and a document replacement followed by selection of the former ID.

**Fix:** expand the iterable under `runtime.prepareExtensionValue()`, then recheck live/control authority before dispatching a detached array of IDs. Ordinary arrays remain supported and are not retained by reference.

- [Tests `17515ed`](https://github.com/Shelamkoff/editor/commit/17515ed7cf6d0c69be82a64c28089171064c0549)
- [Fix `9fa7ee3`](https://github.com/Shelamkoff/editor/commit/9fa7ee3ea86c1abdd1e94bbc1cd26eaf0f5ed789)

## Finding P2 — focus target getter observed inconsistently by plug-in focus and logical caret

The same public `target` object was passed through `EditorViewModel.focus()` first to `InteractionState.focus() → BlockReconciler.focus() → instance.focus(target)`, then to `LogicalSelection.setCaret(id,target)`. Its `fieldKey`/`offset` getters could return different values on successive reads, so the native plugin focus and logical caret could use different author-supplied options.

**RED evidence:** an actual `EditorBlocksApi` instance with a controlled view reading the target twice observed `'title'` then `'caption'` from one public focus request. A reentrant option getter also demonstrated that reading caller data after dispatch authority was granted is an unsafe location for side effects. In the real mounted editor, plugin focus is guarded by presentation-projection authority; the reproducible core problem is the **inconsistent external option snapshot**, not a claim that the real plugin can always destroy the editor while focusing.

**Fix:** create one shallow snapshot of top-level focus options inside `prepareExtensionValue()`, preserving optional `undefined` fields and additional plugin-supported options. Recheck control authority before calling `view.focus`. No-target focus remains supported.

- [Tests `477bf87`](https://github.com/Shelamkoff/editor/commit/477bf87144cffc1130dee691686b9eb5a97fe4cd)
- [Fix `b226d61`](https://github.com/Shelamkoff/editor/commit/b226d6113ce55b790d9bdc9217f484530456d81b)

## Finding P3 — public conversion target getters executed inside the canonical draft-building phase

Previously `EditorBlocksApi.convert(id,target)` forwarded a mutable caller-owned target straight to `DocumentRuntime.convert()`. Its `target.type` and `target.toolboxItemId` were first accessed during `TransactionEngine` **building**, a phase in which nested host mutations are otherwise allowed to join the same draft. A getter could therefore start an unrelated update or teardown while the conversion command was being planned. That is not a supported capability of a conversion target.

**RED evidence:** two new regressions cover a `type` getter trying a nested model update and one trying editor destruction. Controlled execution of the previous production source reproduced a nested data update from the conversion getter and a destroyed owner. An ordinary conversion with `toolboxItemId: undefined` stayed green as a control.

**Fix:** invoke the public host-authority check before observing external target options, snapshot the top-level target inside `prepareExtensionValue()`, and recheck host authority before `view.convert()`. Keep optional fields intact and do not perform persisted JSON-format conversion on control-only options.

- [Tests `8b49cd8`](https://github.com/Shelamkoff/editor/commit/8b49cd8c019bf7f069461fed77ba4385503697ab)
- [Fix `3e55761`](https://github.com/Shelamkoff/editor/commit/3e55761734eaa5621799ef286bef6f03d628f8c2)

## Browser acceptance fixtures

Three test cases were registered in `tests/browser/runtime-contracts.js`:

1. A public selection iterator attempting `editor.clear()` must fail during protected input capture without changing selected IDs or authored blocks.
2. A public focus target getter must be read exactly once and leave the caret at the same logical offset.
3. A public conversion target getter attempting `editor.blocks.update()` must not run a nested canonical mutation.

[Browser regression cases `ff9b2bd`](https://github.com/Shelamkoff/editor/commit/ff9b2bd1fd9dcb912b80fea5ed441198aa1516e7).

The file was **parsed** successfully using an isolated JavaScript parser, but the tests were **not executed** in Chrome.

## Focused verification ledger

| Group | Newly added unit cases | Controlled source-level checks |
| --- | ---: | ---: |
| `blocks.select` | 3 | 3 / 3 passed |
| `blocks.focus` | 3 | 3 / 3 passed |
| `blocks.convert` | 3 | 3 / 3 passed |
| **Total** | **9** | **9 / 9 passed** |

Six cases reproduced failures in the old source-level adapter; three positive controls were green. The final checks executed the exact fetched current `PublicEditorApi.js` class source in V8 with a **small stateful DocumentRuntime/view adapter**, not the full `DocumentRuntime.js` or native DOM. The nine new unit tests are checked into `core/PublicEditorApi.test.js` and use the **real** DocumentRuntime through that file's existing fixture; however, `node --test` was not run here because the local git client cannot access GitHub and no complete checkout/dependencies were available in this environment. Do not treat adapter results as a complete acceptance pass.

## Required local verification

```sh
npm ci
node --test core/PublicEditorApi.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Compare public focus/selection/conversion outcomes with v1 user-level behavior where applicable, rather than restoring v1 API signatures. Test native focus, caret, history, rejected nested command state and connected block instances. Public mutations must remain available under requestedReadOnly where the v2 specification permits host commands.

**Conclusion:** Three public input-ownership findings were corrected with focused source-level evidence. Library-wide stability, Node.js/TypeScript acceptance and browser-verified v1 behavioral parity remain unverified on the current branch HEAD.
