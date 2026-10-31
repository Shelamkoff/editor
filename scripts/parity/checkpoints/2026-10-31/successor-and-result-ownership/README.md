# Successor ownership and prepared-result continuation — 2026-10-31

This checkpoint records three bounded fixes published after `5572d03980e531e9647fcec29008c427a599add7`: renderer disposal must preserve a later owner of the same key; LinkPreview cancellation must preserve a request started by an abort observer; and scoped core writes must retain authority through the complete capture of their proposed data. It records actual source-specific RED/GREEN evidence. The combined frozen-source run completed all eleven gates successfully; its identity and actual results are recorded below.

The fixes preserve legitimate current behavior, including renderer reuse, reentrant successor publication, asynchronous metadata history and successful instance remounts. They do not restore inferior historical behavior or introduce another document store, task owner or global reentry ban.

## 1. Publication sequence and evidence identity

Repository: `Shelamkoff/editor`. Branch: `refactor/rector-v2-architecture`.

| Role | Commit | Published scope |
|---|---|---|
| Continuation starting point | `5572d03980e531e9647fcec29008c427a599add7` | Previously published source; isolated counterexamples below use this baseline. |
| Attaches documentation correction | `d888217a0292120689354c8360ff994fb87a76df` | Only `plugins/attaches/README.md` and `plugins/attaches/README.ru.md`: describe the current files-array contract. No production change. |
| Renderer fix | `996206038e0c0358eac185d296bf7b84e766ea5c` | Exact-owner disposal snapshots and Node/browser regression coverage. |
| LinkPreview fix | `072f5290f8d7bb6e773fa3d3aab42cf33cd1062f` | Retire the old metadata-request slot before notifying abort observers. |
| Core fix | `ad153941a29d39c111970ea12e1c7c09e63ef10a` | Validate the scoped owner after complete result/schema capture and before transaction application. |
| Frozen combined proof source | `fad69ef82293fcac28b5be756e3a7118a2c4750f` | Published source for the final Attaches replay and combined gates; all eleven gates passed. Tree: `0b114d129a4416c84b86df63eb4c488196bb2d53`. |

These commits were published as separate completed slices. The earlier per-slice runs are attributed to the baseline or working candidate actually exercised, not retroactively described as clean runs of the later publication commits. While the agents worked, other slices had independent working-tree edits. The isolated RED/GREEN runs and recorded file identities distinguish their sources.

During preparation of this checkpoint, read-only inspection of the Git objects confirmed that each published slice contains the same production and fixture bytes as its final candidate identified below. This comparison verifies publication identity; it is not an additional test execution. No repository source or test file was changed, and no new test was run while drafting this checkpoint.

All new raw output listed here is in ignored `test-results/`. Reproducible test sources are committed. A local log path is an evidence locator, not a promise that ephemeral output is included in a source checkout.

## 2. Renderer: a retiring operation must not destroy a successor

Published fix: `996206038e0c0358eac185d296bf7b84e766ea5c`.

### Observable failure

Full `EditorRenderer.destroy()` previously captured map keys and later read the then-current owner under each key. A disposer for the first output could legitimately retire a sibling and publish a successor into the sibling's container. When the outer destroy reached that saved key, it destroyed the successor rather than the original captured output. The same error occurred when a new standalone block reused an already released `HTMLElement`.

Direct replacement through `renderTo()` also exposed the bug: the successor could keep the existing wrapper while changing the entry that owned it. Container or wrapper identity alone therefore could not distinguish the retired output from the successor.

The two focused Node counterexamples expected disposal of `first` and `second`; the baseline additionally disposed `replacement`. The real-DOM fixture reproduced four failures: explicit sibling release/remount, direct sibling replacement, replacement followed by a throwing disposer, and standalone element reuse. An independently created output under a different container key already survived on the baseline and remains a positive control.

### Minimal production change

`destroy()` now snapshots `[key, owner]` entries from the mounted-container, detached-document and detached-block maps before invoking any disposer. It processes a captured entry only when the map still contains that exact owner. A removed or replaced entry no longer grants the outer operation authority over a later publication.

Existing disposal order, ownership relinquishment before callbacks and per-output error containment remain intact. All still-owned captured outputs are attempted even if a disposer fails. Single-target cleanup remains a direct map lookup. Detached-document entries receive the same ownership rule; this slice does not invent a DOM factory that reuses document wrappers to manufacture a detached-document counterexample.

