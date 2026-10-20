# Rector v2 — revocable InstanceScope DOM callbacks and committed generation authority

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `88ccb7b13b44ac4241fa1f1d887b0ec27b478c8a`  
**Production module:** `core/InstanceScope.js`  
**Regression suites:** `core/InstanceScope.test.js`, `core/InstanceScope.history-continuation.test.js`

## Requirements and scope

Continued Rector v2 source audit after Clipboard Paste lifetime fixes, this time examining `InstanceScope`'s public authority methods, staged→active→revoked lifecycle, generation/epoch checks, and callers in `core/DocumentRuntime.js`. Read project `.agents/skills/tdd/SKILL.md` and `RECTOR_V2_REMEDIATION_SPEC.md`, particularly **C5 §9.2** and **C1**.

Required behavior:
- A staged instance may read its detached future candidate but cannot author edits.
- An active instance may use `getData`, `createId`, `updateData`, `commitDomMutation`, or `beginTask` only while its own generation and editor control lease remain current.
- After `revoke` or a read-only round trip, old mutation callbacks do not execute the producer.
- Host DOM synchronization legitimately executes the supplied operation after entering its **projection-edit** phase. A guard must not reject this valid synchronous path.

No public API, persisted format or compatibility alias was added.

## Finding SCOPE-DEFERRED-DOM-1 — borrowed DOM callback could outlive its scope (P2)

`createAuthority().commitDomMutation(operation)` previously performed `#canMutate()` only when giving the raw author callback to the host. A host-provided `commitDomMutation` could retain it, revoke the instance or trigger a read-only round trip before invoking it. The raw callback then executed despite the retired owner.

Four test cases were committed **before the production correction**:
1. Defer the callback, revoke the scope, then invoke the retained callback. The author producer must stay inert.
2. Defer a callback, switch readOnly true→false, invoke the old callback; it must remain stale, while a **new** operation should work.
3. Revoke the owner, set it read-only or revoke its parent synchronously inside the host `commitDomMutation` handler before it invokes the callback.
4. Positive control: an ordinary active synchronous host callback must still run once and preserve its return value.

**RED:** against the original production blob `e23c0db808668ec78db15fe9110d0bbca2c6b57f`, **1/4** new tests passed and all three authority-regression tests failed as intended.

**Fix:** capture the current scope generation and interaction epoch and pass a **revocable wrapper**, not the raw operation. Recheck local lifecycle/epoch and actual committed generation at invocation time. Do **not** re-require `phase==='idle'` inside that callback, since `DocumentRuntime.syncBlocksFromProjection()` deliberately enters the editing phase before calling the operation.

