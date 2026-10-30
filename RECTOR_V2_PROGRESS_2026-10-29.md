# Rector v2 refactoring and parity checkpoint — 2026-10-29

## Status and authority

This is a scoped implementation and verification checkpoint, not whole-library release acceptance. The current target is [Contract and Boundary Refactor](RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md), with unaffected [Architecture Refinement](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) requirements retained. The historical acceptance notes in [Implementation Progress](RECTOR_V2_IMPLEMENTATION_PROGRESS.md) retain their original source and environment scope.

The latest [local runtime continuation](scripts/parity/checkpoints/2026-10-30/continuation-61a-closeout/README.md) completes the native/Poll/LinkPreview/Code/Carousel/Embed repairs and merges published upstream `414c6af1` normally. General `run-kAQSyz` on unchanged `1c933545` passes all nine gates, including 2,060 Node tests, 38 ordinary pages, both typechecks, package/declaration consumers and the 127-page documentation site. Independent `run-MKgB9Y` on `6c2a48d1` passes the complete 43-group / 2,481-case native matrix, physical/history controls and heap checks with 23 sentinels / zero retained resources. Runtime, build and dependency bytes are identical between the general and final native sources. The intervening changes are four comparison reporting guards, native page registration and documentation/evidence. A measured 130.307-second page exceeded its 120-second deadline; isolating 43 unchanged cases into two dedicated pages preserves the complete 376-case multiset and the original deadline. Fresh maintained comparisons complete 235 candidate cases without candidate failures, followed by the four updated runners and their 62 reporting controls. Historical raw failures keep their exit codes and source identities. The earlier failed README run, interrupted native attempt and actual page-timeout failure are preserved with the diagnostic-only result. The register remains **209 unique IDs: 54 accepted / 155 open** after the independently audited upstream acceptances. New local commits have not been pushed. After the earlier API timeout and unavailable CLI credentials, automatic approval review blocked an ordinary push of `5ceef35c` before execution pending explicit approval of the outgoing history and `https://github.com/Shelamkoff/editor.git`; the fallback delivery is a Git bundle with a separate final identity and recovery receipt. Complete parity, B-HTML/B-STYLE, full C09/T15 and wider platform/IME proof remain open.