### Committed files and controls

- `renderer/EditorRenderer.js`: the narrow change to disposal snapshots.
- `renderer/reentrancy.test.js`: same-container successor and released-element successor regressions, including subsequent explicit disposal and idempotence.
- `tests/browser/renderer-successor-disposal.js`: five real-DOM cases.
- `tests/browser/renderer-lifetimes.html`: registration of that fixture alongside the existing lifetime and publication checks.

The browser cases check exact old/new disposer selection after renderer re-registration, disposal order for three original outputs, progress after an intentional disposer exception, successor DOM retention, same-wrapper and new-wrapper cases, exact released-element reuse, incremental reuse, caller input preservation, release of retired CSS, retention and later release of successor CSS, target cleanup, repeated cleanup and renderer reuse. The independent-container case passes both baseline and candidate. All five final candidate cases complete with no fixture errors and 106 immutable observations whose values agree with their statuses.

The pre-existing frozen lifetime-parity fixture and the earlier publication-ownership fixture were not edited.

### Executed evidence

Evidence directory: `test-results/renderer-successor-disposal/`.

| Run | Executed source / fixture | Actual result |
|---|---|---|
| First focused Node RED | Pre-fix renderer and the mounted-successor test; `node-mounted-red.log` | 0 PASS / 1 FAIL; exit 1. |
| Expanded focused Node RED | Pre-fix renderer and both new successor tests; `node-red.log` | 0 PASS / 2 FAIL; exit 1. Both failures show the unintended `replacement` disposal. |
| Reentrancy Node GREEN | Patched renderer; `node --test renderer/reentrancy.test.js`; `node-green.log` | 48/48 PASS; exit 0. |
| Related renderer Node GREEN | All sorted top-level `renderer/*.test.js` passed as arguments to `node --test`; `node-renderer-suite-green.log` | 145/145 PASS; exit 0. |
| Final browser RED | Isolated worktree `/tmp/rector-renderer-disposal-red-yxfkalbh`, exact `5572d039…`, overlaid with the final new fixture and registration page | 36 total: 32 PASS / 4 FAIL; exit 1. |
| Final browser GREEN | Working candidate on `d888217…`, with the patched renderer and exactly the same fixture/page | 36/36 PASS; exit 0. |

Both final browser runs used:

```sh
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome \
EDITOR_BROWSER_PAGE=renderer-lifetimes.html \
node tests/browser/run.mjs
```

`browser-red-source.json` and `browser-green-source.json` record the command, working directory, HEAD before/after, exit status and source hashes before/after. The recorded renderer, fixture and page hashes remained stable within each run. The `5572d039…` to `d888217…` transition changed only the two Attaches README files, so the renderer production baseline is equivalent. The Node logs corroborate the failures and passing suites; the paired browser manifests provide the more detailed immutable source attribution for this slice.

### Source hashes and excluded observation run

| File / phase | SHA-256 |
|---|---|
| `renderer/EditorRenderer.js`, baseline RED | `7558ed762e7aac7082d418b5d7d28a92a1bbf6c382f1ba3ffda2161d525f92c6` |
| `renderer/EditorRenderer.js`, candidate and published fix | `3c242adc256c6373125d76d1f2b96d719cca0db595d2128f8bde3369498a0aaf` |
| `renderer/reentrancy.test.js`, published tests | `67a34b9f9b461b26e88f521360b31492f0737ed4a8d13a6d32beba11ed7d711a` |
| `tests/browser/renderer-successor-disposal.js`, final RED/GREEN | `acf7f18932c18e0722e4c65b4690e45a8414a6b5a5b7779dd27114ed368f5ae8` |
| `tests/browser/renderer-lifetimes.html`, final RED/GREEN | `bf7a9b86fe245428ffd90026e982beed536e92f77d88629ca467cdc4eba37816` |

An earlier browser run retained observation arrays by reference. Later cleanup mutated the raw values after their PASS/FAIL status had been computed. Its exit 0 is **excluded from the accepted evidence**. That output is preserved separately as `browser-green-mutable-observations.log` and `browser-green-mutable-observations.exit-status`.

The final fixture snapshots both actual and expected values at observation time. Both final RED and GREEN were rerun with that corrected, identical fixture. The retained failed baseline and healthy independent-key control prevent the fixture correction from concealing the production failure.

## 3. LinkPreview: abort observers retain their successor request

