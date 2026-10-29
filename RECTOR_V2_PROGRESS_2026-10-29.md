# Rector v2 refactoring and parity checkpoint — 2026-10-29

## Status and authority

This is a scoped implementation and verification checkpoint, not whole-library release acceptance. The current target is [Contract and Boundary Refactor](RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md), with unaffected [Architecture Refinement](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) requirements retained. The historical acceptance notes in [Implementation Progress](RECTOR_V2_IMPLEMENTATION_PROGRESS.md) retain their original source and environment scope.

- Repository/branch: `Shelamkoff/editor`, `refactor/rector-v2-architecture`.
- Starting remote/source commit: `e6d14c9b7912408230f53d1ff9aa754f6dd69dbe`.
- Pinned v1: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (package 1.0.5).
- Production-code freeze: `fa13888a66e660e2893e5fc493bd600588f13b10`.
- Native fixture correction: `4b87dad094367eea16b768ca4e3ac0808b1dec1f`; between the production freeze and this native-acceptance commit, the only change is `tests/browser/native-conversion-grouping.js`.
- Byte-for-byte reproduction probes are retained in evidence commit `7db0361e5019dc4323514292cd03aa1a5e4c73e2`. They and this report/registry/index update are evidence and documentation changes after runtime verification.
- Final documentation gates: clean `15040347b20d2f12487626976c9b92d3b3ae677c`. The subsequent update only records these outcomes in this root report.

The work used three parallel agents, the modern JavaScript and JavaScript testing skills, and the repository's TDD workflow. Runtime changes remain in the existing transaction, projection, focus, and selection owners. No additional transaction engine, selection authority, compatibility runtime, or remount manager was added.

## Implemented behavior

### Quote import and renderer extension parity

Quote paste now extracts a nested `cite`, `footer`, or `figcaption` as attribution while retaining rich text and leaving the caller's DOM unchanged. A surrounding Figure's explicit caption retains precedence. The expected behavior was executed against the pinned v1 source, then checked in the current standard clipboard fixture.

The existing public `EditorRenderer` class remains the construction surface, including subclass/override behavior, custom registration, incremental reuse and reusable disposal. Removed the exact forwarding `createEditorRenderer(config)` surface and `renderer/async` entrypoint after migrating source callers, examples, documentation, declarations and external consumer fixtures. `renderer/renderers/async` remains canonical; distinct load/preload/create operations remain. Installed-package negative checks verify the removed routes are absent. This is the coordinated breaking API change required by C08, not compatibility with the removed spellings. Complete type-vocabulary convergence is not claimed by this slice.

### Selection, keyboard continuation and history

Inline-toolbar continuation now restores the current validated controls token before mounting another tool. Fresh author selection continues to come from the current native range; stale revision, field and foreign-focus cases do not gain selection rights.

Block-menu handoffs validate the original author field, document generation/revision, mode and native selection. Keyboard submenu continuation, queued `selectionchange`, partial selection and focus on plain-text author fields retain their distinct routes. A stale partial selection cannot become an unintended whole-block operation.

Block dragging and Tune pointer actions retain the author caret before the history record is captured. Foreign focus during the pointer sequence invalidates the continuation. Exact Undo/Redo expectations cover the document and directed selection, rather than just visible formatting.

History can reveal a recorded hidden Person or Carousel field through the existing focus owner. The engine identifies history restoration internally; the view validates the same block, exact field, mount, generation/revision and focus intent, then uses the normal logical selection restore. A newer foreign or sibling focus cancels the pending completion. The general selection authority was not weakened.

### Projection and rich-text stability

Projection checks actual DOM HTML before replacing an unchanged rich-text field. Layout or sibling updates retain text-node identity, native caret and backward selection while changed DOM still goes through normalization/hydration.

Owned inline widgets survive legitimate field or wrapper replacement by their own block. A captured ancestry check distinguishes such replacement from adoption into another owner. Ownership is checked again after extension callbacks and before DOM publication; rejected foreign fields do not receive the live widget even briefly. This does not define the still-open standalone presentation-failure recovery policy.

Adjacent equivalent authored tags can merge across zero-length Text nodes left by native range operations. Whitespace, different attributes, native controls and protected boundaries remain barriers; owning tools restore logical selection.

### Mention follows observed native character deletion