The preceding sixth continuation accepts eight additional bounded rows for Heading/List settings, Columns layouts/reduction, Raw source/preview and CaseTransform/ClearFormatting: **209 unique IDs, 54 accepted / 155 open**. Its four fixed corpora complete 102 candidate cases / 8,696 observations without candidate failures. Focused integration `run-OXtLxQ` passes both typecheck projects and 208 native cases on unchanged `24cc569c`. The [scoped review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#heading-list-columns-raw-and-tool-action-acceptance-2026-10-30) retains each exact source, raw historical failures and unsupported capabilities. This continuation changes tests/evidence only; production is identical to `69c8425e` and the preceding fully exercised runtime `a7dc4172`. Better current behavior is preserved. The earlier full matrix below remains a result for its own source; no new full-suite run or runtime fix is inferred.

The preceding full runtime matrix ran on `a7dc4172198dea9c641f5de41d4331e5a94a17b4`, tree `500d124440261953986dac14afa51d444f35ac5c`, published with the identical tree as [`0fbe8c78`](https://github.com/Shelamkoff/editor/commit/0fbe8c78d3dcc14d8a619cc152f08d6343cb3952). The [fifth integration](scripts/parity/checkpoints/2026-10-30/fifth-integration/README.md) preserves `run-k1J3Tr` as `failed` with `sourceUnchanged: false`: 11 gates pass, including 2,031 unit tests, 38 ordinary browser pages, 41 native result groups / 2,370 cases, both typechecks, package/declaration consumers, both established differential corpora and resource controls. Its documentation command exits 0 with successful build and smoke checks, but the cleanliness gate detects exactly three generated untracked assets; the tracked HEAD, tree, patch and lock remain unchanged. The only repair is one `.gitignore` line. All three documentation gates then pass in `run-0ehV77` on unchanged `369cf74e33f982eed78d5a8171e98b46e13f9fbb`, published separately as [`ae79a89c`](https://github.com/Shelamkoff/editor/commit/ae79a89c66c9b4b467e149dcaf45db2c99b0f617). A recorded diff excluding `.gitignore` is empty, so implementation, tests and build source files are identical; the full native matrix was not rerun for this housekeeping change. The summary records `validationOutcome: passed` without relabeling the original failed run. This continuation repairs explicit unknown-language fallback in Code and formatting ownership across independent editing hosts, consolidating the existing target discovery used by CaseTransform, ClearFormatting, Link and normalization. Table production required no repair; its detailed settings and seven current focus contracts now have complete bounded proof. Fresh comparisons add 47 cases / 1,862 candidate observations with no candidate failures; historical defects and the absent v1 keyed/numeric focus API remain explicit. At that checkpoint, the register reached **209 unique IDs: 46 accepted / 163 open**. These are proof obligations, not known-bug counts. The user explicitly authorized publication and retaining improved current behavior. All 17 earlier local commits are published with verified tree mappings; the second runtime batch and later ignore-only publication keep separate identities. B-HTML/B-STYLE, full C09/T15 and detailed/platform parity remain open. Earlier dated sections retain their original sources and outcomes.

The following identities belong to the original 2026-10-29 checkpoint; the preceding full runtime matrix and current scoped continuation are identified above.

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

Owned inline widgets survive legitimate field or wrapper replacement by their own block. A captured ancestry check distinguishes such replacement from adoption into another owner. Ownership is checked again after extension callbacks and before DOM publication; rejected foreign fields do not receive the live widget even briefly. This early slice did not define standalone presentation-failure recovery; the later combined continuation implements the settled §16.5 contract.

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
| C01/C02/C03/C07/C12 extension/projection contracts | Early positive and negative browser checks, including 57 projection cases and 12 installed external browser contracts | Full v1 capability coverage remains open; the later continuation settles and tests B-PRESENTATION |

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

The [preservation register](docs/architecture/rector-v2/PRESERVATION.md) retains all 209 scenario IDs. The initial checkpoint accepted **`RENDERER_CONSTRUCTION`**, on the explicit candidate and Chromium scope recorded above and in the fresh construction section of [Publication Review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#construction-parity-2026-10-29). The subsequent expanded Quote acceptance below adds **`BLOCK_QUOTE_PASTE_MERGE`**; the renderer-output acceptance below adds **`RENDERER_OUTPUTS`**. The later typography proof accepts nine FONT and two benign CLASS rows, bringing the total to **14 accepted and 195 open**. Current-version green suites are evidence for their executed assertions, not a complete v1/current/candidate differential run.

- **B-HTML:** choose and verify Raw/Carousel editor/renderer confinement while preserving permitted navigation, download, responsive layout, media, theme and accessibility.
- **B-STYLE:** settle and verify presentation preservation and destructive trust-policy boundaries before changing supported author formatting.
- **B-PRESENTATION, subsequently settled:** specification §16.5 and the combined continuation below now define and test field-local containment, independent delivery and explicit changed-descriptor retry while preserving unrelated input, tasks and selection. The earlier bounded ownership repairs alone did not close this decision. Full differential rows retain their separate proof requirements.
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


## Continuation: type dependency fitness and typography preservation

C04 now checks actual JSDoc imports/type queries, declaration imports/re-exports (including import-equals), published self-package exports and generated entrypoints through the existing TypeScript AST audit. Only executable edges participate in runtime-cycle detection; ordinary comments are ignored. Core/plugin-loader canonical vocabulary cannot borrow renderer declarations, while genuine Mention/Color companion-renderer contracts remain allowed. Five self-package negative controls reject existing-but-unpublished core/shared/removed-renderer routes and runtime use of the type-only entry.

TDD first exposed two JSDoc direction failures, five export-admission failures and one declaration import-equals gap. Auditing real generated output then exposed nine inferred planner references to the editor facade. Nine checked JSDoc annotations across the two existing planners now retain the canonical edit contract during declaration generation; the executable AST of both files is unchanged. The completed slice passed 45 focused dependency cases plus seven generated/strict consumer cases, both runtime checkJs configurations and AST comparison. It is published as `544fa1b179e8acdcdf1fcbb854243ec0e77f4a55` (original `64fef41194bb3d141ba46c03ddfc1b682ca1594a`).

The portable typography proof and standard native fixture are published as `4f1ccfd3c2364dbc2f1e3e982302c24b5ac5d0b6` (original `1a2477fa460daff462ddf843a5af162cd8aaa803`). The clean three-source run passed all 11 FONT/class cases per source, with 528 assertions each, exact loaded-source identity and no unexpected errors. Only v1's 22 exact neighboring-block remount observations on Undo/Redo are classified as repaired history defects. Size, metadata, marks/classes/language, caret and exact one-step replay pass in all three versions.

The same clean unchanged commit passed the unfiltered native-plugin page **228/228** (16:14:00–16:15:06 UTC, 65.440 seconds) and `npm test` **1940/1940**, zero failures/skips (16:14:06–16:14:31 UTC, 25.387 seconds). The three-source run took 10.421 seconds at 16:13:41–16:13:51 UTC. The [presentation-values acceptance record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#presentation-values-parity-2026-10-29) links the complete expected behavior, source hashes and reproduction requirements. These 11 accepted rows preserve existing formatting without changing sanitizer policy; demonstrated hostile-class confinement and all B-STYLE decisions remain separate and open.


## Continuation: inline containment decision control

A separate Paragraph-only experiment appended fixture-owned `contain:paint` to real pinned v1/current editor and renderer hosts. All four proposal arms preserved the bounded computed typography/class/code and actual self/blank/named navigation properties, and stopped the reproduced host-covering class. A further legitimate `201px` italic glyph control exposed visual loss: paint containment clipped its 14px left overhang in both editor and renderer (3245→3068 red glyph pixels; 177→0 outside the field). Original screenshots were visually inspected; an independent Pillow counter reproduced the measurements. The proposal was rejected without changing product CSS, adding clip margins/caps or stripping classes. The immutable sources and exact limits are retained in [HTML/style decision evidence](scripts/parity/checkpoints/2026-10-29/html-style/DECISION.md#5-additional-inline-paint-containment-control). B-STYLE remains open; computed-size preservation is not proof that all glyphs remain visible.

## Continuation: complete Paragraph and Heading templates

`BLOCK_PARAGRAPH_ROUNDTRIP` and `BLOCK_HEADING_ROUNDTRIP` are accepted within the full common template, bringing the register to **16 accepted / 193 open**. Paragraph is published as `eca19cabf1fc97ef1825f93445dc47695d5bcaa9`; the strengthened combined fixture as `384fd985a2b71d198bedf9356bd0533e9d62e610`. Each block has default, populated formatted-widget and populated unwrapped-widget cases. Fixed oracles cover canonical records, metadata/sidecars, IDs/order, real renderer tags, three output contexts, foreign focus across modes, trusted editing, exactly one Undo/Redo and resource cleanup.

The combined immutable candidate completed 6/6 cases with 948 assertions and zero failures; the standard native page passed 6/6. v1's 44 precise remount/caret observations remain visible. The specification baseline's two formatted-case read-only failures remain classified as incomplete after load; their unexecuted phases are not successes. Loaded source/dependency bytes were verified before/after; the isolated worktrees had clean tracked source and a recorded external dependency symlink. Exact commands, UTC intervals, SHA-256 values and environment are in the [acceptance record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#paragraph-and-heading-roundtrip-parity-2026-10-29).

The Table default comparison is retained separately in `37e66afab81ec83ba6a69620045ad5ddb2fe810d`: v1 creates 3×3, current creates 1×1; explicit 3×3 data works in all three sources. Table roundtrip and its default-policy difference remain open. A constructor smoke is not used to accept the whole block.

## Continuation: truthful CI outcomes

Published C11 commit `8b09ec2c4385ceddcae60db2f4d374e6f877adc0` adds the bounded existing-command result recorder, fresh artifact directories, actual browser/runtime logging and six verified Action pins. Eight process/Git controls and a real Chromium failure-to-success control passed. Failed prerequisites leave downstream commands not-run; source changes, interrupted commands, incomplete helpers and repeated rejected attempts cannot become PASS from historical logs. Existing workflow permissions, matrices, engine coverage, concurrency, timeouts and archive/upload semantics are preserved. The [review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#current-verification-result-ownership-2026-10-29) records pin provenance and successful Node/package/docs/size jobs on the actual published commit, without treating a still-running or subsequently canceled browser job as complete.

## Continuation: List, Quote and Warning roundtrips

The three additional full templates are published as `71a0d4d5558696a8a7d23e4221fc5e7deb7721f6`, `efae6d0e2b27cc184a53c1870725c6f81823150d` and `e38dd79ff3bdc707d961805dc1121011f351d553`. Their original and published trees were compared after fetch; publication preserves the exact tested files. The register now has **19 accepted / 190 open** obligations. Open rows are uncompleted proof obligations, not a defect count.

Each block has actual default, fixed populated formatted-widget and unwrapped-widget cases. List also verifies current item IDs. Quote and Warning independently preserve both rich fields and their renderer slots; native input edits the primary text/title, with caption/message verified as unchanged siblings. The latest cumulative candidate completes 15 cases and 2514 assertions with zero failures; the standard native page passes 15/15. v1's 149 exact remount/selection differences remain visible and narrowly classified. The specification baseline's five formatted-widget cases stop after load, with subsequent phases explicitly incomplete. No candidate exception is accepted.

Three-source runs and native pages used frozen isolated base-plus-three-file-patch checkouts with a recorded dependency symlink. All source/dependency identities remain unchanged; committed files match those exact proof inputs. The [acceptance record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#list-quote-and-warning-roundtrip-parity-2026-10-29) includes separate cumulative counts, commands, UTC intervals, source hashes and limitations. These test/evidence additions do not modify runtime behavior or accept secondary-field native authoring, other block actions or the remaining built-ins.

## Continuation: reviewed dependency patches

Published `f845b9ae0e4ed43bb980fe77c8d9366d750d4ec7` updates DOMPurify to 3.4.17 and resolved development patches Vite 7.3.7/source-map-js 1.2.2, preserving ranges, sanitizer policy and Node support. Official upstream objects, registry tarball integrity, all lock entries and attribution were reviewed. Three consistency tests first failed, then passed. A seven-case enforced Trusted Types corpus includes a real owning-window policy observation and a deliberately wrong-realm negative control. Both original and updated dependencies preserve the bounded allowed markup.

The [dependency checkpoint](scripts/parity/checkpoints/2026-10-29/dependencies/README.md) retains exact sources and limitations: ordinary pages 35/35 before/after, package/declarations/assets, documentation, both checkJs configurations and native-plugin 228/228 passed. The 1942-test unit run passed while its wrapper observed an unrelated untracked documentation temporary directory; the recorded `sourceUnchanged: false` is preserved. This is bounded maintenance evidence, not a new whole-library freeze or resolution of B-HTML/B-STYLE. Subsequent core work is verified independently on its own frozen source.

## Continuation: plain-text Code roundtrip

`BLOCK_CODE_ROUNDTRIP` is accepted on published `9c038c805132e902db45b67beb821f77a4798822`, the exact tree of original `2d9923c0e6a81b0a7270f3e1cf6edb3f3c581304`. Real empty/default and fixed multiline JavaScript cases preserve literal source, language, textarea visibility/read-only/identity/caret, rendering and one native Undo/Redo. No rich-text sidecar or syntax-color guarantee is invented. The shared cumulative suite completes 17 cases and 2872 assertions with zero candidate failures; the native page passes 17/17. Historical Code remount/textarea-caret differences are exact observations; both Code cases pass in the specification baseline.

The source reader's first 1 MiB buffer could not verify v1's 1,080,490-byte highlighter and correctly failed that probe. The final test-only 64 MiB limit allows exact Git-byte verification without weakening identity checks. All frozen sources remain unchanged, and committed test blobs match those inputs. The [Code review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#code-roundtrip-parity-2026-10-29) records complete counts, hashes, times and the unbundled-versus-installed highlighting boundary. The register now has **20 accepted / 189 open** obligations.


## Continuation: Checklist, Delimiter and scoped Image proof

Checklist and Delimiter are accepted on published `f5ae4130` and `7bfa26df`, bringing the register to **22 accepted / 187 open** obligations. Checklist preserves actual defaults, label/state/item identities, widgets, rendering and native one-step history. Delimiter has no editable field: its empty payload/HR and modes create no history, while a separate actual neighboring edit proves preservation through one Undo/Redo. Review corrected an overly broad nullable-field test branch before the final strict proof; its earlier exploratory run is superseded.

The strict cumulative Delimiter differential completes 22 cases with 3648 candidate observations and zero failures; the standard native page passes 22/22. All three sources' loaded Git/dependency bytes are checked before/after, and test files match their frozen base-plus-patch inputs. The [Checklist/Delimiter record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#checklist-and-delimiter-roundtrip-parity-2026-10-29) retains separate counts, exact historical classifications, timings and source hashes.

Published `3f2c9acf` adds only scoped literal-caption Image proof: cumulative 24 cases / 3926 candidate observations and native 24/24, all green on unchanged sources. **Image's full row remains open.** Real caption widgets expose stale derived alt and backward-selection loss on inline-only updates. These current capabilities cannot be discarded because v1 lacks the same Image inline declaration. Their failing tests and repairs are a separate slice. [Partial Image evidence](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#image-literal-caption-proof-2026-10-29) states the limitation explicitly; the accepted-row count stays 22.


## Continuation: open and closed Toggle roundtrips

`BLOCK_TOGGLE_ROUNDTRIP` is accepted on published `5d1a39b4`, the verified tree of original `b3a2f16b`. Four cases preserve actual defaults, formatted/unwrapped widgets, both rich fields, open/closed content, accessibility relationships, renderer structure and one native title edit with Undo/Redo. Hidden content remains present and independently stable. The cumulative candidate completes 28 cases / 4632 observations with zero failures; the standard native page passes 28/28. Pinned real v1/specification controls retain tightly classified historical differences and explicitly incomplete phases. The [review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#toggle-roundtrip-parity-2026-10-29) records exact sources, hashes, timings and scope. The register now has **23 accepted / 186 open** obligations; Image remains partial.

## Continuation: Spoiler and Columns roundtrips

`BLOCK_SPOILER_ROUNDTRIP` and `BLOCK_COLUMNS_ROUNDTRIP` are accepted on published `a03dfd87` and `43254ba6`, whose trees match original `7af7f627` and `567e99de`. The added fixed cases preserve independent fields, sidecars, DOM ownership, transient disclosure or fractional grid, renderer output and one real native first-field edit with Undo/Redo. The cumulative candidate passes **34 cases / 5706 observations**, and the native page passes **34/34**. v1 retains 346 precisely classified remount/caret observations; ten formatted specification-baseline cases remain incomplete after load. Every run has unchanged pinned sources and verified loaded dependencies.

The register reaches **25 accepted / 184 open** obligations. [The detailed acceptance record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#spoiler-and-columns-roundtrip-parity-2026-10-29) records each frozen patch, command interval, exact source hash and scope. These templates do not accept separate disclosure/layout actions or second-field native authoring. Image's widget/alt boundary remains separate.

## Combined core continuation 2026-10-29

Published `0fecf490fe8a57188ac9edb502d2803743c29883` has exactly the tested merged tree `820823b30699871a132d4dab207cd9c871af079e` from local `1b1db09196fd96b4377b167346385762a3972838`. The preceding clean integration `0cf0cc72a12a2995e22e73cf75c2e29ef91bd476` contains the same production code, core tests, package and lockfile. The merge adds only ten listed parity fixture/documentation files for Spoiler and Columns.

C12 contains failed standalone presentation at the affected field. Healthy fields keep their DOM, backward selection, widgets, tasks and trusted pending input. Unchanged failed descriptors do not retry automatically; an explicit changed descriptor permits a new attempt. Ownership is validated again after callbacks, including mode cancellation and inverse failures. This uses the existing owners without adding a public recovery surface or a second model.

C09 removes redundant copying at the already-owned public snapshot boundary while preserving detached nested data, frozen envelopes and strict external JSON checks. C07 gives the existing phase getters/callbacks exact unions without changing executable behavior. Inline payload projection preserves unrelated Text nodes and ranges with linear slot validation; the rejected quadratic variant and measured comparison remain archived. C10 adds an actual live-editor heap proof of history eviction, including retained/released controls and real Undo/Redo, without changing production history behavior.

The clean unchanged integration passed **1962/1962 unit tests**, both checkJs projects, all **35 ordinary browser pages**, the complete unfiltered native gate (**2128 cases across 41 arrays**, plus base Enter/toolbox/history scenarios), installed-package checks and documentation contracts. The fresh heap gate retained zero of 23 disposed sentinels; evicted authored payloads disappeared while the editor and newest history action remained alive. The integration's 28-case differential passed 4632 candidate observations. After merge, the expanded three-source run passed **34 cases / 5706 candidate observations**, and the native roundtrip page passed **34/34**. Counts overlap earlier focused runs and must not be summed.

[The retained core evidence](scripts/parity/checkpoints/2026-10-29/core-continuation/README.md) supplies all ten completed command records, exact source identities, environment and log hashes, as well as the original failing TDD stages. A compact source map reconstructs all 25 original integration commits from 88 blobs reachable in the published branch. The separate benchmark reconstruction verified 258 module hashes and three locks; it was a prepare-only check, not a new timing run.

These results are from Linux, Node `v24.22.1` and Chromium `142.0.7444.175`. Image's unrelated-text/backward-range defect is repaired; its derived `alt` after caption widget hydration or update remains open. C09/T15 still requires populated structural authoring, native input, scheduled publication/UI and allocation comparisons. No general speed or heap guarantee, other-browser acceptance, complete Image acceptance or additional preservation row is inferred from the core gates.

## Attaches roundtrip continuation 2026-10-29

`BLOCK_ATTACHES_ROUNDTRIP` is accepted on original `ab1c73ea6151a209443dc633dc83dfd9355ec61e`, with exact frozen patch and committed bytes verified. The actual empty default and two populated files preserve literal names, metadata, renderer outputs, mode ownership and one real first-name edit with exact Undo/Redo. Expected mode control replacement is paired with stale-field/button rejection and unchanged block ownership; author edits and replay preserve the active field nodes.

On published production core `0fecf490`, the expanded differential passes **36 cases / 5979 candidate observations**, and the native page passes **36/36**. Both are unchanged-source runs; the earlier interrupted process has no accepted outcome. [The detailed record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#attaches-roundtrip-parity-2026-10-29) gives the exact historical classifications and all timestamps/hashes. The register reaches **26 accepted / 183 open**; actual download activation, provider actions and other detailed Attaches rows remain separate.

## Table default restoration 2026-10-29

The requested v1 preservation restores no-data Table construction from 1×1 to the documented 3×3 default. Only the schema default changes; explicit dimensions, stable identities, version 2 and one-cell conversion import remain intact. Test-first `0b49265c` and implementation `2a3dd162` are integrated as `3ea19eb1` and `e1790dce`. All seven files match the isolated proof exactly.

Corrected focused RED was 76/78 unit and 2/3 native; GREEN is 78/78 and 3/3. The full clean-source verification then passed **1967/1967** unit tests, both typecheck projects, **7/7** generated consumers, docs contracts and **15/15** selected native Table cases. The earlier timestamp-oracle mistake is retained as invalid fixture evidence. [The detailed record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#table-default-restoration-2026-10-29) and checkpoint JSON preserve commands, source maps and limits. Full Table roundtrip acceptance remains separate; the register stays 26 accepted / 183 open.

## Documentation acceptance after core, Attaches and Table

Clean unchanged `c557efd8` passed both `npm run test:docs` and the complete `npm run docs:check`. The built site has **127 HTML pages**, zero broken links, 47 localized README pairs and no missing assets. Actual RU/EN, light/dark browser examples passed search, Mention, heading and conversion menus, selection, alignment, moved block controls and atomic history/conversion checks. Source and test expectations were not weakened.

The first attempt correctly rejected a stale generated Table README; rebuilding the package updated it. The next site smoke identified unformatted API terms in the new Russian review; that prose was corrected before the accepted run. Both failed attempts keep their original outcomes in [the command records](scripts/parity/checkpoints/2026-10-29/core-attaches-table-docs-verification.json). This subsequent outcome-only note and JSON archive do not alter runtime code or claim another test execution.

## Raw roundtrip continuation 2026-10-29

`BLOCK_RAW_ROUNDTRIP` is accepted on original `069ae946`: actual empty/default and populated multiline source, benign renderer markup, existing preview disclosure, visible textarea, trusted input and exact native history. The new cases preserve literal entities and token-looking author text without treating source as a rich field.

The frozen three-source run passes **38 cases / 6325 candidate observations**; the standard native page passes **38/38**, with unchanged exact sources and dependencies. [The detailed record](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#raw-roundtrip-parity-2026-10-29) and retained JSON identify all raw historical differences and full command intervals. No new baseline/candidate exception or HTML-policy acceptance is introduced. The register reaches **27 accepted / 182 open**.

## Gallery renderer caption continuation 2026-10-29

Original test-first `3c6c3f85` and production `46c136b4` repair Gallery grid image alternatives and figure accessible names. The renderer now derives both from one call to its existing owning-document inline parser, preserving literal entities with exactly one decode and actual registered Mention/Color labels. Canonical captions, inline records, layout and renderer lifecycle remain unchanged.

The same standard browser oracle first executed **150 assertions: 84 passed / 66 failed**, then passed **150/150** after the minimal renderer change. Both source snapshots stayed unchanged during their runs. Separate renderer unit tests passed **122/122**, and both checkJs projects passed. Fixed literal/widget expectations cover saved and intact input, auto/specific/masonry layouts, detached and mounted output, main and iframe documents, empty-caption fallback and cleanup. [The retained verification](scripts/parity/checkpoints/2026-10-29/gallery-caption-renderer/verification.json) includes original command manifests, hashes and peer-review scope.

Gallery editor-derived alternatives, opened-viewer captions and the complete Gallery ROUNDTRIP remain open. No register row is accepted by this bounded fix; the count stays **27 accepted / 182 open**.

The GitHub run for published `9ad09132` passed Node 20.19/22/24, package, documentation and size jobs. Its browser job failed one native cross-selection scenario in Chrome **156.0.8078.47**: an actual drag ended at offset 0 instead of 2 before the inline-widget Shift-navigation assertion. This is a current investigation, not a green release gate; prior Linux Chrome 142 results keep their original scope. The exact [run](https://github.com/Shelamkoff/editor/actions/runs/40940818306) and raw job log identify the failure without weakening the expected selection.

## Embed and Table roundtrip continuation — 2026-10-29

The shared roundtrip obligations for Embed and Table are now accepted. The executed final combined source is `45de0c4d`; the three integrated files in `65b4ee9d` match it byte-for-byte. Embed was separately integrated in `6b80631f`. See the [complete comparative review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#embed-and-table-roundtrip-parity-2026-10-29), [Embed evidence](scripts/parity/checkpoints/2026-10-29/embed-roundtrip/README.md) and [Table evidence](scripts/parity/checkpoints/2026-10-29/table-roundtrip/README.md).

The final 45-case comparison has 7553 current observations and zero failures; the standard native page passes 45/45. v1 has 7487 observations and 519 exact classified differences; the specification baseline has 5759 observations and 61 classified differences, with twelve explicitly incomplete cases. Its paired Embed Redo error is retained and strictly classified. Both commands exited zero on unchanged source; the complete raw traces, failed attempts, original C11 manifest and source patch are committed. The proof runs on Node 24.22.1 and Chromium 142.0.7444.175.

Embed keeps its actual default, local preview and supported current rich captions while explicitly recording v1's missing rich-caption capability. Table keeps the restored 3×3 default and fixed 2×2 headed rich-cell content, identities, mode transitions, output and one native edit/Undo/Redo. The register is **29 accepted / 180 open**. These are proof obligations, not a count of defects. Provider actions, detailed Table commands, full Image/Gallery behavior and the remaining whole-library comparison stay open.

## Field completion and Image roundtrip 2026-10-29

Published `a4a8c471` adds the optional synchronous `BlockInstance.afterProjection(field)` contract. The existing reconciler captures the original callback and grants it the exact completed rich field after hydration, before accepting canonical/history changes, including native normalization with no canonical change. It retains the existing failure recovery and observation guards. Image uses the completed caption and its exact current view relationships to update only its owned alternative text. The [immutable core checkpoint](scripts/parity/checkpoints/2026-10-29/field-projection-completion/README.md) retains the test-first failures, rejected writes/adoptions, final source hashes and package/type/browser results.

The [Image ROUNDTRIP proof](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#image-roundtrip-parity-2026-10-29) now covers all four cases: empty default, literal caption, real Mention/Color widgets inside authored marks, and the unwrapped-widget control. The unchanged-source final differential passes **47 cases / 7945 current observations**, including **670/670 Image observations**. The standard native page passes **47/47**. Both final commands used Chrome **156.0.8078.47**. The full traces, original failed raw probe, C11 manifest and 2093 rejected classifier mutations are in the [Image checkpoint](scripts/parity/checkpoints/2026-10-29/image-rich-roundtrip/README.md). The register reaches **30 accepted / 179 open**; detailed Image upload, sizing, cropper and provider actions remain separate obligations.

The subsequent whole-library gates have mixed outcomes. On the frozen integrated core, typecheck, package and **1967 unit tests** pass. A two-line Russian documentation correction resolves the initial docs-browser failure; the continuation passes the complete docs browser check and **36 ordinary browser pages**. Its unfiltered native run reaches the last design page, where **82/84** checks pass and two Table checks at 288px fail. The failed run has no final native aggregate and is retained as failed. Separate heap verification on that same production source passes: **23 destroyed-instance sentinels, zero retained**, plus live history eviction and exact Undo/Redo. A focused diagnostic confirms the default 3×3 table stays inside its scroll wrapper and all cells remain reachable; its test-contract correction is a separate pending slice.

The [remote run for `894dfc09`](https://github.com/Shelamkoff/editor/actions/runs/40958079298) passes Node 20.19/22/24, package, docs and size jobs. Its browser job fails the separate Shift+ArrowDown case at focus offset 1 instead of the expected 2; all four added atomic-boundary pointer controls pass. This remote failure and the local Table assertion are not counted as green gates. Person, Gallery and remaining detailed preservation rows continue separately.

## Gallery and Person common roundtrips — 2026-10-30

`BLOCK_GALLERY_ROUNDTRIP` and `BLOCK_PERSON_ROUNDTRIP` are accepted within their four-case common templates. The [dated review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#gallery-and-person-roundtrip-parity-2026-10-30) links the frozen sources, original C11 outcomes and exact historical classifiers. All **209 IDs** remain: **34 accepted / 175 open**. The separate preceding LinkPreview/Poll acceptance accounts for the intervening two rows; no detailed Gallery/Person row is newly accepted here.

Gallery production `4bfb3942` already passed the bounded template. The four cases prove actual empty defaults, literal and wrapped/unwrapped real caption widgets, fixed media/style/options, accessible renderer labels, modes, native input and one Undo/Redo. The isolated differential records **703/703 Gallery candidate observations** and **9832/9832 across its 57-case corpus**; standard native coverage is 57/57 on Chrome 156 and Gallery 4/4 on Chrome 142. Its initial process failure represents unclassified historical differences, not a fabricated candidate defect.

Person's frozen `b1bf7bc9` repairs initially empty detached multi-profile output, retains the same cards/widgets during responsive carousel activation, and preserves completed tab labels when selecting another profile and returning. The real detached-output and tab regressions have unchanged-fixture RED/GREEN records. The isolated differential records **926/926 Person observations** and **10055/10055 across its 57-case corpus**. Chrome 142 passes Person 4/4 and renderer 2/2; related isolated unit files pass 135/135 and both type configurations pass.

The two cumulative runs overlap the earlier 53 cases; they are not added together or described as one merged run. The combined fixture has 61 unique specifications with all prior fixed inputs retained. Both v1 blocks lack persistent rich-field widget support; raw reference differences remain visible and the two widget cases per block are labeled unsupported reference capabilities. Each specification baseline has two rich cases incomplete after load; no missing phase is a pass and no candidate failure is classified away.

At that checkpoint, never-opened inactive Person widget-name tabs remained an open presentation gap; the later continuation below repairs it. The accepted switching control preserves a name that was already completed while its field was mounted. All four detailed Gallery rows, five detailed Person rows, all seven Carousel rows at this checkpoint, `B-HTML`, `B-STYLE`, complete structural `C09`/`T15` performance acceptance and whole-library/platform coverage remain separate obligations. The scoped repairs do not establish full v1 parity.

## Carousel common roundtrip acceptance 2026-10-30

The [Carousel review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#carousel-roundtrip-parity-2026-10-30) accepts only `BLOCK_CAROUSEL_ROUNDTRIP`, following the isolated proof and complete final combined validation in `run-M5oL2Z`. All 209 IDs remain with **35 accepted / 174 open** obligations. The interim merged differential below retains its original source and outcome; the final integration is recorded separately.

Actual isolated C11 `run-64mauO` uses clean source `942467e2669064433e2b50a14dbdd0df4df01d2b`, tree `4bd0667b6eda0d4d222d1f22380384394c0e072a`. All eight gates pass on unchanged source. The candidate has **718/718 Carousel observations** across actual empty, literal mixed-media, wrapped-widget and unwrapped-widget cases, and **9847/9847 across its 57-case corpus**. Native Carousel passes 4/4 and projection contracts 147/147 in both Chrome 156 and 142. Existing native Carousel media controls pass 16/16; README contracts validate 47 pairs.

The actual installed dependency is published Carousel `f7f6485886a1d77f9213d9079eb70000efeff499`, with all 47 distribution files verified against the narrow upstream fix. The real automatic-height RED and dependency/packaging investigations remain archived; final checks use automatic height with no ratio workaround, observer monkeypatch or new error exemption. No further Rector production runtime fix was needed for this common template.

Raw comparison retains 91 v1 and 32 specification-baseline Carousel failures. v1 persistent caption widgets remain an explicitly unsupported capability; the two rich baseline cases stop after load and keep their remaining phases incomplete. Strict recognizer replay matches 123 historical records and rejects 2418 altered controls plus 1649 PASS observations. The current candidate receives no historical exception.

The parent `differential65` gate in `run-2Zb0Ur` passes on clean immutable `9ccae3589fed3cc9f601fdf847654efbdcb1d584`, tree `49caefb7386d24612c36a86e603cfa634da9c178`: **65 cases / 11458/11458 candidate observations**, including 718 Carousel observations. v1 records 11258 observations and the baseline 8043; all sources have zero unexpected failures or unexpected error-channel reports. Source identity and unchanged bytes are verified. The historical browser command later failed in three Gallery cases. That run remains failed; its successful comparison is not relabeled as a passed full browser gate.

The shared fixture now contains 65 unique cases covering the exact 21-type built-in registry. The earlier parent differential is recorded above; the final combined differential and complete native/browser validation are recorded in `run-M5oL2Z` below. The three isolated 57-case corpora overlap the earlier 53 cases and are never added. The six detailed Carousel rows (`MIXED`, `STRUCTURE`, `CONTROLS`, `AUTOPLAY`, `HTML`, `TASKS`), detailed Gallery/Person rows, `B-HTML`, `B-STYLE`, full `C09`/`T15`, platform breadth and whole-library parity remain open.

## Final combined continuation 2026-10-30

`run-M5oL2Z` verifies the source published as [`fc669f9178a6ea9d8d566380e450fb47fa7c595f`](https://github.com/Shelamkoff/editor/commit/fc669f9178a6ea9d8d566380e450fb47fa7c595f), originally `6409e2d24585ac69bc0d991f8c096674c3905a27`, tree `0d65a81e4678088fa07d59b7c1539793b0ab47c9`. The full tree equality establishes source equivalence; it is not a second run on the remapped commit ID. All ten gates and the whole run passed with unchanged source, finishing 2026-10-30 03:02:16.865 UTC. The [final integration checkpoint](scripts/parity/checkpoints/2026-10-30/continuation-final-integration/README.md) preserves the original source-specific manifest and complete logs.

The unchanged source passes **2027/2027 unit tests**, both source typecheck configurations, package build, generated consumers, documentation contracts and installed-package checks. Browser coverage: **36/36 ordinary pages; 41 native result groups, 2,247/2,247 passed**. Heap/resource controls: **23 sentinels; 0 retained; all three history eviction/release phases and the 12 → 11 replay control passed**. The three-source differential passes **65/65 candidate cases and 11,434/11,434 candidate observations** across all **21 built-in block types**, with no unexpected candidate failure. Historical source capability limits, exact classified differences and incomplete phases stay explicit.

Production documentation builds 127 HTML pages with zero broken links or missing assets. Browser smoke passes for 21 block and 2 inline plugins, EN/RU navigation and light/dark controls.

The shared fixture bytes are unchanged from the earlier 11,458-observation comparison. Its 24 fewer candidate observations are six conditional retired-field checks in each of four Person cases: the repaired source retains healthy field hosts. No fixture case or assertion was removed. Existing identity/content/native-input/history controls still execute for retained fields. The earlier `run-2Zb0Ur` browser failure remains recorded separately.

The bounded Table comparison (five warmups, 21 alternating paired samples) lowers public/native synchronous p50 from 62.4/89.2 to 59.9/82.4 ms, while public p95 rises from 74.2 to 88.6 ms and native p95 changes from 100.5 to 100.7 ms. Sampled V8 allocation totals fall by 33.6% and 30.7%; they are not RAM or per-edit byte counts. All 24 functional/sensitivity controls pass, with zero retained objects in 1,008 WeakRef observations per measured source/shape group and live positive controls. The [final integration checkpoint](scripts/parity/checkpoints/2026-10-30/continuation-final-integration/README.md) retains exact comparison data. These measurements do not establish a universal speedup, latency guarantee or full C09/T15 acceptance.

The fresh integrated result confirms the scoped Person/Gallery/native-input/Table repairs and accepts the common Carousel template. The preservation register now contains **35 accepted / 174 open** obligations; those numbers count proof obligations, not known defects or completion percentage. The never-opened Person widget-name label was still a confirmed bug in this run; the later continuation below repairs it. B-HTML/B-STYLE, full structural C09/T15 performance acceptance, detailed capability matrices and wider browser/platform coverage remain open. No full-library parity or universal performance improvement is claimed.


## Person, Gallery, CSS and canonical reads continuation 2026-10-30

The [completed combined checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/next-integration) records `run-sWvJG9` on the exact published source above: **2,031 unit tests**, both typecheck projects, build, **7 declaration contracts**, installed-package consumers and **22 CSS assets**, both three-source differentials and the complete browser command pass with unchanged source. Browser coverage is **38 ordinary pages and 41 native groups / 2,256 passing cases**, followed by the heap/resource controls. The integrated native plugin page has **248/248** and native core behavior **67/67** passing cases.

The common differential has **65 cases / 11,434 candidate observations**, and the separate Gallery caption-order corpus has **six cases / 378 candidate observations**. Neither candidate receives historical exceptions, incomplete phases or unexpected errors. Scoped `BLOCK_GALLERY_CAPTION_ORDER` acceptance brings the register to **36 accepted / 173 open**, preserving all 209 IDs. Person's never-opened widget-name label is repaired through the captured pure `toText` and scoped `getFieldText` contract, without hidden widget/provider acquisition. The active label retains `afterProjection`. CSS uses its owning browser's parsed declaration block, preserving valid variables, comments, escapes and priorities within the original property allowlist.

Internal `peek`/`has` reads eliminate redundant copies while producers and schema code keep detached inputs. A separate quiet-window 20×20 Table comparison uses five warmups and 21 alternating pairs. Browser public/native paths avoid 862 JSON-record visits and two structured-payload traversals. Timing remains mixed: public p50/p95 **64.6/81.7 → 65.3/93.0 ms**, native **74.4/100.3 → 73.5/88.7 ms**; public/native are faster in only 9/21 and 10/21 pairs. Sampled allocations decrease for those edit sequences but increase for empty no-ops. No stable latency or RAM improvement is claimed; complete C09/T15 stays open. B-HTML/B-STYLE, detailed capability rows and wider browser/platform acceptance also remain open. Documentation after this source is verified separately.


## Table, Carousel, Person and Checklist continuation 2026-10-30

**All nine combined gates pass on unchanged source.** Run `run-a4BfOk` tests `d9e935dec7eae3bb3b983d1a3c5b544316a5eefb`, tree `f90fa22af6b4149e43972b204da9261502c1f48f`, published exact-tree counterpart [`82cf56f1`](https://github.com/Shelamkoff/editor/commit/82cf56f1793c454191b2ff2fef40c4929bf352e7). Completion: `2026-10-30T10:13:37.305Z`. The checkpoint retains the original manifests, raw logs and source identities.

### Table and Carousel repairs

The Table repair in `103aa48b` preserves the active formatting when native `Enter` inserts a line break. It keeps the existing field-split admission check and delegates the admitted action to the shared native input owner. With `<b>Alpha</b>` as input, the following trusted `X` belongs on the next visual line inside the bold wrapper. Enter and typing remain separate history actions. The [Table checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/table-authoring-native/README.md) retains the original failure, the correction, selection/formatting controls, and row/column/header actions from the first and last active cells. The pinned v1 investigation preserves a separate terminal-break placement defect; reproducing that defect is not an acceptance condition. Its detached post-Undo DOM observations are not used as legacy caret or history proof.

The Carousel repair in `3c8aa68e` selects the first newly added slide after a source batch, a single URL or a single HTML submission. It applies that selection during canonical projection, before committed listeners run, and resets a previous manual settings target only when that accepted addition activates the new slide. Ordinary metadata updates retain their existing settings-selection behavior. The [Carousel checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/carousel-source-selection/README.md) records native caption input, mixed image/video/HTML neighbors, and two separate keyboard Undo and Redo actions for each addition path. Controls cover later listener navigation, revoked-task completion, settings-target alignment and bounded canonical recovery. The three-source record contains three cases and 83 observations per source, retaining nine v1 history failures and six specification-baseline selection failures. No candidate exception is granted.

The initial Carousel recovery exploration exposed a separate loss of keyboard ownership after a failed projection remounted the block. Its failed native shortcut remains in the archive. The Carousel recovery control itself is limited to canonical data/history and remount from the initial Alpha view using public Undo/Redo; it does not establish native recovery focus or arbitrary prior-view restoration.

### Person controls and Checklist acceptance

Six new Person native cases extend coverage without changing production code: two active-middle removal cases, two tab-reorder cases, adding and editing a profile, and the first focus request for a hidden URL. They exercise real keyboard history, complete records and IDs, hidden fields, widget sidecar removal/restoration, neighboring blocks and caret state. The [Person checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/person-cards-native/README.md) separates those controls from a three-source comparison of three literal-profile scenarios. That comparison retains 14 raw v1 failures after addition/removal loses keyboard ownership; it has no automatic historical classifier. It does not establish a rich-widget reference comparison or accept the full `BLOCK_PERSON_CARDS` or `BLOCK_PERSON_HIDDEN_FOCUS` rows.

The already recorded acceptance of `BLOCK_CHECKLIST_EMPTY_EXIT` covers eight cases and 222 candidate observations, with no production change. The [Checklist checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/checklist-empty-exit/README.md) covers empty, BR-only and formatting-only sole/last items, plus visible-markup and real Mention/Color controls, a preceding native edit, and two independent keyboard Undo/Redo actions. Its raw comparison retains five historical v1 differences across 217 observations and 35 specification-baseline differences across 222 observations. The raw command exits 1; the separate review independently reconstructs fixed author records and validates the exact historical values. It grants no candidate exception. The register retains **209 unique scenario IDs: 37 accepted / 172 open**. Historical counts elsewhere describe their dated checkpoints.

### Core recovery and combined validation

The [core recovery repair](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/projection-recovery-focus), published in [`82cf56f1`](https://github.com/Shelamkoff/editor/commit/82cf56f1793c454191b2ff2fef40c4929bf352e7), restores keyboard ownership to the accepted rebuilt shell when a failed projection retires its focused button or wrapper. It keeps the existing logical-selection owner for authored fields and fieldless blocks. A newer focus cancels the fallback, including parent-document focus for an iframe editor. Scope, map, record, generation and mode are rechecked before the single focus attempt. The original error, canonical data, history and scope retirement remain intact. Seven native controls cover the original failed-source Undo, another editor, newer foreign and neighboring focus, backward keyed selection, the fieldless duplicate-restoration regression and the iframe regression. No previous auxiliary control or arbitrary active-slide restoration is promised; no public API is added.

The [third integration checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/third-integration) records the completed commands on the final unchanged source. The table uses that run only; overlapping scoped totals are not added.

| Combined check | Recorded outcome |
| --- | --- |
| Unit tests | 2,031/2,031; zero failures or skips |
| Both source typecheck projects | Both configurations pass |
| Package build, declaration contracts and installed consumers | Build passes; 285 declarations, zero diagnostics; 7 declaration contracts; installed Bundler/NodeNext/Vite/browser consumers and 22 CSS assets pass |
| Documentation contracts | README validation passes in build; the final documentation/site run is recorded separately in this checkpoint |
| Ordinary browser pages | 38 pages pass |
| All native result groups, including the initial JSON groups | 41 groups / 2,297 cases pass, counted once from the final aggregate; plugin parity 289, core behavior 67 |
| Heap/resource controls | 23 disposal sentinels, zero retained; all three history-eviction phases and the live Undo control pass |
| Three-source common corpus and applicable detailed comparisons | 65 common cases / 11,434 candidate observations; 6 Gallery caption-order cases / 378 observations; zero candidate exceptions or incomplete cases |
| Source identity and immutability | All nine gates pass with unchanged source; the published tree is identical to the tested tree |

This continuation adds no performance measurement or broader acceptance claim. Full Carousel structure, the remaining detailed Person/Table/Checklist actions, `B-HTML`, `B-STYLE`, structural `C09`/`T15`, wider platform coverage and whole-library parity retain their separate obligations. Later documentation and archive verification must identify its own source and run.

## Table settings, focus and formatting continuation — 2026-10-30

The [fifth integration](scripts/parity/checkpoints/2026-10-30/fifth-integration/README.md) records the completed original run and publication of `a7dc4172`, retaining its failed cleanliness result. Eleven original gates pass. The documentation command also exits 0, but three generated untracked assets make its gate fail while all tracked source identities remain unchanged. Only `.gitignore` changes in the repair; three separate documentation gates pass on unchanged `369cf74e` in `run-0ehV77`. The original manifest and the successful repair remain separate, with no new full native run.

Code keeps explicit unknown languages as literal source, preserving automatic highlighting only where selected. The shared formatting collector respects independently owned nested editing hosts and still permits an explicitly selected inner host. Existing Link/atomic/BR controls remain green. No new transaction, selection or lifetime owner is introduced.

Two detailed Table settings rows and seven public-focus obligations are accepted by the [bounded review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#table-settings-and-public-focus-acceptance-2026-10-30). The Table fixture covers both heading modes, all existing row/column controls, minimum-size no-ops, widget deletion and exact independent native history. The focus fixture preserves truncation/clamping and first-request acknowledgment without adding history. v1 has no numeric/keyed focus API; its distinct public-focus/native-navigation control remains separate. Earlier caret and ownership defects are not restored to force historical equality.

The original combined matrix passes 2,370 native cases in 41 array groups, including 333 plugin and 121 tool cases. The five raw comparisons retain their exit 1 and historical failures; candidate observations all pass. This accepts only the nine named rows and leaves 163 separate obligations open. Complete Code/tool actions, B-HTML/B-STYLE, structural C09/T15 and wider platforms retain their requirements.

## Heading, List, Columns, Raw and tool actions — 2026-10-30

The [sixth scoped review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#heading-list-columns-raw-and-tool-action-acceptance-2026-10-30) accepts exactly eight additional obligations, retaining all **209 IDs: 54 accepted / 155 open**. Production remains unchanged from `69c8425e` and runtime `a7dc4172`. No new production bug or full-suite execution is claimed.

| Retained proof | Frozen source | Candidate cases / observations / FAIL |
| --- | --- | --- |
| [Heading levels and List styles](scripts/parity/checkpoints/2026-10-30/text-block-settings/README.md) | `d483be74` | 21 / 2,323 / 0 |
| [Columns layouts and lossless reduction](scripts/parity/checkpoints/2026-10-30/columns-layouts/README.md) | `b7ac6638` | 12 / 2,880 / 0 |
| [Raw source and preview](scripts/parity/checkpoints/2026-10-30/raw-source-preview/README.md) | `90b28965` | 21 / 1,421 / 0 |
| [CaseTransform and ClearFormatting](scripts/parity/checkpoints/2026-10-30/tool-actions/README.md) | `9cb70473` | 48 / 2,072 / 0 |

These four corpora contain 102 candidate cases and 8,696 observations; they are separate from the earlier full native matrix. Each proof uses actual controls/input/history with fixed author expectations and pinned v1/spec sources in Chrome 156. The checks retain rich data, widgets and identities, separate actions and canonical no-ops, selection and relevant UI lifetimes. Detailed scopes and independently reviewed oracle limits are recorded in their checkpoints.

Historical results remain raw: Heading/List retains 29 v1 failures, four absent v1 toolbox variants, 185 specification-baseline failures and ten page errors. Its completed final JSON is retained, but the actual shell exit was lost during the interrupted wait; expected exit 1 is not described as observed. Columns retains 30 v1 failures and six absent menu cases; Raw retains 226 v1 and 30 baseline failures; tools retain 278 v1 and 258 baseline failures plus four unavailable/incomplete v1 atomic-only cases. Those three process exits are recorded as 1. Failed observations can share one cause and are not distinct-bug totals. Better v2 behavior remains intact.

The [focused integration](scripts/parity/checkpoints/2026-10-30/sixth-integration/README.md), `run-OXtLxQ`, passes all six gates on unchanged `24cc569c2fdcb3f115417ae895a01084858cdf67`, tree `a3a77a3670e6b17f8000b4cd95720eec1a7edc2a`: both typecheck projects and **208/208 native cases**. Actual counts are Heading/List 21, Columns 23, tool actions 48, the full source-indentation page 54 and the full source-modes page 62. The two source pages include Code controls and are not wholly Raw counts. `sourceUnchanged` is true. The fetched published counterpart [`0cceb84e`](https://github.com/Shelamkoff/editor/commit/0cceb84eceeb6299f2338ac4798ff40e9aa36ec8) has the identical tree, without implying another execution. The runtime/build/package/lock inputs match the preceding verified runtime; the full suite was not rerun for this tests/evidence-only integration.

The broader Heading/List editing and conversion rows, `BLOCK_COLUMNS_FIELDS`, Raw navigation/presentation, other tools, B-HTML/B-STYLE, complete C09/T15, other platforms and whole-library parity remain open. Earlier dated counts and failed/preparation runs preserve their original sources and outcomes.

A separate [comparison-reporting repair](scripts/parity/checkpoints/2026-10-30/runner-reporting/README.md) closes empty-filter false success and incomplete-evidence admission in the four new runners. Exact-source real CLI controls and 62 deterministic result checks pass; historical failures retain their nonzero outcomes. This changes verification reporting only, with no new production repair or preservation-row acceptance.

## Code, Table keyboard, Person and basic marks — 2026-10-30

The [seventh scoped review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#code-table-keyboard-person-and-basic-mark-acceptance-2026-10-30) accepts eight additional obligations, preserving **209 IDs: 62 accepted / 147 open**. Code source/language, Table keyboard, Person hidden focus/read-only tabs and three basic mark tools have separately pinned, independently reviewed evidence. Their current corpora complete **165 cases / 15,488 observations / zero failures**; original v1/spec failures and absent capabilities remain visible with actual comparison exit 1.

The production repair is `3a16cf9f`, integrated as `8e22c752`: restore a collapsed caret after an authored BR inside its wrapper and keep subsequent trusted typing there through the existing native commit path. The exact same Table fixture records 12 failures before the fix and none afterward. Ordinary text/mark boundaries, noncollapsed ranges and terminal projection padding retain their existing behavior. No new owner or public API is introduced. The frozen source passes 30 targeted native cases, the prior terminal regression, 24 focused guard unit cases and both typecheck projects. Code/tools/Person additions require no production change.

The archives retain exact original commit bytes/trees, loaded-module/dependency hashes, real process outcomes and independent literal oracles. Root's additional reviews check all 96 basic-tool cases and 338 Person snapshots; separate peers review Code and the shared Table repair. Initial fixture preparation errors and interrupted processes are preserved without product-defect or success claims. See the linked publication review for the merged matrix's separately recorded execution source and final documentation validation. Better v2 behavior remains, and complete library parity is still pending.


## Seventh combined validation

The [combined checkpoint](scripts/parity/checkpoints/2026-10-30/seventh-integration/README.md) retains original `run-ph5JBn` on unchanged `8e22c752a1712c0a8c3908f59fe65a2d25e1db1b`: eleven successful gates and the original native timeout failure. Successful coverage includes 2,055 unit tests, both typechecks, build/package/type consumers, 38 ordinary pages, heap/resources, common 65-case and Gallery six-case comparisons, and documentation checks.

The separate `run-pKWT4L` run passes build and the complete native gate on unchanged `d06547af677fc55152bd2d6e3f0df9b941eeb159`: **2,626 passing cases in 45 groups**, counted once from its final aggregate. Five pages preserve the original 444-case inventory with a 333/33/20/28/30 partition. Production, regression fixtures and build/dependency inputs are unchanged; the page deadline remains 120 seconds. The [partition archive](scripts/parity/checkpoints/2026-10-30/native-partition/README.md) keeps the intermediate 366-case result, diagnosis and independent review. The original failed run is not relabelled, and the eleven unaffected gates are not presented as newly executed on the repair source. Final documentation validation follows with its own source and result.