Published fix: `072f5290f8d7bb6e773fa3d3aab42cf33cd1062f`.

### Observable failure

Refreshing LinkPreview metadata used to cancel the current task before clearing its slot and advancing the request generation. `AbortSignal` listeners run synchronously during cancellation. A listener could submit a newer request, after which the older outer refresh continued and superseded that request.

The real-browser baseline demonstrated three distinct effects: a same-URL successor caused an extra provider call; a different-URL successor lost its completion rights; and a read-only/editable round trip during cancellation allowed the retired outer refresh to restart metadata. These are observable request and document/history failures, not assertions against a private counter alone.

### Minimal production change

`resolveMeta()` captures `retiredTask`, clears `currentTask` and advances `generation` before calling `retiredTask.cancel()`. It then checks provider/URL availability, read-only/dead state, the owning signal and the captured generation before allocating another task. A newer submission or mode transition from an abort observer therefore retires the older invocation.

The existing generation test on asynchronous completion and task-identity check in `finally` remain responsible for stale-result rejection and successor retention. Ordinary repeated refresh still cancels the earlier request and accepts the latest one. No global cancellation manager or new request API is added.

### Committed files and controls

- `plugins/link-preview/index.js`: reorder retirement and validate after cancellation callbacks.
- `plugins/link-preview/input-lifetime.test.js`: targeted same-URL abort-observer regression.
- `tests/browser/regressions/link-preview-request-ownership.js`: same/different URL successors, ordinary repeated refresh and mode-round-trip coverage.
- `tests/browser/projection-contracts.js`: import the new browser fixture.

The browser fixture uses the real editor, real DOM and native `AbortSignal` dispatch. URL submission uses a **synthetic DOM `KeyboardEvent('keydown', { key: 'Enter', ... })`**. This is not a physical keyboard, trusted native input, IME or system-clipboard test.

The successor tests verify exact provider call order, retirement of the old signal, liveness of the new signal, inert old completion, accepted new metadata, rendered title and current input URL. Undo returns to the original document in one action; redo restores the accepted URL/metadata without refetching. The ordinary repeated-refresh case is a healthy control without an abort observer. The mode-round-trip case also verifies unchanged document/history during the retired attempt and successful later explicit submission.

### Executed evidence

Evidence directory: `test-results/continuation-2026-10-31-after-5572/`.

| Run | Executed source | Actual result |
|---|---|---|
| Targeted Node RED | `5572d039…` production plus final Node fixture; recorded in `link-preview-reentrant-unit-red.json` | 0 PASS / 1 FAIL; exit 1. |
| Related Node GREEN | Working candidate on `d888217…`; recorded production/fixture SHA-256 | 19/19 PASS; exit 0. |
| Final browser RED | Isolated `5572d039…` plus the final fixture and import | 217 total: 214 PASS / 3 FAIL; exit 1. |
| Final browser GREEN | The same isolated baseline plus only the LinkPreview production repair and the same final fixture/import | 217/217 PASS; exit 0. |

The Node commands were:

```sh
node --test --test-name-pattern='refresh preserves a newer metadata request' plugins/link-preview/input-lifetime.test.js
node --test plugins/link-preview/input-lifetime.test.js
```

The browser command was `node tests/browser/run.mjs` with `EDITOR_BROWSER_PAGE=projection-contracts.html` and the pinned Chrome executable. RED ran at 20:41:07–20:41:18 UTC and GREEN at 20:41:18–20:41:28 UTC on 2026-10-31. The isolated pair does not depend on the concurrently developed renderer or core repairs. The metadata records unchanged before/after hashes for the production file, browser import and fixture.

| File / phase | SHA-256 |
|---|---|
| `plugins/link-preview/index.js`, baseline RED | `55e745d3c21efb95dfc6150440f03adf614111713c34286a9dec3b4237234f13` |
| `plugins/link-preview/index.js`, candidate and published fix | `35efcf00270fb5537c9cf3ad0f319e49c63fc6ab1535bccb306616ddfa33d2b5` |
| `plugins/link-preview/input-lifetime.test.js`, Node RED/GREEN | `3fd61b41ddad0754e0cee26bd1607b0295495eddea895587fb2d52dfe0b9423b` |
| `tests/browser/projection-contracts.js`, browser RED/GREEN | `843fbb58bce1ea4a94be7e82dcbab97742af86178a0f8b34791fb9ba5b733681` |
| `tests/browser/regressions/link-preview-request-ownership.js`, browser RED/GREEN | `841989724d5a6cf577566a73d8d3811c379f7bf6f5f608e8c905219b3e26f771` |