A real Chromium control demonstrated that the predicted `beforeinput` target range and actual native Backspace result can differ: for `@e\u0301`, the browser reported `[1, 3]` but left `@e`. The previous controlled deletion removed the entire grapheme.

For a collapsed character deletion inside the owned Mention label with a usable contained browser range, Mention now leaves the event unprevented and the existing native-input envelope reconciles the observed DOM result. Other widget definitions keep their handler decision. Noncollapsed selection, exterior edits and missing-range fallback retain their prior routes. The normative refinement specification records this bounded amendment. Tests compare ordinary editable text with Mention for accents, flags, family and skin-tone sequences, plus the next native edit and late cancellation; identity, caret and one Undo/Redo action are asserted.

### Corrected test interactions

Several old fixtures pressed document-history shortcuts while focus belonged to a native upload/source/language/settings button. They now establish the auxiliary-control focus, assert that Ctrl+Z does not change the canonical document, then explicitly focus the editor and check the expected Undo/Redo. This applies to Code, Image, Carousel, Embed and Columns fixtures where appropriate. The conversion-grouping cases additionally assert the unchanged history state and post-shortcut control focus before checking exactly one directed Undo/Redo. Native disabled controls, Checklist text hosts and Gallery layout buttons are now selected by their real UI semantics. Converted Cut expectations follow complete intermediate-block removal, with both history steps and directed selection checked.

These fixture corrections do not relax runtime ownership. They retain both the negative control-focus case and the positive editor-focus case.

## TDD and independent evidence

| Boundary | Failing observation before repair | Passing evidence after repair |
|---|---|---|
| Quote attribution | Three nested attribution variants lost v1 behavior | Pinned v1 oracle plus current clipboard regressions |
| Renderer public routes | Removed-route and construction expectations failed | Class/override tests, types, installed tarball and real-DOM v1 comparison |
| Unchanged field projection | List caret/backward selection and Columns layout regression | Projection contract suite and native plugin parity |
| Inline tag merging | Empty text leaf prevented equivalent authored tags from merging | Focused regressions and full native-tools matrix |
| Mention deletion | Ten controlled/native comparisons exposed the discrepancy | Observed-native comparisons, continuation and canceled-input cases |
| Hidden-field history | Recorded hidden fields were not restored through the focus owner | Unit lifetime checks and real Person/Carousel history cases, including superseding focus |
| Widget ownership | Legitimate own replacement was rejected; late validation allowed temporary foreign publication | Own-replacement and foreign-adoption negatives in projection contracts |
| Conversion grouping fixture | Full gate on `fa13888a` failed eight Image/Carousel cases with Ctrl+Z on upload controls | Eight focused cases after exact control precondition and negative shortcut assertion; full rerun below |

The v1 renderer oracle imports the unmodified baseline class and uses test-only document/schema adapters for the different envelopes. Baseline renderer SHA-256: `1b48abf8f55ba213b09d4a740a82df30a5dde97a7b4dd96c997145cf959229b9`.

Fourteen checks passed for each version: subclassing, public overrides, custom registration, detached render, `renderTo` equivalence, incremental reuse, changed-block isolation, caller-data preservation, target/detached/direct-block disposal, idempotence, and reuse after target/global disposal. Both versions created and disposed 12 instances exactly once and produced equivalent text/structure. This does not cover the built-in renderer inventory, document migration, removed alias compatibility, cross-realm behavior, CSP or style acquisition.