Commits:
- [RED DOM callback tests](https://github.com/Shelamkoff/editor/commit/495ee580486cf886e88a664494f038a54b59e22c)
- [Revocable DOM producer correction](https://github.com/Shelamkoff/editor/commit/d3bcd30217f4c71d2fcc69924ea3f934ac8ddfa9)

## Finding SCOPE-ACTIVE-GENERATION-1 — local token alone authorized stale active data access (P2)

`InstanceScope` tracks an instance-local `#generation`, while the runtime also configures a dynamic `currentGeneration()` from committed `DocumentStore.generation`. The prior `#canMutate()` and `assertReadable()` checked local token/health/epoch but **did not require the active scope generation to equal the current committed generation**. A previous instance whose projection finalizer had not yet revoked it could therefore still execute `runMutation`, `updateData`, or read/create data identities after document replacement advanced generation.

Two regressions were committed first:
- Active scope with generation 4, host generation advanced to 5 before teardown: `runMutation` and `updateData` must not run, `commitDomMutation` must not dispatch, and `beginTask` must reject as stale.
- A **staged** instance with future generation 7 must still be allowed to read its candidate while committed generation is 6; once activated, active read/ID calls must reject until the committed generation matches 7.

**RED:** both tests failed against the first production correction (**0/2** new tests passed).

**Fix:** enforce committed-generation equality for active `assertReadable` (not staged reads), `#canMutate`, and task admission. Existing snapshot/getData and allocator after-callback validation still protects a scope retired while copying author data or allocating an ID.

Commits:
- [Generation boundary RED tests](https://github.com/Shelamkoff/editor/commit/5f79a0c4c6e7372f0d24a39ada5c30b9293cd327)
- [Active generation authority correction](https://github.com/Shelamkoff/editor/commit/b507907cbcd28bf1e679ee74b5586a1982d8e039)

## Finding SCOPE-GENERATION-REENTRY-1 — callback-based checks could themselves supersede authority (P2)

Even after checking `currentGeneration()` at the start of mutation/task admission, `#phase()` and `#currentRevision()` are separately injected callbacks; they can synchronously advance the document generation while still returning an apparently acceptable phase/revision. Previous final guards compared only the local token and could accept an operation/task for the now-obsolete generation.

Three new regressions were added:
- A phase callback returns `idle` but advances the real generation: no `runMutation` producer may execute.
- A revision callback advances generation during `beginTask`: no usable task may be created.
- A source `readData` callback advances the committed generation: active `getData` must throw `AbortError`, not return the obsolete author data.

**RED:** with the first generation fix, **1/3** tests passed; the two mutation/task admission cases failed as intended.

**Fix:** re-evaluate the committed generation after the external phase/parent guards and after the task's revision callback; check local epoch/generation again after these probes. Maintain an explicit positive regression that the actual DOM producer still runs when the host has already entered `editing-projection`.

Commits:
- [Reentrant generation RED tests](https://github.com/Shelamkoff/editor/commit/035fa5542a85b183bd4f24f772347d7f47623437)
- [Post-callback generation recheck](https://github.com/Shelamkoff/editor/commit/40cc43421d1769e08893167d8c67b8f53d587344)
- [Positive projection phase behavior](https://github.com/Shelamkoff/editor/commit/61d90de083e8fd3415142a5ab65b5640de9a4a1b)

## Test results and limitations

| Stage | Result |
| --- | ---: |
| New deferred DOM callback tests on original production | **1/4** passed (3 intended RED failures) |
| Generation authority tests on first fix | **0/2** passed (2 intended RED failures) |
| Reentrant phase/revision tests on second fix | **1/3** passed (2 intended RED failures) |
| Focused `InstanceScope` / history continuation suites after all corrections | **38/38 passed** |

The final check executed **actual current production bodies** from `shared/jsonData.js`, `shared/cloneEditorData.js`, `core/InstanceScope.js`, and both current `InstanceScope` test suites. It used a small isolated V8 test/assert adapter and a controlled AbortController/DOMException implementation; ESM imports were adapted for the harness. The current production blob was `f13ab47cc67ad40b20191acadc32fc8cc61d30ec` and tests `4fd9a588b362027ce447d2acafd204b32b857b93`.

This is **source-backed regression coverage, not native `node --test`**, Chromium, TypeScript typecheck or an end-to-end editor replacement/Undo test. The generation race tests intentionally model a committed generation change before explicit instance finalization; they prove defensive producer revocation at that seam rather than claiming a measured frequency in real browsers.

## Outstanding acceptance

From a complete checkout at the final branch HEAD:

```sh
npm ci
node --test core/InstanceScope.test.js core/InstanceScope.history-continuation.test.js \
  core/BlockReconciler.test.js core/TransactionEngine.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

In Chromium, test a staged inline and block candidate during `render`, commit/new generation, delayed `commitDomMutation` callbacks after replacement, readOnly true→false, parent revoke and old async task completion; check canonical model, DOM, history, field ownership and selection. Run the broader v1/v2 feature parity matrix separately.

**Outcome:** three related owner/generation authority defects corrected with RED/GREEN regressions and a positive projection-phase guard. The scoped **38/38** source-backed tests passed. Native/Chromium release gates and full v1 behavioral parity remain **unverified**.