### RED summary correction

The first derived browser RED summary looked only for the successful runner output format. It missed the failure protocol and incorrectly contained `cases: 0` and an empty failure list, although the raw log already contained all 217 cases' aggregate result and the three failures.

That incomplete derived record is retained as `link-preview-browser-red-unparsed-summary.json`. The corrected `link-preview-browser-red.json` was produced by parsing the **unchanged raw log**, not by changing the fixture, product, expected results or original run. It now records 217 cases, 214 passing cases and the three named failures, with an explicit `summaryCorrection` field.

The raw `link-preview-browser-red.log` SHA-256 is `62b027ca0e01a1c79332120039805b3f3efc908cd7279770a8cf001703f2d752`. The original empty derived summary is not used as passing evidence.

## 4. Core: scoped authority must survive complete result capture

Published fix: `ad153941a29d39c111970ea12e1c7c09e63ef10a`.

### Observable failure

`InstanceScope` already checked ownership before and after calling the author producer. However, a producer can return a getter-backed value, and schema processing can return additional getter-backed envelopes or data. Those callbacks run later when `DocumentRuntime` captures the complete proposed record.

A task could cancel itself from one of those getters while the previously admitted operation still published its result. A directly scoped update could similarly retire its occurrence from a returned getter and still reach the transaction. The expanded baseline Node run had ten failures across block and inline paths: producer-result cancellation, schema completion/data/value cancellation and occurrence retirement. The browser baseline independently demonstrated failed cancellation for both block and inline tasks.

### Minimal production change and publication boundary

`InstanceScope` supplies an internal final-owner assertion to the existing `updateData` adapter. The task assertion checks its closed state, abort signal and scoped generation; direct updates check the captured scope generation and interaction lifetime.

`DocumentRuntime.update()` and `updateInlineWidget()` invoke this assertion after `#recordFromData()` has completely captured schema data, tunes and inline content, inside the existing extension-preparation boundary. The check runs before canonical equality and `tx.update()`. No author-controlled result remains to be captured between this assertion and the transaction's use of the prepared canonical record.

There is deliberately no new assertion after projection. A successful transaction may remount an instance and abort its old task signal while its admitted result remains successful. The existing successful-remount browser control still requires `commit() === true`, committed data and a retired old signal.

The final assertion uses owner/generation checks rather than demanding phase `idle`, so legitimate nested author composition remains supported. The check is local to the existing runtime/scope path; it does not introduce a global guard or affect another editor's independent transaction.

If result or schema capture throws, the final assertion is not reached. Existing error propagation retains the exact thrown cause, including `undefined`, while task closure makes retries inert. The change does not replace an original getter/schema error with a later `AbortError`.

### Committed files and controls

- `core/InstanceScope.js`: pass the final owner/task assertion through the existing internal update adapter.
- `core/DocumentRuntime.js`: invoke that assertion after full block/inline record preparation and before applying it.
- `core/DocumentRuntime.inline-read.test.js`: block/inline result and schema cancellation, original-cause preservation and revoked-owner controls.
- `tests/browser/scoped-authority.js`: cancelled result plus healthy sibling task, independent editor write/undo and successful author composition controls.

The browser checks require cancellation to leave the owning document, undo state and committed-event stream unchanged. The cancelled task cannot invoke another producer; the sibling task and occurrence signal remain live. A write to a separate editor from the getter remains committed and undoable. The healthy sibling then commits successfully and supports one undo/redo action. A healthy getter plus a nested host-author update preserves data and tunes in the same history entry. Existing no-op, input-capture, retired-occurrence and successful-remount controls remain in the page.

### Executed evidence and commands

Evidence directory: `test-results/core-task-result-capture-next/`.