A separate construction control compared the real DOM behavior of v1 `5e5c7f8`, specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`, and candidate `4b87dad0`. Both historical versions exercised their public constructor and forwarding factory; the candidate exercised its retained constructor and factory absence. Checks covered public instance/prototype, nondefault configuration forwarding, custom registration, all three output methods, exact disposal and reuse, and subclass/super overrides in all versions. Each construction created and disposed seven instances exactly once. Baseline entrypoint/implementation bytes were verified against their Git objects. This supplies the previously missing factory control for the bounded `RENDERER_CONSTRUCTION` obligation; it does not establish the broader `RENDERER_OUTPUTS` row or built-in renderer parity. Shared installed current dependencies, custom schemas and `injectStyles: false` delimit the probe.

The Quote oracle executed three baseline DOM variants without source modification. The current matching cases are imported by the standard `native-clipboard` fixture and use a controlled ClipboardEvent in the real DOM. They prove import/routing/model/history behavior; this specific evidence does not establish HTML transfer through the system clipboard. The oracle scripts were session probes, retained byte-for-byte as [checkpoint reproduction sources](scripts/parity/checkpoints/2026-10-29/README.md). They are scoped comparative evidence, not a claim that the complete v1 test environment was installed and executed; their README records the original environment paths and reproduction requirements.

### Preservation mapping

| Scenario or contract | Evidence accepted by this checkpoint | Remaining boundary |
|---|---|---|
| `RENDERER_CONSTRUCTION` / C08 | Accepted: v1 and specification-baseline forwarding controls, candidate class/absence, subclass/override, installed declarations and negative imports | Acceptance is for the specified sources and Chromium environment; broader renderer rows are separate |
| `BLOCK_QUOTE_PASTE_MERGE`, part of `CLIPBOARD_HTML_ROOTS` | Nested attribution import preserves marks, caption and caller DOM, with candidate atomic history | Complete merge/export/conversion and system-clipboard proof remain outside this comparison |
| `RENDERER_OUTPUTS` | Fourteen bounded v1/candidate checks cover output, reuse and disposal | Producer-revision shortcuts and foreign-output ownership still need differential proof |
| `BLOCK_PERSON_HIDDEN_FOCUS` / `HISTORY_GESTURE` | Same-block/same-field recorded history target, with superseding/foreign focus negatives | Missing endpoints across different fields or blocks are not established by this slice |
| C01/C02/C03/C07/C12 extension/projection contracts | Current positive and negative browser checks, including 57 projection cases and 12 installed external browser contracts | Full v1 capability coverage and the B-PRESENTATION decision remain open |

Probe-script SHA-256 values at successful execution:

- Quote: `23a24b72067d51fd27400494d7ae567639e0d0757ce97c97c31f070007f44a98`.
- Renderer14: `42266203aba29552651e118efe2ac68dac942c1ed88f35fa707b23b0b452b9c8`.
- Constructor/factory: `bccac37befe9041536e24d035465f82fe43d7763f60709315b26e2cc6fc5a6cc`.

The first constructor/factory probe had an incorrect fixture expectation for a dark-theme CSS modifier. Source inspection showed that the modifier belongs only to light theme; the corrected probe checks the source-confirmed class output and separately checks nondefault configuration forwarding. Its initial failed `renderer-factory-control` trace is retained as a probe-development failure, not a product regression or accepted gate.

## Verification environment and source identity

Linux managed environment; Node `v24.22.1`, npm `11.9.0`, Chromium `142.0.7444.175`; CPU quota 8 cores and memory limit 8 GiB. Browser executable: `/tmp/rector-browsers/chrome-linux64/chrome`, selected with `EDITOR_CHROME_PATH`. Dependencies were installed with `npm ci --no-audit --no-fund` from the repository lockfile.

Each acceptance wrapper captured UTC start/end, exact command, exit code, HEAD, tracked binary-diff SHA-256 and Git status before/after. Listed completed runs have `sourceUnchanged: true` and clean source snapshots. Logs/manifests are session evidence under `/tmp/rector-final-gates`; no generated log or screenshot was added to Git.

The broad gates ran on production freeze `fa13888a`. The later test-only commit does not change the runtime, package, docs site, ordinary browser fixtures, type fixtures or heap gate. Final native acceptance uses `4b87dad0`. After the reproduction sources and publication/registry notes were committed, both documentation gates were rerun successfully on clean `15040347`; the runtime remained identical to the production freeze. The commands below were executed individually; the aggregate `npm run test:browser` command is not being claimed as an additional run.

| Gate | Actual command | Result |
|---|---|---|
| Unit | `npm test` | 1,916 passed; no skipped tests |
| Checked JavaScript | `npm run typecheck` | Both project configurations passed |
| External types | `npm run test:types` | 6 passed, including Bundler and NodeNext |
| Build | `npm run build` | 285 declarations; zero source diagnostics |
| Source/docs contracts | `npm run test:docs` | Source/localization audits, 94 READMEs and 53 examples passed |
| Installed package | `npm run test:package` | Installed tarball, TypeScript, Vite, native imports, external browser contracts and 22 CSS assets passed |
| Ordinary browser | `node tests/browser/run.mjs` | All 35 registered pages passed; 353 ordinary named cases; 8 harness self-test outcomes matched their expected statuses |
| Heap | `node tests/browser/heap-gate.mjs` | 21 sentinels, zero retained; 14.22 MiB used JS heap, 1.26 MiB embedder heap, 12.66 MiB snapshot |
| Built documentation | `npm run docs:check` | 47 README pairs; 127 HTML pages; zero broken links or missing assets; RU/EN and light/dark browser cases passed |
| Native interaction | `node tests/browser/physical-history.mjs` | 2,059 passed results across all 39 native suites; the separate 14-case history matrix and direct Enter/toolbox scenarios completed; exit 0 |
| Pinned v1 Quote | `node /tmp/rector-quote-v1-oracle.mjs` | 3 attribution variants passed |
| Pinned v1 renderer | `node /tmp/rector-renderer-v1-oracle.mjs` | 14 checks passed in each version |
| Constructor/factory differential | `node /tmp/rector-renderer-factory-parity.mjs` | v1 and specification-baseline constructor/factory controls, candidate class/absence and subclass overrides passed |

The browser harness includes six intentional `FAIL` results and two `PASS` results whose expected-status checks all succeed; those are harness self-tests, not product failures. Some pages return structured or string results rather than named-case arrays, so the 353 count is not a total of all assertions on all pages.

Independent native lookahead checks on clean `4b87dad0` passed without filters or timeout changes: `native-plugin-ranges` 116/116, `native-poll-runtime` 26/26 and `native-cross-selection` 32/32. Additional full lookahead pages passed: `native-mention-popup` 64/64 and `native-plugin-controls` 148/148. All five lookahead pages total 386/386 cases; they overlap the complete native run and must not be added to its distinct-case total.

The first complete native attempt on clean `fa13888a` exited 1 after 225.525 seconds: conversion grouping had 80 passes and the eight native-control-focus fixture failures described above. Its failed trace is retained separately. The successful full rerun on clean `4b87dad0` took 958.858 seconds and does not erase that failed result. Earlier interrupted runs against changing sources are not candidate acceptance.

### Run ledger (UTC, 2026-10-29)

| Run | Start UTC | Seconds | Exit | Source | Source unchanged |
|---|---|---:|---:|---|---|
| unit | 14:39:01 | 49.055 | 0 | `fa13888a` | true |
| typecheck | 14:39:01 | 34.103 | 0 | `fa13888a` | true |
| types | 14:39:02 | 32.751 | 0 | `fa13888a` | true |
| build | 14:39:48 | 10.671 | 0 | `fa13888a` | true |
| docs-contract | 14:41:03 | 5.316 | 0 | `fa13888a` | true |
| package | 14:41:35 | 32.44 | 0 | `fa13888a` | true |
| browser | 14:39:02 | 59.276 | 0 | `fa13888a` | true |
| heap | 14:40:11 | 9.977 | 0 | `fa13888a` | true |
| docs-check | 14:39:07 | 83.017 | 0 | `fa13888a` | true |
| v1-quote | 14:41:03 | 1.135 | 0 | `fa13888a` | true |
| v1-renderer | 14:41:05 | 2.211 | 0 | `fa13888a` | true |
| preflight-plugin-ranges | 14:45:01 | 89.154 | 0 | `4b87dad0` | true |
| preflight-poll-runtime | 14:45:01 | 14.028 | 0 | `4b87dad0` | true |
| preflight-cross-selection | 14:45:24 | 17.687 | 0 | `4b87dad0` | true |
| physical | 14:39:00 | 225.525 | 1 | `fa13888a` | true |
| renderer-factory-parity | 14:52:09 | 2.063 | 0 | `4b87dad0` | true |
| preflight-mention-popup | 14:52:34 | 24.05 | 0 | `4b87dad0` | true |
| preflight-plugin-controls | 14:53:06 | 40.227 | 0 | `4b87dad0` | true |
| physical-final | 14:44:26 | 958.858 | 0 | `4b87dad0` | true |
| docs-contract-checkpoint | 15:04:38 | 5.152 | 0 | `a29cd086` | true |
| docs-check-checkpoint | 15:04:36 | 26.054 | 1 | `a29cd086` | true |
| docs-contract-final | 15:08:20 | 4.701 | 0 | `15040347` | true |
| docs-check-final | 15:08:18 | 57.85 | 0 | `15040347` | true |

### Final documentation validation

After the acceptance notes were added, `docs-contract-checkpoint` passed but `docs-check-checkpoint` failed the Russian-prose policy on two new terms. A focused diagnostic after the Russian correction also reported the new relative-link spellings under the site's existing route checker; it used the existing built site and a working RU patch, so it is not a new full-build acceptance run. The wording was localized and the links adopted the existing canonical site routes. The validators and their allowlists were not weakened.

The subsequent clean-source `docs-contract-final` passed in 4.701 seconds, and the complete `docs-check-final` passed in 57.850 seconds on `15040347`. Final results remain 47 localized README pairs, 94 README/53 example contract checks, 127 built HTML pages, zero broken links, zero missing browser assets, no documentation site in the npm package allowlist, and successful RU/EN light/dark browser scenarios. The earlier failed traces are retained under their original names.

### Complete native matrix

All entries below are results from the single successful unfiltered `physical-final` run. The 2,059 figure counts executed PASS results, not unique display labels; `nativeTextInput` contains one repeated label. The separate structured history matrix lists fourteen history cases and three public-event kinds. Direct Enter/toolbox assertions are outside the native-case count.

| Native matrix | Passed results |
|---|---:|
| `nativeTextInput` | 48 |
| `nativeTools` | 92 |
| `nativeClipboard` | 25 |
| `nativeIme` | 16 |
| `nativeConversion` | 7 |
| `nativeBlockMenus` | 110 |
| `nativeConversionGrouping` | 88 |
| `nativeConversionPreservation` | 53 |
| `nativeInteractionSequences` | 39 |
| `nativeRetainedTools` | 64 |
| `nativeConversionContinuations` | 65 |
| `nativeFontCancel` | 58 |
| `nativeBackgroundCancel` | 36 |
| `nativeLinkCancel` | 36 |
| `nativePanelKeyboard` | 36 |
| `nativeSourceIndentation` | 50 |
| `nativeSourceModes` | 61 |
| `nativeConfigSnapshot` | 30 |
| `nativePollRuntime` | 26 |
| `nativeLibraryBoundaries` | 30 |
| `nativeInstanceMethods` | 8 |
| `nativeColorPopup` | 8 |
| `nativeColorPopupTrusted` | 8 |
| `nativeMentionPopup` | 64 |
| `nativeAuditEdges` | 21 |
| `nativeAuditPoll` | 4 |
| `nativeAuditHiddenFields` | 4 |
| `nativeAuditRecheck` | 49 |
| `nativeStructural` | 21 |
| `nativeCrossSelection` | 32 |
| `nativeCoreBehavior` | 57 |
| `nativePluginParity` | 201 |
| `nativePluginControls` | 148 |
| `nativePluginRanges` | 116 |
| `nativePluginLocalRanges` | 76 |
| `nativePluginClipboard` | 48 |
| `nativePluginFieldClipboard` | 68 |
| `nativePluginMedia` | 72 |
| `nativePluginDesign` | 84 |

## Scope still open

The [preservation register](docs/architecture/rector-v2/PRESERVATION.md) retains all 209 scenario IDs. The initial checkpoint accepted **`RENDERER_CONSTRUCTION`**, on the explicit candidate and Chromium scope recorded above and in the fresh construction section of [Publication Review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#construction-parity-2026-10-29). The subsequent expanded Quote acceptance below adds **`BLOCK_QUOTE_PASTE_MERGE`**; the renderer-output acceptance below adds **`RENDERER_OUTPUTS`**; **206 scenarios remain open**. Current-version green suites are evidence for their executed assertions, not a complete v1/current/candidate differential run.

- **B-HTML:** choose and verify Raw/Carousel editor/renderer confinement while preserving permitted navigation, download, responsive layout, media, theme and accessibility.
- **B-STYLE:** settle and verify presentation preservation and destructive trust-policy boundaries before changing supported author formatting.
- **B-PRESENTATION:** settle standalone projection-failure reporting, local recovery, independent observer delivery, persistent/recovery failure and explicit retry without losing unrelated pending input, tasks or selection. The bounded ownership repairs above do not close this decision.
- Complete the v1/current/candidate behavior matrix for all 21 block types, 12 default tools, two inline plugins, renderer/presets and extension capabilities. The Quote and class/construction oracles are limited subsets. Open rows are verification obligations, not a count of established regressions.
- Finish architecture-to-target convergence, including C09 comparative end-to-end performance evidence and C11 workflow/dependency/provenance work where still required. Existing history-byte support was not newly implemented by this checkpoint.
- Firefox/WebKit, manual OS IME and system clipboard behavior, cross-platform acceptance and comparative performance were not established by this Linux Chromium run. A zero-retained-sentinel heap gate is not a general memory or performance proof.

No whole-library completion percentage or release approval is assigned.

## Commit ledger

These are the local implementation/test commits after `e6d14c9b`; evidence and documentation checkpoint commits follow them.

| Commit | Change |
|---|---|
| `a6bae80d` | fix(quote): preserve nested HTML paste attribution |
| `e06c49af` | fix(toolbar): preserve scoped keyboard formatting continuation |
| `dfd7064e` | test(parity): respect auxiliary control history ownership |
| `e648c1cc` | refactor(renderer): keep one constructor and async entry point |
| `8a80f0f9` | fix(projection): retain unchanged rich-text field selection |
| `18d41b68` | test(docs): focus editor before replaying image conversion |
| `48119215` | test(inline): honor selection and document ownership contracts |
| `525fc2a3` | fix(inline): merge authored tags across empty text leaves |
| `41fbfae7` | test(conversion): target checklist text editing hosts |
| `14ed03f9` | fix: validate block menu selection handoffs and continuations |
| `3a6f21d3` | test(plugins): exercise owned controls and history surfaces |
| `434f27e2` | test: use native disabled buttons in menu keyboard coverage |
| `3502eba8` | fix(mention): reconcile native character deletion results |
| `625321cb` | fix(history): reveal recorded fields through owned focus |
| `2a8f2489` | fix(projection): preserve owned widgets across field replacement |
| `b368f34c` | fix: preserve the author caret in native block drag history |
| `d69c34d7` | test: align converted Cut expectations with complete block removal |
| `e2bd959a` | test: route conversion history through the editor focus owner |
| `fa13888a` | fix(projection): validate field boundaries before publication |
| `4b87dad0` | test: preserve native control ownership in conversion grouping history |

Evidence commit after the implementation ledger: `7db0361e` — `test(parity): retain exact checkpoint probe sources`. It preserves three successful probes, the explicitly failed initial construction-control probe, and their reproduction README without changing the executed bytes or adding generated output.

Documentation follow-up commits:

| Commit | Change |
|---|---|
| `a29cd086` | Record the checkpoint and accept the single verified construction scenario |
| `a6f3b12a` | Localize the new Russian construction terminology |
| `15040347` | Use canonical site routes for the construction-review links |

The final root-report-only commit records the successful documentation rerun above. It does not alter the runtime, tests or published site content.

## Publication state at this checkpoint

The initial checkpoint stopped after two automatic approval rejections concerning the exact publication destination. The user subsequently explicitly confirmed publication to this repository/branch. CLI `git push` then failed because this session had no Git credentials; the connected GitHub app successfully published the frozen commits through its Git Data API.

All 25 original commits were published individually, in order, ending at `3103eb5f3a605b22e6ebdabc7d276be4a5b58179`. Each published commit has the exact original file tree; API-assigned commit metadata changes the SHA. A fresh fetch verified every tree and ordered parent. The branch was updated with the expected remote head and without force. Original verification SHAs retain their meaning and can be reconstructed using [publication provenance](scripts/parity/checkpoints/2026-10-29/PUBLICATION.md); the mapping stores original commit bytes and their published tree-equivalent IDs.

The subsequent Quote proof was published as `1acc8ec9dedd3348f0ba0783930e9a7369cafe22` (original `22ef58405326be1e4e61aff334f4f4538cdab3c0`). C08 canonical types were published as `1022b36564f0f336b4fcb133797c92ff00796138` (original `72343a971a378138e2052b97b09bafebd9c7195e`). Both were fetched and tree/parent verified. Publication is not an additional test run.


## Continuation: Quote and canonical type ownership

The expanded Quote differential passed 16 cases per source against actual v1, specification-baseline and candidate code. The successful run used candidate `948bc554`, Chromium `142.0.7444.175`, from 15:32:43 to 15:33:12 UTC; all served source bytes matched Git before/after. Trusted system Copy/Paste, native Backspace/Delete merges, incompatible-field negatives, public plugin export and Quote↔Paragraph conversion are covered. Candidate expectations retain marks, captions, neighbor identities and exact one-step directed Undo/Redo. Old caption loss is a repaired defect under the preservation union, not a feature to reinstate. The complete unfiltered native-plugin-parity page passed **217/217** on clean `22ef5840` from 15:37:15 to 15:38:11 UTC. The [fresh acceptance](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#quote-paste-merge-parity-2026-10-29) and archived source record the exact boundaries; Quote fields/roundtrip and other clipboard rows remain separate.

C08 then removed the duplicate `EditorDocument`, renderer `OutputData`, `OutputBlockData` and `InlineWidget` spellings. `EditorOutputData`, `EditorBlockData` and `EditorInlineWidget` remain in the neutral document owner. All 65 built-in payload/item/block-union declarations moved to the genuine type-only `shared/blockDataTypes.d.ts`; runtime renderer configuration and callbacks remain renderer-owned. The public `types` entry exposes the neutral built-ins. Core notifications, plugin loaders, renderer JSDoc, generated-declaration consumers and installed-package fixtures now refer to those owners. Poll's existing neutral algorithms use the shared data declarations; author/result data and live data-source callbacks remain separate contracts.

The external consumer first failed for missing neutral built-in exports and still-present superseded aliases, then passed strict NodeNext/Bundler compilation. Positive cases cover custom block/widget payloads, all 21 built-in discriminants, subclass overrides, direct editor-save→renderer transfer and Poll result/data-source compatibility. Negative cases reject removed type routes, invalid payloads, unknown built-in names and missing widget schema versions. Both runtime checkJs configurations and documentation/source/example checks passed. An AST comparison of all 29 staged runtime JavaScript modules confirmed that this type slice changed no executable statements. English/Russian guides document the new imports and migration mapping. These focused results do not transfer historical full-suite acceptance to later runtime changes.


## Continuation: renderer output ownership

`RENDERER_OUTPUTS` is accepted on clean source `6b0ef0e8bd4b50adf5c294ba6cddadd4313f0a26`, published with identical tree as `a39aaf3264aae1578aa03ffac1646fa2c07ea0f1`. A second renderer could previously accept a still-owned detached document wrapper or unknown-block placeholder; eight public scenarios were RED before the repair. The existing WeakMap now reserves these roots as well as registered block outputs and releases each provisional/retired wrapper in the existing cleanup path. The 17-line runtime diff adds no new owner or public API.

The standard public conformance fixture now has 39 checks, including 27 renderer-output cases. All passed both directly and through an independently installed package. The three-source comparison executes those same 27 cases against actual v1, specification-baseline and candidate modules. Candidate passes 27/27; the older implementations' known ownership/focus/recovery defects and the object-key-order improvement are tightly classified with exact messages, one failure only and independent DOM observations. Producer string/numeric revision fast paths were preserved in all versions without reading opaque unchanged data. Cleanup/reuse, caller/application DOM and independent nested outputs are explicit controls.

On the same clean unchanged commit, `npm test` passed **1916/1916** with zero failures/skips (15:56:19–15:56:49 UTC). `npm run test:package` passed strict Bundler/NodeNext consumers, Vite, runtime/negative imports, browser **39/39**, and **22 CSS assets** (15:56:18–15:56:59 UTC); package generation emitted **285 runtime declarations, zero source diagnostics**. The [renderer-output acceptance record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#renderer-output-parity-2026-10-29) gives the full commands, source hashes and bounds. The original commit bytes are retained in the publication map; the published branch was fetched and its tree/parent verified.

C12's creation-cause documentation also now states that `BlockInstanceContext.restoring` is fixed at instance creation, unchanged by later updates. It suppresses repeated automatic author-side effects, not resources needed to display accepted content. This is a documentation correction to existing behavior, not a new dynamic context field.

The published renderer commit's GitHub documentation job exposed unformatted technical terms in the new Russian Quote proof. The Russian prose was corrected without weakening the localization checker. `npm run docs:check` then passed locally (16:09:25–16:10:19 UTC): 127 rendered pages, zero broken links or missing assets, and English/Russian light/dark interaction checks. This run used the stated worktree with concurrent source-audit work; it is a focused documentation result, not a new immutable whole-library freeze.