| Run | Executed source / fixture | Actual result |
|---|---|---|
| Initial focused Node RED/GREEN | First block result-getter cancellation test; `block-result-{red,green}.log` | 0 PASS / 1 FAIL → 1/1 PASS. |
| Expanded Node RED | Git archive of exact `5572d039…` at `/tmp/rector-task-result-red-f9tv5va1`, overlaid fixture blob `b300066e…`; `expanded-red-source.json` | 37 total: 27 PASS / 10 FAIL; exit 1. |
| Expanded Node GREEN | Working candidate with the same expanded fixture | 37/37 PASS; exit 0. |
| Final related Node GREEN | Working candidate on `99620603…`, final fixture blob `5d1e61c1…`; `core-related-green-source.json` | 176/176 PASS; exit 0. |
| Browser RED | Isolated `5572d039…` production and final `scoped-authority.js` fixture | 12 total: 10 PASS / 2 FAIL; exit 1. |
| Browser GREEN | Working candidate on `d888217…`, recorded repaired core blobs and identical browser fixture; `browser-expanded-green-source.json` | 12/12 PASS; exit 0. |
| Ancillary typecheck | `npm run typecheck`; `typecheck-green.log` and `.exit` | Both TypeScript configurations passed; exit 0. No separate exact HEAD snapshot was recorded for this run; it is not a frozen combined-head gate. |

Exact Node commands:

```sh
node --test --test-name-pattern='a cancelled block task cannot publish' core/DocumentRuntime.inline-read.test.js
node --test core/DocumentRuntime.inline-read.test.js
node --test core/DocumentRuntime.inline-read.test.js core/InstanceScope.test.js core/InstanceScope.options.test.js core/InstanceScope.history-continuation.test.js core/TransactionEngine.test.js core/PublicEditorApi.test.js
```

The browser run selected `scoped-authority.html` through `EDITOR_BROWSER_PAGE`, used `/tmp/rector-browsers/chrome-linux64/chrome` and executed `node tests/browser/run.mjs`. Its recorded environment is Chrome `142.0.7444.175` and Node `v24.22.1`. This is real-DOM programmatic API/task coverage, not a physical-input test.

### Exact source identities and the final Node control expansion

| File | Baseline Git blob | Candidate / published Git blob |
|---|---|---|
| `core/DocumentRuntime.js` | `2aa4613d3d60b7662f75985a6e5fa65ced678780` | `04b739bc61b639c9474e443de7df0db62f5fb7a2` |
| `core/InstanceScope.js` | `777b4eff93ade4d1e9583016694e5da5fa1c270a` | `8b3823085c36e80e4a555c9564be0eb802d52e98` |

The expanded RED Node fixture was `b300066ec3ac8615406afea7bb3fa0216ff0c1e4`. The final related GREEN and published fixture is `5d1e61c1d28f80aa05d564f64e30374b39bcb89e`. A read-only comparison confirmed that the difference only extends already-passing original-cause controls: the earlier fixture tested producer-result getters throwing an `Error` or `undefined`; the final fixture additionally tests schema-data getters with those same causes. All ten failing cancellation/retirement regressions are unchanged. The final Node suite therefore has a documented control expansion, not an inaccurately claimed byte-identical fixture pair.

The browser fixture is identical in RED/GREEN: Git blob `bf4bff81d2a81f4c8bfc738af7edc6892700d011`.

`candidate-source.json` records the final source at working HEAD `996206038e0c0358eac185d296bf7b84e766ea5c` with the following SHA-256 values:

| Candidate file | SHA-256 |
|---|---|
| `core/DocumentRuntime.js` | `95816345585e139722388ce7d13267e2b2e54775ffd632772cf809ab4c56306a` |
| `core/InstanceScope.js` | `a5b83a9b621424896df4e0f750c0e8a6260107211e0cd6b9132968402bdcbeb0` |
| `core/DocumentRuntime.inline-read.test.js` | `685a4c82ce81637eb4ee91887b92440b0ccae64f059055fe1fd381b6627167a6` |
| `tests/browser/scoped-authority.js` | `0df9d087e37a29218e7dac45e66bca60196179dc0155f57325c8ea73e93da5ab` |

The saved `candidate.diff` SHA-256 is `e62647ea1e925dd2fa62e4659431ac9c99aa2ba9164d26efcbfe8e11b9303810`. Independent read-only review confirmed the four-file diff and all four hashes match the published candidate. No tests were rerun or sources edited for that review.

## 5. Raw-log integrity locators

The following SHA-256 values were checked read-only while drafting this checkpoint. They identify the retained outputs; they do not add a new execution or change the source attribution above.

| Evidence directory / log | SHA-256 |
|---|---|
| `renderer-successor-disposal/browser-red.log` | `ed14075767052ce4821d1d769acb349943f81fcad518af701db6470a3ae16891` |
| `renderer-successor-disposal/browser-green.log` | `c1e8d6e72de1b270519c38a8ae3031e78fe906a083b0bb366eccaebe1c4e2209` |
| `renderer-successor-disposal/node-renderer-suite-green.log` | `4c344c892aa42a8a407b78fca8ab8f28465765155c55c9731604ede00010a8e4` |
| `continuation-2026-10-31-after-5572/link-preview-browser-red.log` | `62b027ca0e01a1c79332120039805b3f3efc908cd7279770a8cf001703f2d752` |
| `continuation-2026-10-31-after-5572/link-preview-browser-green.log` | `84c642ef203e90bf2a501ea81eafaab4ad76881981934dd7b766f0317497cee9` |
| `core-task-result-capture-next/core-expanded-red.log` | `4fa3727489a8051a0ce257c293976406efb9673ac54b58dbb3485f2a7069a562` |
| `core-task-result-capture-next/core-related-green.log` | `7e1c230c1dd948c09a917d3baafaf7d2857601c0ee4247d1cb7057ff03fc5658` |
| `core-task-result-capture-next/browser-expanded-red.log` | `2024803165f3d629301d25bdd32859d68fed86f9badecf66b114fd814be9daab` |
| `core-task-result-capture-next/browser-expanded-green.log` | `07327a9cd4e4dfe3a53fd59964d46ab0fd07cceee831b2567fca0e41d41113fd` |

All paths in this table are relative to `test-results/`.

## 6. Separate Attaches files acceptance

The independently reviewed [file-source checkpoint](../attaches-files/README.md) accepts only `BLOCK_ATTACHES_FILES` after the completed final replay and combined verification on `fad69ef82293fcac28b5be756e3a7118a2c4750f`. Current/specification-baseline sources each complete 18 cases / 2,336 passing observations. v1 completes 16 cases / 1,742 observations, with exactly two predeclared populated-drop gaps. Useful current populated-block drop is retained. Raw runner and audit exit 0, with no errors, incomplete cases or candidate exceptions.

Final replay: 2026-10-31 20:50:46.810–20:51:17.587 UTC. Evidence: `test-results/attaches-files/final-fad69ef8/`. Raw JSON SHA-256: `9b715b527829877923a8dea7620f27f1afede11b850bc443da48527dc169ee81`. Independent read-only audit confirms the frozen candidate/tree, unchanged clean checkout, fixture/runner bytes, all 166 loaded candidate product files and dependency hashes. Its `peer-review.execution.json` records that the raw hash did not change. The earlier corrected `5572d039` comparison remains separately attributed.

The corpus checks trusted picker/action activation, controlled drop, exact bytes/metadata/order and IDs, real local URL ownership, one source history action and separate trusted filename input. Operating-system drag gestures, actual downloads/ZIP, pending cancellation and broad resource/mode lifetime remain outside this acceptance. The earlier mutable-observation attempt remains excluded; the final fixture stores immutable snapshots and the exact audit rejects missing or inconsistent evidence.

## 7. Completed combined integration

- Frozen published commit: `fad69ef82293fcac28b5be756e3a7118a2c4750f`.
- Frozen tree: `0b114d129a4416c84b86df63eb4c488196bb2d53`.
- Manifest: `test-results/run-l2J6B3/manifest.json`.
- Run interval: `2026-10-31T20:51:17.753Z`–`2026-10-31T21:13:28.623Z`.
- Outcome: **passed**. All eleven gates exit 0; each source-before/source-after identity matches the initial clean source.
- Initial and final source identity: `472ef1f5c80dc4c14b0f4907207391484e66abdc6e894e3b323da4db215ac6a7`.
- Lockfile SHA-256: `91874afdcfbe533e607429bdaa3e0a4cbf9d671410831dbeb1d62d4d5d266382`.
- Environment: Linux x64, Node `v24.22.1`, npm `11.9.0`, Chrome `142.0.7444.175`.
- Browser executable: `/tmp/rector-browsers/chrome-linux64/chrome`.

| Gate | Actual result | Recorded command |
| --- | --- | --- |
| `unit` | 2,168/2,168 PASS; no failures, cancellations, skips or TODOs | `npm test` |
| `typecheck` | Both production configurations PASS | `npm run typecheck` |
| `build` | PASS | `npm run build` |
| `types` | 7/7 public type contracts PASS | `npm run test:types` |
| `package` | Installed Bundler/NodeNext, Vite, ESM, external Chrome and CSS assets PASS | `npm run test:package` |
| `docs` | README, plugin source/locale, documentation contracts and smoke PASS | `npm run test:docs` |
| `browser` | 42 registered pages PASS, including trusted-types.htm | `node tests/browser/run.mjs` |
| `native` | 47 result arrays / 2,683 PASS, plus separate physical/history controls | `node tests/browser/physical-history.mjs` |
| `heap` | 23 sentinels / zero retained; history-eviction and live Undo controls PASS | `node tests/browser/heap-gate.mjs` |
| `docs-site` | 127 pages, zero broken links or missing assets, browser smoke PASS | `npm run docs:check` |
| `attaches-files-audit` | Complete 18-case candidate corpus and both historical sources PASS; no exceptions | `node scripts/parity/attaches-files-audit.mjs test-results/attaches-files/final-fad69ef8/raw.json` |

Each gate has its own log under the manifest directory. Native totals are counted once from the final aggregate arrays, without adding overlapping per-slice runs or progress lines. Ordinary pages include 41 `.html` pages and `trusted-types.htm`. The native physical/history controls remain separate from the array total. Heap sentinels and the deliberate history-eviction positive control establish their stated bounds, not absence of every possible leak.

All documentation text was prepared outside the checkout while source verification ran. Only documentation changes after this completed freeze; its published revision receives separate documentation-only verification. The previous continuation run `run-3Avhty` is not relabelled or added to these totals.

## 8. Acceptance boundary

These three repairs close their demonstrated bugs. They do not accept the complete `RENDERER_ERRORS`, `RENDERER_REGISTRATION`, `BLOCK_LINK_PREVIEW_CANCELLATION`, general `CANCELLATION` or broader core preservation obligations. They do not establish a fresh v1/current/candidate differential for those rows or whole-library functional parity.

The starting register recorded 63 accepted obligations out of 209, with 146 open. The three fixes grant no additional row acceptance. The separate reviewed Attaches file-source proof and completed integration accept exactly one row, so the current register contains **209 IDs: 64 accepted / 145 open**.

The per-slice browser tests use the current implementation and the pinned pre-fix baseline. Their real-DOM and lifecycle observations must not be described as physical native-input, IME, clipboard, cross-browser or complete performance/heap acceptance. Improved current behavior remains preserved; a historical version's weaker behavior is not the target of these repairs.

## 9. Separate GitHub Actions execution budget

The original remote [workflow run 41240778009](https://github.com/Shelamkoff/editor/actions/runs/41240778009) for the same frozen `fad69ef8` source is **cancelled**. Node 20.19.0, 22 and 24, package, documentation and size-report jobs succeeded. The browser job began at 20:51:39 UTC, completed the 95-case native media page at 21:11:46.951 UTC, received cancellation at 21:11:52.786 UTC and ended at 21:11:55 UTC. Its configured whole-job limit was 20 minutes. The branch still pointed at that source and no successor workflow had started, so the timing and continued progress support the job-budget diagnosis. The check-run annotation endpoint was unavailable; no unseen annotation is claimed.

The six textual FAIL records in that job log belong to the harness's intentional negative controls, whose expected result inventory and `correct: true` self-check pass. No unexpected assertion failure was found before cancellation. The final native design page and following heap gate did not complete remotely in that run. The later local eleven-gate result above has its own complete outcome and does not relabel the cancelled GitHub run.

Published follow-up [`710cf5c1`](https://github.com/Shelamkoff/editor/commit/710cf5c162d18d4c9375d255d313cfb1a6f49666) changes only the release job's timeout expression and two explanatory comments: `browser` receives 30 minutes; other release jobs retain 20 minutes, and Node jobs retain 15. This allows ordinary pages, the full native matrix, heap checks, dependency setup and result/artifact finalization to complete within one job. The test commands, case inventory, assertions, matrix and per-page deadlines are unchanged. Parsed YAML comparison confirms that this is the only semantic workflow change; independent review accepted it.

GitHub documents both automatic cancellation at the [whole-job time limit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes) and availability of the [matrix context for that setting](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability). Execution of the corrected workflow is recorded by the new Actions run associated with its published source. It is a separate execution from the cancelled run and the completed local manifest. Production, test and dependency bytes remain identical to the frozen source after this CI-only follow-up.
