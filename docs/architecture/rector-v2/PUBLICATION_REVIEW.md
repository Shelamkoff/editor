# Publication review — 2026-10-21

This page preserves dated publication records. The [combined core continuation of 2026-10-29](#combined-core-continuation-2026-10-29) supersedes the original open B-PRESENTATION status. Earlier failed or unexecuted gates retain their original source and date; they are not results for the latest implementation.

Current scoped acceptance is **54 / 209 obligations**, with **155 open**; see the [sixth continuation](#heading-list-columns-raw-and-tool-action-acceptance-2026-10-30). Earlier dated counts below retain their original meaning.

## Scope and source identity

This publication follows the explicit request to recheck, push the specification to `refactor/rector-v2-architecture`, and clean repository junk. It publishes a consolidated implementation specification and open preservation register, adds an architecture entry, removes bounded generated output and prevents old results from masquerading as a new CI run. It does **not** implement the documented library repairs.

Repository: `Shelamkoff/editor`. Inspected branch head: `e981ff308000c1d92d7e820df95113c1e19bcee8`. Source tree: `e9956fb78777835fd5054c4e1ec882833c4fedbc`. The local read-only source baseline was extracted from the original CI source archive; its `git write-tree` matched that exact tree. Local dependencies came from the archived Node 22 verification input, not an unrecorded dependency upgrade. Node was 22.16.0 and TypeScript was 5.9.3.

The retained v1 reference is `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (1.0.5). This publication does not claim a fresh full v1 execution or complete functional parity.

## Actual verification in this publication pass

| Check | Actual result |
|---|---|
| `npm test` before cleanup | 1753 tests; 1735 passed; 18 failed; 0 skipped. Exit 1. |
| `npm test` after the bounded cleanup | Same 1753 / 1735 / 18 / 0 result. Exit 1. |
| `npm run typecheck` | Four existing source diagnostics in the first configuration. Exit 2. The second configuration was not run because the script uses `&&`. |
| Workflow YAML and initialization | Both jobs contain one clean-result step immediately after checkout. Executing each step in an isolated seeded directory removed historical outputs and wrote the supplied current-run identity. |
| Ignore rules | New test-results output and local .npm-cache paths are ignored. Already retained tracked evidence is intentionally still tracked. |
| Cleanup link check | Deleted files were checked against Markdown links throughout the repository, including README files inside historical results. Seven initially selected logs were restored because those README files cite them. |
| Source scope | No production JS, declarations, tests, schemas, dependencies or runtime configuration changed. The only non-document edits are .gitignore, verification-workflow result initialization and generated-output removal. |

The four type diagnostics remain: `cut.failed` is absent from the diagnostic-code union; two ClipboardController `html` accesses lack correct discriminated-union narrowing; InstanceScope's post-callback active/revoked comparison is rejected by static narrowing. These are specification targets, not fixed by this commit.

The eighteen unit failures are baseline failures, not eighteen independently proved product regressions. Their previously established mixture includes incomplete test adapters, a missing import and cascading build failures. No expectation, test or source guard was weakened to produce a cleaner number.

Fresh Chromium/native/IME/system-clipboard/Firefox/WebKit/v1/heap/performance/package/build acceptance was **not** performed for this documentation/cleanup publication. Prior browser reproductions remain evidence about their pinned baseline and are not relabeled as current execution. A successful push or CI artifact upload is not acceptance of the implementation.

## Specification reconciliation

The root specification is a consolidated repository edition of the latest recovery/read-boundary attachment, not a byte-identical copy. Repeated inherited-evidence narration and repeated scenario boilerplate were removed; settled ownership, functionality preservation, requirements/proof identifiers and explicit blockers remain. The register retains 209 scenario IDs and marks candidate acceptance as not-implemented/not-run.

In particular, this edition retains public EditorRenderer subclass/override capability rather than the withdrawn factory-only proposal; preserves supported fonts/classes/targets and hidden-field focus; does not prescribe an unproved HTML topology; distinguishes task completion from signal cancellation; preserves optional inline updateability and its remount/caret requirements; and keeps complete standalone presentation recovery behind B-PRESENTATION.

`B-HTML`, `B-STYLE`, `B-PRESENTATION` and missing complete differential proof still prevent whole-library acceptance. Locally ready fixes remain independently actionable. Historical audit documents do not authorize legacy compatibility or parallel APIs.

Reference attachment hashes (SHA-256):

| Original artifact | Digest |
|---|---|
| Recovery review `RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md` | `7ea38f1ae8e35407046073567d93c370f0af8f0662cf184ad7f428e7587f74a4` |
| Recovery review `FUNCTIONAL_PRESERVATION_LEDGER.json` | `b3464c1e4b9458e4d3c5957dc082c1d9463efb5b44e0666fe1c46e31594b10a6` |
| `rector-recovery-read-boundary-review-2026-10-21.zip` | `a4a27a3cc72191d67c80229a6b7b3a799c10ff340c94b0873c59aa59a2ac2a83` |

The attachment archive contains the detailed earlier scripts and logs. Its existence is not a claim that the scripts were rerun in this publication. The new register factors common procedures into templates while retaining scenario-specific actions and observable outcomes.

## Bounded cleanup

Removed **449** generated files from `test-results/`: **289 PNG screenshots and 160 log files**, totaling **24,292,654 bytes** in the checked-out tree. None of the deleted paths is a target of an existing repository Markdown link. All JSON fixtures/manifests, JS/MJS/HTML reproduction sources, Markdown, and linked historical evidence are retained. Of the original 1035 tracked files under test-results, 586 remain.

All 157 existing root `RECTOR_V2_*.md` documents are retained. They are indexed by authority rather than indiscriminately erased or moved with broken relative links. Project skills remain, including Vue guidance relevant to VitePress documentation. No source/test directory, package lock or reproducible fixture was treated as junk merely because it was large or old.

This is current-tree cleanup, **not** a purge of Git history or a claim that full clone history shrank by the same amount. Removed evidence can still be recovered from the exact pre-publication commit. The new commit is intended as a normal child of the checked head, without rewriting branch history.

Historical Markdown has some already-missing evidence targets; the bounded removal does not claim to repair every old report. Retained historical manifests describe the original run, not a promise that all generated output remains in the current checkout.

## Preventing stale current-run results

Both existing workflow jobs now clear and recreate `test-results` immediately after checkout, before dependencies/checks, then write source SHA, run ID, attempt and job. A build failure therefore cannot upload an old tracked browser log as though it came from the new run. This modifies output provenance, not library semantics or gate expectations.

The directory still contains retained historical evidence in the repository for readers; each CI workspace deliberately starts current output afresh. New output is ignored. This maintenance is only part of C11: complete per-command outcome manifests, Action SHA pinning, release provenance and final acceptance remain planned work, not silently declared complete.

## Acceptance boundary

Publishing this specification makes its agreed contracts discoverable in the branch. It does not make the documented defects fixed, the failing baseline green, or preservation proved. Whole-library acceptance requires implementation, required decision closure, actual proof against v1/current/candidate and separate architecture convergence on the final source identity.

## Construction parity 2026-10-29

This section records one fresh preservation acceptance. The publication and cleanup findings above retain their original 2026-10-21 source identity. The new result does not reclassify those historical runs or accept the whole library.

**Accepted scenario: `RENDERER_CONSTRUCTION`.** Candidate `4b87dad094367eea16b768ca4e3ac0808b1dec1f`, Chromium `142.0.7444.175`, Linux, Node `v24.22.1`. The production renderer is unchanged from `fa13888a66e660e2893e5fc493bd600588f13b10`; the intervening commit changes only a conversion-grouping test fixture.

The real-DOM differential executed these source versions:

| Source | Construction controls |
|---|---|
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | Public constructor and `createEditorRenderer(config)` forwarding factory |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | Public constructor and the same forwarding factory |
| Candidate `4b87dad094367eea16b768ca4e3ac0808b1dec1f` | Retained public constructor, subclass/override capability and absence of the factory |

All three versions preserved subclassing with `super` and public overrides. Each construction control verified public `instanceof` and prototype, unchanged configuration with a separate nondefault `classPrefix` forwarding case, custom registration, `renderBlock`/`render`/`renderTo` output, exact disposal and subsequent reuse. Every construction branch created and disposed seven resources exactly once. Baseline entrypoint and implementation bytes were verified against the exact Git objects.

The independent earlier renderer comparison passed fourteen checks in each of v1 and candidate, including incremental reuse, isolation of a changed block, preservation of caller data and detached/target/direct/global disposal; each version created and disposed twelve resources exactly once. The candidate's unit, declaration and installed-tarball gates additionally verify the supported class and negative imports/exports for the removed forwarding routes. Their production source was `fa13888a`, which is unchanged in candidate `4b87dad0`.

The construction probe command was `node /tmp/rector-renderer-factory-parity.mjs`. Its successful wrapper recorded 2026-10-29 14:52:09–14:52:11 UTC, exit 0, 2.063 seconds, a clean candidate tree and identical source identity before/after. Probe SHA-256: `bccac37befe9041536e24d035465f82fe43d7763f60709315b26e2cc6fc5a6cc`. The separate fourteen-check probe was `node /tmp/rector-renderer-v1-oracle.mjs`, SHA-256 `42266203aba29552651e118efe2ac68dac942c1ed88f35fa707b23b0b452b9c8`; its clean-source run on `fa13888a` exited 0 in 2.211 seconds. Session traces are named `renderer-factory-parity` and `v1-renderer`; the full checkpoint records the accompanying package/types/browser commands and source identities.

The exact executed probe sources and original failed control are retained in [checkpoint reproduction sources](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29), evidence commit `7db0361e5019dc4323514292cd03aa1a5e4c73e2`. Their README records original environment paths and prerequisites; these archived probes are not an automatically portable CI runner.

The probes import the real source classes, adapt document/schema wire shapes only in test code, use shared installed current dependencies and a custom renderer with `injectStyles: false`. They do not establish built-in renderer coverage, legacy data migration, producer-revision shortcuts, foreign-output ownership, async factories, CSP, styles or cross-realm behavior. Those properties retain their separate preservation requirements. An earlier constructor-probe fixture incorrectly expected a dark-theme modifier; its failed `renderer-factory-control` trace is retained separately and is not a product regression or accepted result.

At this construction checkpoint only `RENDERER_CONSTRUCTION` changed to accepted; the other 208 rows retained their separate obligations. The subsequent Quote acceptance is recorded below. The [full dated checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/RECTOR_V2_PROGRESS_2026-10-29.md) records the implemented slices, gates and remaining work.

## Quote paste merge parity 2026-10-29

**Accepted scenario: `BLOCK_QUOTE_PASTE_MERGE`.** The 16-case real-browser differential executed v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`, and candidate `948bc5544dcf57a343733f589883973ec7db6cd7`. All 48 independently classified observations matched their stated source oracles. Linux, Node `v24.22.1`, Chromium `142.0.7444.175`; UTC 15:32:43–15:33:12, exit 0. Loaded source JS/CSS bytes matched Git before and after execution: 103 for v1 and 89 for each current-format source. The comparison uses the actual public editor/plugin APIs and shared installed dependencies; wire/API adaptations are test-only.

Trusted system Copy/Paste transfers three blockquotes with nested `cite`, `footer` and `figcaption` from an external producer into forward and backward selections. Native Backspace/Delete merges exercise both captions, only the target caption and only the source caption. Incompatible neighbors and internal quotation/caption boundaries are negative controls. Public plugin export and Quote↔Paragraph conversion preserve authored text and marks. Candidate checks assert the intended block IDs/order, unrelated DOM, exact directed selection and one completed Undo/Redo action.

The v1 importer supplies the preserved nested-attribution behavior. Its incoming-caption loss during merge and Quote-to-Paragraph loss are classified repaired defects under the preservation union and the approved whole-author-field conversion contract. The specification baseline's nested-attribution and immediate Backspace-caret defects are likewise repaired. Older history may collapse directed selections or remount neighbors; the candidate asserts their stronger preservation. A baseline PASS confirms the version-specific observation, not conformance to the candidate's repaired contract.

The exact probe is retained as `scripts/parity/checkpoints/2026-10-29/rector-quote-paste-merge.mjs`, SHA-256 `e38cde196974587f5a743c268448b98251a4d97e78a5b55e6ae4ff24c93601e3`. Its [checkpoint README](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/README.md) records prerequisites and reproduction limits. The standard fixture imports the same 16 candidate scenarios through `native-plugin-parity.js`.

The final unfiltered command was `EDITOR_NATIVE_PAGE=native-plugin-parity.html node tests/browser/physical-history.mjs`, with the recorded Chromium path. Clean candidate fixture commit `22ef58405326be1e4e61aff334f4f4538cdab3c0` passed **217/217** cases, zero failures, from 15:37:15 to 15:38:11 UTC (56.125 seconds), with unchanged source before/after. Its published equivalent is `1acc8ec9dedd3348f0ba0783930e9a7369cafe22`; publication checked the exact tree, not a new runtime execution. The original-to-published mapping and reconstructible commit objects are in the adjacent publication provenance files.

This row does not accept all Quote fields/roundtrip cases, other clipboard rows or whole-library parity. With construction accepted separately, 207 register rows retain their individual proof obligations. `B-HTML`, `B-STYLE` and `B-PRESENTATION` still require their own decisions and implementation evidence.


## Renderer output parity 2026-10-29

**Accepted scenario: `RENDERER_OUTPUTS`.** Candidate `6b0ef0e8bd4b50adf5c294ba6cddadd4313f0a26`, published with the identical tree as `a39aaf3264aae1578aa03ffac1646fa2c07ea0f1`. The exact-source differential executes 27 cases for each of v1 `5e5c7f8`, specification baseline `e981ff3` and candidate. Candidate: **27/27 PASS**. The same fixture is registered in the ordinary public-extension page and copied into the independent installed-package consumer; both passed **39/39** checks (12 existing extension contracts and 27 renderer cases).

The preserved controls include string and numeric producer revisions with zero `get`, `ownKeys` or property-descriptor reads of unchanged opaque payloads, replacement of only the changed block, unchanged focus/custom-element connectivity, unrevisioned in-place JSON changes, semantic object-key order and meaningful array order. Ownership controls cover detached application descendants, all three rendering methods, application and successor-renderer replacement of a mount, target/global disposal and reuse, partial acquisition/DOM failures, and independent outputs acquired inside block/style callbacks.

The new RED exposed missing ownership of aggregate `render()`/`renderTo()` wrappers and unknown-block placeholders: another renderer could accept an already-owned detached root as fresh output. The complete pre-fix candidate run had eight intended failures. The repair extends the existing `liveRenderedElements` WeakMap to those roots and releases provisional/retired wrapper ownership through existing cleanup. It adds no runtime API, registry, transaction or remount manager. Exact-once cleanup, zero disposal of unacquired foreign resources and successful reuse after release are positive controls.

The v1 comparison records four preserved cases, 22 repaired-defect cases and one object-key-order performance improvement; the specification baseline records 19 preserved cases and eight repaired ownership cases. Historical differences are constrained to exactly one expected failure, its exact first message and fixed independent DOM/resource observations. Additional cleanup/window errors are not accepted as part of an expected baseline defect. No unexpected verification error occurred.

The real browser served 54 v1 and 88 files for each current-format source directly from their pinned Git objects. Browser/dependency scope: Linux, Node `24.22.1`, Chromium `142.0.7444.175`, shared installed dependencies, custom block definitions. Reproduction source: `scripts/parity/checkpoints/2026-10-29/rector-renderer-output-parity.mjs`, SHA-256 `06f412b2eeb703d55559b5a5bcd9aef79fbf70298fc0b4daf5a3ee516b50bfcd`; shared fixture SHA-256 `e60741f82d52469da5d2949102e378d7b827c504d5f310a1dd602f6421065647`.

| Command on clean `6b0ef0e8` | Actual result | UTC interval |
| --- | --- | --- |
| `EDITOR_BROWSER_PAGE=public-extension-contracts.html node tests/browser/run.mjs` | 39/39, exit 0 | 15:56:05–15:56:08 |
| `node scripts/parity/checkpoints/2026-10-29/rector-renderer-output-parity.mjs` | 27 cases × 3 sources, candidate 27/27; no unexpected errors, exit 0 | 15:56:06–15:56:11 |
| `npm test` | 1916/1916, zero failures/skips, exit 0 | 15:56:19–15:56:49 |
| `npm run test:package` | 285 generated runtime declarations, zero source diagnostics; strict Bundler/NodeNext, Vite/runtime imports, installed browser 39/39, 22 CSS assets; exit 0 | 15:56:18–15:56:59 |

All four wrappers recorded a clean identical source before/after. Package verification also exercises the C08 canonical type migration and negative removed imports. The row does not accept every built-in renderer, cross-realm/CSP/style behavior or the entire library. Three bounded rows are accepted in the preservation register; 206 remain subject to their own evidence and decision gates.

## Presentation values parity 2026-10-29

**Accepted scenarios: `PRESENTATION_VALUES_FONT_1` through `PRESENTATION_VALUES_FONT_9`, plus the benign `PRESENTATION_VALUES_CLASS_SPAN` and `PRESENTATION_VALUES_CLASS_CODE` behaviors.** Candidate `1a2477fa460daff462ddf843a5af162cd8aaa803`, published with the identical tree as `4f1ccfd3c2364dbc2f1e3e982302c24b5ac5d0b6`. The same fixed browser fixture executes all 11 cases against real v1 `5e5c7f8`, specification baseline `e981ff3` and candidate modules: 528 assertions per source, 33 complete cases, no unexpected failures or page/server errors.

Every case loads authored content, saves it, renders it, types into neighboring plain text with trusted input, then performs exactly one native Undo and Redo. Assertions cover all block metadata, text/marks/classes/language, immutable caller input, exact saved-record replay, history availability, native caret/focus, neighboring DOM identity and actual computed CSS in both editor and renderer. The input records and fixed CSS expectations are independent of observed product output. A test-owned parser normalizes only harmless browser attribute/style serialization; it does not call Rector sanitizers.

Ordinary built-in styles are loaded. Explicit host rules establish an actual 20px Paragraph base and 16px document root, both asserted in every phase. The nine authored sizes `16px`, `16.5px`, `1.5em`, `150%`, `1.5rem`, `calc(10px + 1em)`, `201px`, `250px` and `inherit` produce respectively 16, 16.5, 30, 30, 24, 30, 201, 250 and 20px. The benign span/code class retains the explicit host's 30px size and `rgb(12, 84, 156)` color. Inline code also retains `language-javascript` and `lang="javascript"`.

v1 has exactly 22 raw failed identity assertions: its Undo/Redo reconstructs the untouched neighbor in each case. They remain visible and are classified only for exact source/phase/property/actual/expected matches as `repaired-v1-history-remount`. All typography, canonical content, caret and history assertions pass in v1; baseline and candidate pass every assertion without that exception. Losing neighbor identity is a repaired baseline defect, not required typography behavior.

All served production sources/styles matched their pinned Git objects before/after: 145 v1 files and 160 files for each v2 source. The portable runner is `scripts/parity/presentation-values.mjs`, SHA-256 `dc22da9837ac8375a851a3513420a9398fc5a452c901bd88fa03b3dc362aa9a9`; shared browser fixture `tests/browser/presentation-values-fixture.js`, SHA-256 `f8187d00dc602118f998227e828722913cdacf52f07bcc0dda800e87a013453f`. Its adjacent README specifies immutable baseline archives, dependency/browser paths and all reproduction inputs. Environment: Linux, Node `24.22.1`, Chromium `142.0.7444.175`, recorded shared installed dependencies. Test-only adapters translate public API/envelope spelling; production modules are not transformed.

| Command on clean `1a2477fa` | Actual result | UTC interval |
| --- | --- | --- |
| `node scripts/parity/presentation-values.mjs` with the documented archive/browser variables | 11 cases × 3 sources; zero unexpected failures, exit 0 | 16:13:41–16:13:51 |
| `EDITOR_NATIVE_PAGE=native-plugin-parity.html node tests/browser/physical-history.mjs` | Unfiltered page, 228/228 PASS, exit 0 | 16:14:00–16:15:06 |
| `npm test` | 1940/1940, zero failures/skips, exit 0 | 16:14:06–16:14:31 |

All three wrappers recorded clean identical source before/after. These 11 rows plus the preceding three accepted rows give 14 accepted and 195 open obligations. Hostile-class confinement remains a separately demonstrated failure in the HTML/style checkpoint; this positive corpus does not settle `B-STYLE`, choose an HTML topology, accept target navigation, other renderer payloads or whole-library parity.

## Paragraph and Heading roundtrip parity 2026-10-29

**Accepted scenarios: `BLOCK_PARAGRAPH_ROUNDTRIP` and `BLOCK_HEADING_ROUNDTRIP`.** Paragraph was first verified on `f534d9b89b2c41c015d6f2ec1568de72cd516096`, published with the identical tree as `eca19cabf1fc97ef1825f93445dc47695d5bcaa9`. The combined, strengthened oracle was verified on `ec5104bf8cabceff4faa29eb2653fd9cea3aadbc`, published as `384fd985a2b71d198bedf9356bd0533e9d62e610`. These are test/evidence changes; neither slice changes production behavior.

Each block has an actual default-construction case, a populated case with Mention and Color inside authored marks, and a positive control with the same widgets outside those marks. Fixed literal records supply expected text, metadata, sidecars, neighboring Paragraphs and meaningful IDs. Heading independently checks level 2/3 and actual H2/H3 nodes. Every completed case covers load/save, detached rendering, attachment, `renderTo`, read-only mode and return with foreign focus preserved, trusted native text input, exactly one Undo/Redo and disposal. Renderer ID/type/order and tags, widget text, caller-data immutability, native selection, neighboring identity, provider inactivity and DOM/style cleanup are asserted.

The combined candidate completed **6/6 cases, 948 assertions, zero failures**. v1 completed all six with exactly 44 visible, narrowly classified historical differences: mode/history remounts and the first populated Undo focusing the preceding Paragraph at offset 6 rather than the edited block at offset 14. Canonical content and sidecars remain exact. The specification baseline completed the default and unwrapped controls but aborted each formatted case during its first read-only transition with the exact projection-boundary error. Its 678 observations include two classified failures; the later phases of those two cases remain explicitly **incomplete**, not passed. Candidate exceptions are never admitted. All three executions had zero unexpected page/server errors.

The runner is `scripts/parity/block-roundtrip.mjs`, SHA-256 `8f7b11de6372c089e1f6d4ba61621cfaaa53cd3074f1c774ee52faf0cdf36d45`; shared fixture `tests/browser/block-roundtrip-fixture.js`, SHA-256 `29d09ba7bad94beb4d8bbfb3ae8ccbbce0f5ac3541a8f41c68a87950c596cafc`. The adjacent README supplies archive variables, browser/dependency inputs, wire adapters and exact historical classifications. The combined run verified 151/173/173 loaded Git source/style files for v1/baseline/candidate and 64 loaded dependency files before and after execution.

| Frozen-source command | Actual result | UTC interval |
| --- | --- | --- |
| Paragraph: `node scripts/parity/block-roundtrip.mjs` with documented archive/browser variables | Three cases per source; candidate 402 assertions, zero failures; exit 0 | 16:31:57–16:32:06 |
| Paragraph: `EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html node tests/browser/physical-history.mjs` | 3/3 PASS; exit 0 | 16:35:06–16:35:15 |
| Combined Paragraph/Heading: same differential command | Six cases per source, classified observations above; exit 0 | 16:42:10–16:42:25 |
| Combined Paragraph/Heading: same native command | 6/6 PASS; exit 0 | 16:42:24–16:42:34 |

Environment: Linux, Node `24.22.1`, Chromium `142.0.7444.175`. Each isolated checkout had an empty tracked diff before/after and one explicitly recorded untracked `node_modules` link to the shared installed dependencies. The wrapper roots were the corresponding frozen worktrees; the complete checkout was not described as clean. Paragraph source/dependency identity checks covered 146/168/168 loaded Git files and the same 64 dependency files.

These two accepted templates give **16 accepted / 193 open** obligations. Other Paragraph/Heading actions, the remaining built-ins, platform breadth and full editor parity remain separate. The retained [Table default probe](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/table-default) records an unresolved default of 3×3 in v1 versus 1×1 currently; explicit 3×3 documents work in all three sources. It does not accept Table roundtrip.

## Current verification result ownership 2026-10-29

C11's existing workflows now use the small `scripts/verification-results.mjs` recorder, published as `8b09ec2c4385ceddcae60db2f4d374e6f877adc0` (original `703285384e83ca47e5e47e730f155b1739091926`). Each invocation creates a fresh output directory, initializes every planned command as `not-run`, and records checked-out HEAD/tree, tracked-patch and nonignored untracked-source hashes, lock hash, actual argv, environment, timestamps and process outcome. A zero exit with changed source is a failure. Interrupted descendants receive the owned process-group signal; a started command without completion remains interrupted. A rejected attempt cannot be rewritten as success after restoring source.

Eight real process/Git controls passed, including stale PASS, failed prerequisite, dirty-source changes, signal delivery, handled-zero interruption, lost helper, descendant cleanup and attempted-result preservation. A deliberate real Chromium page failure and subsequent successful fresh run proved that failure JSON and browser/runtime version output belong to the current directory and cannot inherit historical results. They are harness controls, not new editor-functionality acceptance.

Official Action refs, commit objects and commit-addressed action definitions were independently checked on 2026-10-29 before pinning the existing versions:

| Action / retained version | Reviewed commit |
| --- | --- |
| `actions/checkout` v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` v7 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact` v7 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `actions/configure-pages` v6 | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/upload-pages-artifact` v5 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` v5 | `368f82528645a54fb793d4d04e342629a3f51346` |

Permissions, events, concurrency, timeouts, Node versions, archive cadence and existing `!cancelled()` upload conditions were preserved. The Pages result describes only installation and documentation build; native deployment Action status stays with GitHub. On [run 40914021899](https://github.com/Shelamkoff/editor/actions/runs/40914021899), all three Node jobs, package, docs and size jobs completed successfully. The long browser job was still in progress when this evidence was recorded; subsequent concurrency cancellation is not a successful completion. Full current-source acceptance still requires its own complete gates.

## List Quote and Warning roundtrip parity 2026-10-29

**Accepted scenarios: `BLOCK_LIST_ROUNDTRIP`, `BLOCK_QUOTE_ROUNDTRIP` and `BLOCK_WARNING_ROUNDTRIP`.** The shared fixture now implements five complete block templates, with actual default construction, fixed populated records containing formatted widgets and an unwrapped-widget positive control for each. Expected records are independent literals. Native authoring, exactly one Undo/Redo, sidecars, metadata, meaningful IDs, neighboring identity, renderer output, mode changes with foreign focus preserved, input immutability and cleanup remain mandatory.

List checks ordered/unordered output, both item records and stable current item IDs. Quote separately checks its text and caption, with Mention in text and Color in caption; Warning separately checks title and message with the same distribution. Both editor fields and their distinct renderer slots retain exact author content and DOM identity. The actual native edit is in List's first item, Quote's text and Warning's title. Caption and message are verified as preserved siblings; these results do not accept separate native authoring in those secondary fields.

| Slice | Original commit → identical published tree | Cumulative candidate cases / assertions | v1 observations / classified differences | Specification-baseline observations / incomplete formatted cases |
| --- | --- | --- | --- | --- |
| List | `5829753e9e2c187cdb52ee340745561ca1f0883a` → `71a0d4d5558696a8a7d23e4221fc5e7deb7721f6` | 9 / 1494, zero failures | 1476 / 79 | 1069 / 3 |
| Quote | `6c7770d52e8152ab0b60991703f505761f866c07` → `efae6d0e2b27cc184a53c1870725c6f81823150d` | 12 / 2004, zero failures | 1986 / 114 | 1434 / 4 |
| Warning | `f6888cfc15186ba650837ce99749482cd0ca3d5b` → `e38dd79ff3bdc707d961805dc1121011f351d553` | 15 / 2514, zero failures | 2496 / 149 | 1799 / 5 |

Each run includes the preceding blocks; these counts must not be added together. The additional 18 candidate assertions bind current List item IDs, which do not exist in v1's representation. All v1 cases complete. Its exact historical remount arrays and native selection owners are visible raw failures, classified only for the observed scenario, phase, property and value. Empty List/Quote/Warning Undo cases also bind the actual generated block ID and exact old active/range nodes. No candidate exception is accepted. The specification baseline's formatted cases stop after load at the exact known projection-boundary error; all later phases remain explicitly incomplete. All three sources have zero unexpected page/server errors.

The List, Quote and Warning runs verified respectively 155/177/177, 159/181/181 and 162/184/184 loaded Git source/style files, plus 64 loaded dependency files, before and after execution. List used the then-installed dependencies; Quote and Warning used the reviewed DOMPurify 3.4.17 installation. The runner records actual loaded dependency versions and bytes. They are shared contemporary dependencies, not a claim that the entire historical dependency installation was recreated.

| Frozen worktree / exact three-file patch SHA-256 | Differential UTC / seconds | Standard native page UTC / result |
| --- | --- | --- |
| `d40f92e6` / `5b0f0ab1aefd16e1ac12e50b994dfc037023076d09e9500656aa061b734aa7e6` | 16:49:42–16:49:59 / 16.912 | 16:50:09–16:50:21 / 9/9 PASS |
| `f845b9ae` / `e01dafee11c280f2bb97e0e0a793a3d1adb9ccd14b348e95e86ed86f4f237d36` | 17:01:10–17:01:31 / 20.500 | 17:02:24–17:02:37 / 12/12 PASS |
| `efae6d0e` / `45ff7cf532ab790506a527c904ec129bb97157f6bd39300d978509a3ffcc877a` | 17:12:14–17:12:40 / 25.065 | 17:12:55–17:13:10 / 15/15 PASS |

All six commands exited 0 and recorded identical source before/after. The frozen worktrees contain the stated three-file test patch and a recorded dependency symlink; they are not described as clean checkouts. Every committed test blob was compared byte-for-byte with the corresponding frozen input. The commands remain `node scripts/parity/block-roundtrip.mjs` with the documented archive/browser variables, and `EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html node tests/browser/physical-history.mjs`, under Linux, Node 24.22.1 and Chromium 142.0.7444.175.

| Slice | Runner SHA-256 | Fixture SHA-256 |
| --- | --- | --- |
| List | `deab6a3c9f9130569bc67192b6a8398688a26078db1360d5824369be1593e546` | `63e653d0596751ae5cc7f551ce986641ca4224c8409b2c67f31fae1270e8f3d6` |
| Quote | `0501bc564588bd60b0eb8e9d4ca7d6a2c9b476cddc29048d39da176ed10e1406` | `282c496392a4efdd75c8bee716b65c138099e24ec340e18b7684957856a7f83f` |
| Warning | `ec33685fb611a6d95b8e72147e24874a8e3c9be830261d0d37520c7b873ee266` | `4d154d3a63b1b9583368c09251bcfa7462148a7502d5fea83f41a4d95e31c530` |

The [runner guide](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/block-roundtrip.md) records adapters, defaults and precise classifications. These additions bring the register to **19 accepted / 190 open**. Detailed block actions, secondary-field native editing, the remaining built-ins, Table's default difference, platform breadth and whole-library parity retain their own proof obligations.

## Reviewed dependency maintenance 2026-10-29

Published commit `f845b9ae0e4ed43bb980fe77c8d9366d750d4ec7` updates the exact DOMPurify pin from 3.4.15 to 3.4.17 and the resolved development patches Vite 7.3.6→7.3.7 and source-map-js 1.2.1→1.2.2. It preserves existing package ranges, Node support, sanitizer options and accepted markup. Official release/commit objects, the three registry tarball digests, all 180 resolved lock entries and license attribution were reviewed. The post-update dependency audit reported zero advisories; this is dependency inventory evidence, not proof of complete application security.

Three failing version/lock/license consistency tests now pass. A standard real-browser Trusted Types control proves separate parent/iframe policy acquisition, owning-document output, allowed marks/classes/201px typography and rejected active markup. A deliberately wrong-realm control fails its actual policy observation. Both original and updated dependencies pass the seven-case corpus.

The [dependency checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/dependencies/README.md) records original sources, exact patch hashes, official references, package/type/documentation checks, 35/35 ordinary pages before and after, 228/228 native-plugin cases, and the 1942-test unit run. That unit wrapper observed an unrelated concurrent untracked documentation temporary directory and records `sourceUnchanged: false`; it is not a clean whole-library freeze. New source changes require their own complete gates. The update does not settle `B-HTML`, `B-STYLE` or the presentation recovery decision.

## Code roundtrip parity 2026-10-29

**Accepted scenario: `BLOCK_CODE_ROUNDTRIP`.** Original `2d9923c0e6a81b0a7270f3e1cf6edb3f3c581304` is published with an identical tree as `9c038c805132e902db45b67beb821f77a4798822`. Two plain-text cases cover the real empty/`auto` default and fixed multiline JavaScript containing literal HTML syntax, an entity and a token-looking string. Source remains literal in saved data, the textarea, preview and all renderer contexts; rich-text sidecars are not invented. The native Edit control reveals the textarea, with editing mode, CSS visibility, nonzero bounds and exact hit target checked before typing. Native textarea selection, read-only state, identity, fixed language, one Undo/Redo and all shared preservation/cleanup properties are asserted.

The cumulative candidate completes **17 cases, 2872 assertions, zero failures**, and the standard native page passes **17/17**. v1 completes 2854 observations with 168 classified differences; the 19 added Code differences are exact mode/history remounts and textarea caret restoration failures. The populated first Undo focuses the preceding Paragraph at offset 6 while textarea offsets remain 61. Both Redo cases focus the correct textarea but leave offsets 0 instead of 1/62, with the exact native DOM range on that block's preview newline. These are bounded to the two Code IDs, complete active/anchor/focus owners, phases and values. The specification baseline passes both Code cases; only its preceding five formatted rich-field cases remain incomplete. No candidate or new Code baseline exception is permitted.

The first investigation could not verify the 1,080,490-byte historical bundled highlighter because the test reader's default stdout buffer was too small. Its source-identity failure is retained as a failed probe. Raising only the Git blob reader limit to 64 MiB permits exact byte verification; it does not alter the expected source hashes or classify a product error. The final run verifies 166/190/190 source/style files and 64 dependency files, with no unexpected page/server errors. v1's actual bundled highlighter runs unchanged. Unbundled v2 differential sources use the documented plain-text fallback; the ordinary Vite native fixture supplies the installed dependency. Highlight token colors and injection remain separate obligations.

The frozen input is `e38dd79f` plus three-file patch SHA-256 `69b190df9eeeb5ad8d03f84f3959337a1547f17c2d13336a477cd755da14a28e`, with a recorded dependency symlink. Committed test blobs match it exactly. Differential execution took 31.501 seconds at 17:16:36–17:17:08 UTC; the native page took 17.702 seconds at 17:17:37–17:17:55 UTC. Both exited 0 with unchanged source, under the previously recorded Linux/Node/Chromium environment. Runner SHA-256: `68009593194f1de5be5a2cd7338a6a509293fec5d379a29714799c83bbd2020f`; fixture: `ead6f755edf94739dfaa52e6f3a389ad4e2594f84cd2950b7bb4c235e5540b37`.

The register now has **20 accepted / 189 open** obligations. The Code result accepts its complete shared roundtrip template; language controls, clipboard/tab behavior, syntax highlighting and other detailed Code actions retain separate rows.


## Checklist and Delimiter roundtrip parity (2026-10-29)

**Accepted scenarios: `BLOCK_CHECKLIST_ROUNDTRIP` and `BLOCK_DELIMITER_ROUNDTRIP`.** Checklist original `ec896d54fd6d6b573dc62e75896a6b77b3383fe5` is published with an identical tree as `f5ae41304b290600f73019291b1878741ec78072`; Delimiter original `36492d85838958df3bc03496b42ad5b1499e5f69` as `7bfa26df3c3d47e305629f0e3c74965cba37e316`. These slices change the portable fixture, differential runner and its reproduction guide only.

Checklist has a real one-item unchecked default and fixed populated cases with checked/unchecked items, formatted widgets and the unwrapped-widget control. The oracle preserves label text, sidecars, stable current item IDs, row/button/label DOM identities, disabled/ARIA state and the renderer's list structure. Native input edits a label; checkbox actions remain a separate obligation. The default v1 Undo lands on the label's outer `DIV` at offset 1 instead of the expected inner point, while populated Undo focuses the preceding Paragraph at offset 6 instead of the label's end. Only exact owners, phases and values are classified; no candidate exception is accepted.

Delimiter has no editable descriptor. Its actual default `{}` and `HR` output survive mode changes, input immutability and disposal without manufacturing author history. Default edit/Undo/Redo are explicitly inapplicable. A separate populated-neighbor case performs trusted input in the real prefix Paragraph and exactly one Undo/Redo while preserving the delimiter's payload, ID, order and output. Insert/move/delete actions remain separate. Only the two exact Delimiter IDs' historical block/HR remounts are classified; there is no delimiter caret or baseline exception. Review found an overly broad nullable-field branch in the exploratory fixture; it was corrected to require all rich-field checks whenever `hasAuthoring` is true. The exploratory result is superseded by the strict runs below.

| Frozen slice | Candidate observations / failures | v1 observations / classified differences | Specification baseline observations / incomplete prior cases | Standard native page |
| --- | --- | --- | --- | --- |
| Checklist, 20 cumulative cases | 3400 / 0 | 3364 / 203 | 2535 / 6 | 20/20 |
| Delimiter, 22 cumulative cases | 3648 / 0 | 3612 / 215 | 2783 / 6 | 22/22 |

The cumulative counts overlap and must not be added. The six specification-baseline formatted-widget cases stop after load; unexecuted phases remain incomplete. Both Delimiter cases complete in all three sources. Git-byte verification covers 170/193/193 source/style files for Checklist and 173/196/196 for Delimiter, plus 64 dependency files in each run. There are no unexpected page/server errors.

Checklist used frozen base `9c038c80` plus three-file patch SHA-256 `9e85dc8a19330749f3606c9a405604ba55d6d538bba584ebaf92d5b323b46215`. Its differential ran at 17:22:06–17:22:46 UTC (39.903 seconds), native at 17:23:40–17:23:59 (18.934 seconds). Runner SHA-256: `76aa500f9d47c52fbb4401c4004ee50c99112a12a58166284412da8663d6d351`; fixture: `bf7d29ef558faeec660d0c5892f16d348147fd7a3c19af5c8b5784366b27cb02`.

Delimiter used frozen base `ec896d54` (tree equivalent to `f5ae4130`) plus strict patch SHA-256 `0b5115d9048792bbe5c96fb73a589b97ffec787dbfe1366302563544762f8d09`. Differential: 17:40:23–17:41:01 UTC (38.351 seconds); native: 17:41:33–17:41:53 (19.646 seconds). Runner SHA-256: `551e3fbe1b408d502fb033306b74a078a33743f5e3fd7cfb240598f6f3d0a969`; fixture: `3eaa57c9bbbca66998b921bc20e21b8fa95fda8b756e811dc45132d6e714b6ac`.

Both isolated checkouts have a recorded dependency symlink and tracked three-file patch; they are not described as clean. Exit codes are 0, source identities are unchanged before/after, and committed test files match the frozen inputs. The environment remains Linux, Node `v24.22.1`, Chromium `142.0.7444.175`, with the shared contemporary dependencies and pinned real v1/specification sources described in the runner guide. The register reaches **22 accepted / 187 open** obligations, not 22 accepted blocks or 187 demonstrated defects.

## Image literal-caption proof (2026-10-29)

**Partial proof; `BLOCK_IMAGE_ROUNDTRIP` remains open.** Original `92f276c336954e6412ca4630ef6f2bb2de105fc6` is published as the identical tree `3f2c9acf512efc923f6112c0eb35534423156e4f`. Two Image cases cover the actual empty-source default and a fixed valid local PNG with a literal rich caption. The populated case preserves dimensions, flags, style values and computed meaning, renderer output, modes, caption identity, trusted editing and exactly one Undo/Redo. The empty default has no fabricated editable caption. A standalone browser control confirms that CSS `object-position: center` serializes as `center center` and computes to `50% 50%`; stored input remains unchanged.

The frozen 24-case cumulative run has candidate **3926 observations / 0 failures**, v1 **3890 / 228 classified differences**, and specification baseline **3061 observations / six preceding incomplete formatted cases**. Image contributes 278 observations per source, no candidate/baseline differences, and exactly 13 v1 differences: twelve expected block/image remount observations plus the populated Undo's exact preceding-Paragraph focus at offset 6 instead of caption end 18. Loaded source/style bytes match Git for 191/211/211 files, with 64 dependency files checked before/after. The native page passes **24/24**. These are overlapping cumulative runs, not additional independent totals.

Frozen base `36492d85` (tree equivalent to `7bfa26df`) plus three-file patch SHA-256 `3054d1497083099880a4a922ae5c51d55aeab10fbfce4e9eea7f43ba93d1ac78` ran at 18:02:50–18:03:33 UTC (43.000 seconds); native at 18:04:05–18:04:27 (21.378 seconds). Exit codes are 0, all recorded source identities are unchanged, and committed test files match. Runner SHA-256: `221fb260e73787f15f59d91d9080b22f8d2bd92e17d51d98c433253ff65d4511`; fixture: `4618a1d59f967237b36e66b7a373c9084960a2afcde5b9312d8e4a298e289888`.

Actual supported current-format caption widgets require more work. Separate real-browser tests reproduce stale image `alt` after widget hydration and Mention/Color data updates, plus loss of a backward range when inline-only reprojection replaces unrelated caption text nodes. The current renderer produces the expected readable alt, while the editor can retain token text. v1's missing Image inline declaration is not permission to remove the useful current capability. The literal-only fixture records this boundary explicitly and does not add an accepted row or weaken the widget/selection expectations. Upload/source actions, appearance controls and the remaining Image behaviors retain their own obligations.


## Toggle roundtrip parity (2026-10-29)

**Accepted scenario: `BLOCK_TOGGLE_ROUNDTRIP`.** Original `b3a2f16bed38f91d482b3f29f2e4db1ff096cb96` is published with an identical tree as `5d1a39b4b8d8d95ab6360b224ea6531292723ca7`. Four fixed cases cover the actual empty closed default, populated open content with formatted widgets, its unwrapped positive control, and the same populated content while closed. Mention belongs to the title and Color to the independent body. The title receives native input and one Undo/Redo; body content, marks, sidecars and DOM identity remain unchanged, including while hidden.

The oracle additionally checks both fields' editability, exact disclosure class, computed body display, `aria-expanded` and the current button/body `aria-controls` relationship. Detached, mounted-single and mounted-document renderer contexts require DETAILS/SUMMARY/title-SPAN structure, the saved open state and a body DIV only when content is nonempty. Toggle-button activation, native body authoring and keyboard behavior remain separate obligations.

The cumulative 28-case differential passes **4632 candidate observations / zero failures**. v1 completes 28 cases with 4596 observations and 276 precisely classified differences. The specification baseline completes 20 cases with 3467 observations; eight formatted-widget cases are explicitly incomplete after their exact read-only transition failure. Toggle contributes 706 observations and zero candidate failures, 48 v1 remount/caret differences, and two baseline formatted-case aborts. The classifier admits only the four exact Toggle IDs, exact mode/history identity arrays, the default generated-ID/outer-DIV caret at offset 2, and populated first-Undo prefix-Paragraph caret at offset 6 instead of title offset 12. No candidate exception or broad failure-text match is allowed.

The standard native page passes **28/28**. Frozen source `92f276c3` plus three-file patch SHA-256 `1ab46470fd8f83a0c5c6c57d4a7ae919ca08f0f168ee588f1216749a6955f4b6` and the recorded dependency symlink remain unchanged. Loaded Git source/style bytes are verified for 194/214/214 files, plus 64 dependency files, without unexpected page/server errors. Differential execution: 18:23:18–18:24:08 UTC, 50.033 seconds; native: 18:24:18–18:24:42, 24.365 seconds. Both exit 0 under the same Linux/Node `v24.22.1`/Chromium `142.0.7444.175` environment. Committed test blobs match the exact frozen inputs. Runner SHA-256: `49ed30a4e0fcf759fa3ab4307268b3bc7b45cae065c862ec9290951ecfc9177d`; fixture: `c38fb712c2f1e1e0d67dfa79d37dad3b03244d86ba6b89a30e0bb05c952ca417`.

The register reaches **23 accepted / 186 open** obligations. These cumulative totals overlap earlier runs and are not added together. Image's literal-only proof remains partial; its separate widget limitations are not accepted by the Toggle addition.

## Spoiler and Columns roundtrip parity 2026-10-29

**Accepted scenarios: `BLOCK_SPOILER_ROUNDTRIP` and `BLOCK_COLUMNS_ROUNDTRIP`.** Spoiler is published as `a03dfd87d6f06ff7bff2c05b7625ca77c91cfc83` (original `7af7f6273d919204d37bd8b4a6575c4e6b2aeaad`); Columns as `43254ba6f54fd146846c051f668d906570442918` (original `567e99de52c2b128ccb7f4d53b15612092b2f0b4`). Every published tree was fetched and compared with its original. Each block adds actual default, fixed populated formatted-widget and unwrapped-widget control cases to the existing shared runner.

Spoiler preserves independent label/Mention and content/Color fields, including hidden content. Its disclosure is transient: editing expands it, read-only collapses it, and editing again restores the same fields. The fixture checks actual hidden/display state, open class, accessible control label and exact `aria-controls`. All three renderer contexts preserve separate author slots, start collapsed and omit only the empty body. Trusted label input and one Undo/Redo retain the independent body. Disclosure activation, body-native input, Enter behavior and other locales remain separate obligations.

Columns preserves the actual two-column `1-1` default and fixed populated `1-2` layout, independent widgets and marks, exact current column IDs/order, both field identities, grid structure and accessible active layout controls. v1's test-only wire adapter omits unsupported IDs while retaining every ordered content value and the same layout. All three renderer contexts preserve the fractional grid and separate column DIVs. The first field receives trusted input and one Undo/Redo; the second field and neighbor Paragraphs remain unchanged. Layout activation, three-column conversion, responsive sizing and a separate native edit in the second field are not accepted here.

| Frozen slice | Candidate observations / failures | v1 observations / exact classified differences | Specification baseline observations / incomplete cases | Native page |
| --- | ---: | ---: | ---: | ---: |
| Through Spoiler, 31 cases | 5160 / 0 | 5124 / 311 | 3845 / 9 | 31 / 31 |
| Through Columns, 34 cases | 5706 / 0 | 5652 / 346 | 4236 / 10 | 34 / 34 |

The three Spoiler cases contribute 528 candidate observations; Columns contributes 546. v1 contributes 528 per added block with 35 exact remount/caret differences each. The specification baseline's formatted case for each block stops after load with its recorded projection-boundary error; subsequent phases remain incomplete. Classifiers are restricted to the three exact IDs per block and the observed owners/values/phases. No candidate exception is introduced. The cumulative totals overlap earlier runs and must not be added together.

Spoiler used frozen `b3a2f16b` plus patch SHA-256 `58134f5a9f6d84d4ed4f8e1057e0681831b6e4c68e334470af0a710bb2fd29bc`. Differential: 18:37:52–18:39:00 UTC (68.000 seconds); native: 18:40:05–18:40:34 (28.433 seconds). Runner SHA-256: `f410a4ba221c6cf57fa2baaad34b461478a414ca666b3c4d1b0ab598b8a2a543`; fixture: `17435941d8fbfd1bacfa1f26544a1d3d3629238de1b769b30af0a7d8fce0e3c9`. Loaded Git source/style files: 197/217/217, plus 64 dependency files.

Columns used frozen `a03dfd87` plus patch SHA-256 `902be70897c89def9398fff12ceb73bc3a5c5e7227208650ed48f3e4778d5f88`. Differential: 18:43:47–18:44:52 UTC (65.238 seconds); native: 18:45:39–18:46:07 (28.417 seconds). Runner SHA-256: `4f8b4104c329d4d086d2f2d021bfc430239e06d56ecf5e45d20987d9be122a5d`; fixture: `7c7c064a8a1e1ea6dc5ef3ec769ff028da1ba48524e29c3be6b03fddbb87b342`. Loaded Git source/style files: 200/221/221, plus 64 dependency files.

All four commands exited 0 with unchanged source/patch and recorded dependency symlink, verified loaded bytes before/after, and no unexpected page/server error. Environment: Linux x64, Node `v24.22.1`, Chromium `142.0.7444.175`, shared installed contemporary dependencies. The register now has **25 accepted / 184 open** obligations. The Image literal-caption result remains partial and does not gain acceptance from these additions.

## Combined core continuation 2026-10-29

The published continuation ends at `0fecf490fe8a57188ac9edb502d2803743c29883`, with the exact tested merged tree `820823b30699871a132d4dab207cd9c871af079e`. The original merged source is `1b1db09196fd96b4377b167346385762a3972838`. All 17 individual publication trees and parents were verified after fetch. The clean earlier integration is `0cf0cc72a12a2995e22e73cf75c2e29ef91bd476`, tree `ad395ef5ca1b812033e129baf7fef5149ca47661`. Only ten parity fixture/documentation files differ; production, core tests, package and lockfile are identical.

**B-PRESENTATION is settled in specification §16.5 and implemented.** A failed standalone projection is contained at its affected field; unrelated author DOM, backward ranges, widgets, tasks and trusted pending input remain usable. Unchanged failed descriptors do not trigger automatic retries. Explicit changed descriptors may attempt recovery; callbacks cannot reclaim foreign fields or shells. Observer delivery continues for independent fields. Canonical, initial and mode failures retain their existing rollback/terminal owners. Mode callbacks, task cancellation and inverse failures are validated before accepting the mode. No public retry manager or second canonical store was introduced.

C09 removes an additional public-adapter copy only after the runtime has transferred owned detached data. Nested snapshots remain caller-mutable and isolated, public envelopes remain frozen, and external input still crosses strict JSON capture. Its 12 focused tests first produced five real failures, then passed. C07 names the eleven actual engine phases and five runtime invocation contexts through exact JSDoc unions; emitted executable JavaScript is unchanged. Inline-only payload projection preserves unrelated Text nodes and backward selection with linear ownership checks. Two range regressions and three callback regressions preceded the repair. C10 adds test-only actual heap evidence that evicted payloads disappear while the editor still supports its newest full Undo/Redo action.

The following are actual completed commands on the clean frozen integration, with unchanged source before and after each command:

| Gate | Observed result | Duration |
| --- | --- | ---: |
| `npm test` | 1962 passed, zero failed/skipped | 27.964 s |
| `npm run typecheck` | Both checkJs projects passed | 14.675 s |
| `node tests/browser/run.mjs` | All 35 registered pages passed | 38.446 s |
| `node tests/browser/physical-history.mjs` | 2128 passed across 41 arrays; base Enter/toolbox/history scenarios also completed | 968.422 s |
| `node tests/browser/heap-gate.mjs` | Live eviction/control proof passed; zero of 23 disposed sentinels retained | 12.193 s |
| `npm run test:package` | 285 declarations without diagnostics, strict Bundler/NodeNext, Vite, ESM, external browser and 22 CSS assets passed | 44.685 s |
| `npm run test:docs` | Source/localization/README/documentation contracts passed | 5.038 s |
| Three-source roundtrip runner | 28 cases, 4632 candidate observations, zero candidate failures | 55.436 s |

The ordinary suite includes 63 presentation, 60 projection and nine optional-inline contracts; the native total includes the 14 genuine-input presentation cases. Focused and cumulative totals overlap and are not added together. After the merge, the clean original main source separately passed the expanded **34-case / 5706-observation** differential (65.182 s) and **34/34** native roundtrips (29.070 s). Exact v1 differences remain classified, and the ten specification-baseline cases that stop after load remain incomplete.

The [core checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/core-continuation/README.md) retains the ten original command manifests, source identities, timestamps, environment, log hashes and earlier TDD failures. It also preserves the rejected whole-block recovery comparison, heap sensitivity RED, snapshot samples, inline linear/quadratic samples and an audit of the remaining structural performance evidence. A source map reconstructs 25 original integration commits from 88 published blobs without changing the working tree or real index. The benchmark's separate prepare-only replay verified 258 module hashes and three lockfiles; no additional timing run is claimed.

The measurements have bounded meaning. Snapshot reads improve on the measured headless path, while complete small edits are essentially unchanged. The inline repair removes the quadratic candidate's overhead; its 800-widget median is 52.5 ms versus 47.4 ms for the older behaviorally defective baseline, with overlapping sample ranges. No general editor speedup or latency guarantee follows. The actual heap snapshots retain the deliberate public control until release and the current/latest history objects; they do not turn serialized history limits into a heap-size guarantee. Populated Table/Gallery/Columns native authoring, scheduled `onChange`, UI/paint and allocation comparisons remain C09/T15 work.

Environment is Linux x64, Node `v24.22.1`, Chromium `142.0.7444.175` and the recorded lockfile. Other engines and manual OS IME are not established. The earlier Image backward-range defect is repaired, but derived image `alt` after caption widget hydration/update remains open; full Image acceptance is still withheld. These core gates do not automatically accept additional differential register rows. The current total remains **25 accepted / 184 open**, with B-HTML, B-STYLE and the remaining library capabilities requiring their own evidence.

## Attaches roundtrip parity 2026-10-29

**Accepted scenario: `BLOCK_ATTACHES_ROUNDTRIP`**, original fixture commit `ab1c73ea6151a209443dc633dc83dfd9355ec61e`. The existing shared runner adds the actual empty `files: []` default and two populated PDF/TXT files with fixed IDs, URLs, sizes and literal names, including token-looking text. The empty block has no fabricated editable field or history action. The populated case checks both names, three renderer outputs, link/download attributes and displayed sizes, then a trusted edit of the first name and exactly one Undo/Redo while preserving the second file.

Attaches intentionally rebuilds its name controls during mode projection. The proof retains block/wrapper identity, validates the newly owned controls and field addresses, and verifies detached old inputs and removal buttons cannot alter canonical data or history after either mode transition. It requires stable name-field identity through author edit and replay when file structure is unchanged. Read-only focus denial preserves external focus. Attribute checks do not claim actual navigation/download activation; those actions have separate rows.

The frozen source is published core `0fecf490` plus three-file patch SHA-256 `e6d4a517c4c58a07023ef048a07c7a8ff7b6be34a1498deb7c2bb467477347a1`. The cumulative differential completes **36 candidate cases / 5979 observations / zero failures**. v1 completes 5921 observations with 361 classified raw differences; Attaches adds 15 exact remount/caret observations. The specification baseline records 4509 observations and 12 classified differences, with ten preceding formatted cases still incomplete. Both Attaches cases complete all phases there; its two exact focus-return differences require the correct active fields and the observed false return. No candidate exception is allowed.

Differential execution was 19:07:39.086–19:08:46.398 UTC (67.296 s); the standard native roundtrip page passed **36/36** at 19:09:05.755–19:09:37.306 (31.526 s). Both exited 0 with unchanged sources and dependencies. The runner verified 203/224/224 Git source/style files and 64 dependency files; there were no unexpected page/server errors. An earlier process disappeared without a completed result and is retained as interrupted, not passed or a product failure.

Runner SHA-256 is `7463630eb9e3423f75930fa01cef83974d2fd405b9788c1bf118fb9b0a10c264`; fixture SHA-256 is `462861402cd6ac075dc59016f415843ae5c78e1b191917c7d2d5958985a365bb`. Committed bytes match the frozen proof. The retained `scripts/parity/checkpoints/2026-10-29/attaches-roundtrip-verification.json` includes original command records, log hashes and the interrupted-attempt record. Environment remains Linux, Node `v24.22.1`, Chromium `142.0.7444.175` and shared recorded dependencies. The register reaches **26 accepted / 183 open** obligations; these cumulative counts overlap earlier runs and are not summed.

## Table default restoration 2026-10-29

The no-data Table default is restored to the v1 **3×3 empty grid**. v1 source and README explicitly establish that shape. History inspection found the current 1×1 default introduced in schema commit `fab6eb36d92cc6583bcb39d49f9503b3be3a5db6`, then consumed by the runtime; later documentation described the existing 1×1 behavior without establishing a superseding product decision. The user's functional-preservation instruction authorizes restoring the lost default. No new option, schema version or migration is introduced.

The only production change is `tableDataSchema.createDefault()`: three independently allocated identified rows, each with three independently allocated identified cells. `withHeadings: false`, version 2, explicit 1×1/3×3 data and the intentionally one-cell conversion importer are preserved. Test-first `0b49265c` and implementation `2a3dd162` are integrated as `3ea19eb1` and `e1790dce`; all seven changed file hashes match the tested isolated source.

The corrected RED had **76/78 unit checks** and **2/3 native cases** passing: the two unit failures and one native failure all exposed the no-data 1×1 shape. Explicit grids already passed. An earlier fixture incorrectly compared the observation timestamp from `save()` and is retained separately, excluded from product RED. The same corrected tests pass **78/78 and 3/3** after the minimal repair.

Clean unchanged `2a3dd16215bffeebe6207d7d333f0f4d111e448e` then passed **1967/1967** unit tests, both checkJs projects, **7/7** strict generated-declaration consumers, documentation contracts and **15/15** Table cases on the existing native-plugin page. Native proof includes public construction/save, detached and mounted renderer, mode transitions, cell identities, trusted first-cell input, exact one Undo/Redo and caret, plus twelve existing Table cases. The filter is explicitly `Table`; this is not another complete library native run.

The checkpoint retains `table-default-verification.json`, the unmodified final C11 manifest and a two-commit source map. After restoring the core integration, the existing source restorer accepts `table-default-source-map.json` as its argument to recreate the exact original Table verification commits. The source map is provenance, not another test run. This fixes the demonstrated default regression; the broader `BLOCK_TABLE_ROUNDTRIP` remains open, so the register stays **26 accepted / 183 open**.

## Raw roundtrip parity 2026-10-29

**Accepted scenario: `BLOCK_RAW_ROUNDTRIP`**, original fixture commit `069ae9468b5d88bda6acb5eedc875f1bd1038b70`. Two cases retain the actual empty default and exact multiline plain-text HTML source, including entities and token-looking literals. The textarea and canonical `html` remain exact strings. Three renderer contexts produce the corresponding benign markup. Read-only mode exposes the existing sandboxed preview; when returning to editing retains preview state, the fixture activates the real Preview control and requires the textarea to be visible and receive pointer input. Both cases then execute a trusted edit and exactly one Undo/Redo, checking source, native caret, field identity and cleanup.

The frozen proof uses `c557efd8` plus three-file patch SHA-256 `c33a1624aa04eb56f56572708b27def1378d7cc7def9286bda1a0772d623afb1`; committed file bytes match. The cumulative candidate completes **38 cases / 6325 observations / zero failures**. v1 completes 6265 observations with 380 exact classified differences. Raw adds sixteen remount observations and three precisely identified textarea Undo/Redo owner/offset differences. All seven phases must complete before any Raw classification; generated default block ownership is bound to its actual ID. The specification baseline has 4855 observations, twelve preceding classified differences and ten preceding incomplete cases. Both new Raw cases are complete and have no baseline or candidate exceptions.

The differential ran at 19:20:53.787–19:22:08.023 UTC (74.064 s). The standard native page passed **38/38** at 19:23:07.785–19:23:39.853 (32.049 s). Source identities and all loaded bytes remained unchanged: 205/226/226 Git source/style files and 64 dependency files, with no unexpected page/server errors. Runner SHA-256: `2888ca64c77d556eea286216f22df04c6c2993c8e0aede4a7e0f32a0f9f3e236`; fixture: `d4bc22541cdba3bb7b0a641de0f9463b4667b06b32390d5f3d34dcc017265949`. The checkpoint `raw-roundtrip-verification.json` preserves the command manifests and log hashes.

These are Linux, Node `v24.22.1`, Chromium `142.0.7444.175` results using the recorded shared dependencies. Safe preview markup and source editing do not accept hostile HTML confinement, frame sizing, themes, Tab indentation, navigation, downloads or media policy. B-HTML remains open. The register reaches **27 accepted / 182 open** obligations; cumulative counts are not added to earlier overlapping runs.

## Embed and Table roundtrip parity 2026-10-29

**Accepted scenarios: `BLOCK_EMBED_ROUNDTRIP` and `BLOCK_TABLE_ROUNDTRIP`.** Embed's executed source is `4da6735f7e13f7456aba6f167dde714ad645010d`, integrated as `6b80631f`; the final combined Table source is `45de0c4da813b5ddf044b4c0f130265ba49a446e`, integrated as `65b4ee9d`. All three shared fixture/runner/documentation blobs match their executed source. These slices add proof without changing production behavior.

Embed covers the actual unconfigured default and a fixed Vimeo reference with a locally decoded one-pixel cover, literal caption, formatted Mention/Color caption and its unwrapped control. Preview resolution is disabled and no provider request is required. Three renderer contexts, read-only and editable modes, actual caption input, one Undo/Redo, canonical data and cleanup are checked. v1 does not declare rich Embed caption fields: its two rich controls are recorded as unsupported reference capability, not a repaired historical defect or permission to remove current functionality. The default and literal comparison establish the retained v1 behavior.

Embed's existing history reconciliation may retire a changed caption host while retaining the block wrapper. The proof checks the new exact field and verifies that retained old input/blur callbacks cannot alter canonical data, history, or current selection. It retains strict host identity for phases where the host is unchanged. The original full run failed on a specification-baseline page error and remains failed in the checkpoint. Final classification requires exactly one paired native/window error, the exact baseline source/case/Redo phase/stack and eleven failure vectors, all seven phases and complete records; duplicates, unrelated errors and every candidate error remain fatal. One positive and 21 negative offline controls pass.

Table covers the restored actual 3×3 default and a fixed 2×2 table with headings, marked text, independent widgets and repeated cell IDs correctly scoped by row. Every cell, stable row/cell ID, table part, editability and three renderer contexts are checked. Trusted input edits the first cell; all other cells and neighbors survive one exact Undo/Redo. The v1 adapter only maps the fixed rows to its real string matrix format. Two earlier oracle mistakes—unsupported underline and noncanonical emphasis spelling—are retained separately; neither is a product regression. The exact Table classifier accepts 72 known observations and rejects each of eight negative-control families. Candidate and the baseline unwrapped control have no exceptions.

| Executed source and scope | Current result | Reference observations | Native result |
| --- | --- | --- | --- |
| Embed final, 42 cumulative cases | 7007 observations, zero failures | v1: 6959 observations / 484 classified differences, including 66 unsupported-capability observations; baseline: 5368 / 24 differences, eleven incomplete cases | 42/42 |
| Combined Table final, 45 cumulative cases | 7553 observations, zero failures | v1: 7487 / 519 classified differences; baseline: 5759 / 61 differences, twelve incomplete cases | 45/45 |

The combined run is 20:12:30.346–20:14:18.002 UTC; its C11 gate took 108.440 seconds. Native execution is 20:14:18.549–20:14:54.680, 36.128 seconds. Both exited zero on unchanged source under Node `v24.22.1` and Chromium `142.0.7444.175`. Loaded source/style identity is verified for 212/234/234 files and 64 dependency files. The candidate has no page/server errors. The baseline's one raw error and one raw page error are the exact paired Embed Redo failure above; all incomplete phases remain explicitly incomplete. Counts are cumulative and overlap earlier runs.

The [Embed checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/embed-roundtrip/README.md) and [Table checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/table-roundtrip/README.md) retain complete compressed raw traces, failed attempts, source patches, manifests, hashes and classifier controls. The final runner hash is `f518ff5e9b848482e5621fff9e0b5301310e472c5f3a8ccb7f9fc89487f5ee3d`; fixture hash is `436248453dc42c5a637389af2c03f143ea94b1b7c76729bc0087cca42168fb63`.

The register reaches **29 accepted / 180 open**. This accepts the shared roundtrip obligations. Embed provider/network/media behavior and Table row/column commands, keyboard navigation, paste and multiple-cell selection remain separate obligations. Full Image and Gallery acceptance, B-HTML, B-STYLE and whole-library differential acceptance remain open.

## Field projection completion 2026-10-29

The optional synchronous `BlockInstance.afterProjection(field)` contract is published with the Image implementation as `a4a8c4717856dcea821d40af7f317d0f12ce1ab9`. It belongs to the existing reconciler and its exact field ownership, observation guard and recovery path. The callback sees actual completed author presentation before operation acceptance and may update owned auxiliary presentation; it does not gain authority over author data, history, focus or tasks. Independent test-first controls cover receiver/capture, precommit ordering, native canonical no-op, read-only transitions, synchronous failures, author-node replacement, field-local recovery and foreign adoption.

The [core checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/field-projection-completion/README.md) retains the complete isolated proof: 1967 unit tests, seven generated type consumers, both checked-JavaScript projects, installed-package contracts, 100 projection cases, 63 presentation cases, 28 mode cases and native-library 36 plus native-presentation 14. These are overlapping scoped gates. The subsequent integrated run passes types, package and units, then initially fails on two untranslated Russian prose terms. After the documentation-only correction, docs browser and 36 ordinary pages pass. The unfiltered native continuation fails two narrow Table assertions on its final design page (82/84); a separate unchanged-source heap gate passes all 23 destroyed-instance sentinels with zero retention and checks live history eviction. No complete green native aggregate is claimed.

The [GitHub run on `894dfc09`](https://github.com/Shelamkoff/editor/actions/runs/40958079298) passes six non-browser jobs but fails Shift+ArrowDown at expected focus offset 2 / observed 1. Its four new atomic-boundary pointer controls pass. The remote keyboard failure and local Table assertion remain separately attributed investigations. These outcomes do not reduce the preservation register or establish full release acceptance.

## Image roundtrip parity 2026-10-29

`BLOCK_IMAGE_ROUNDTRIP` is accepted with the implemented rich-field completion contract. Frozen production is `fe44cc57f5cbac1daffd031f5c8e791d707fb828`; the fixture was committed as `daeca9e976f60caa3e37728e0ed8cc12dd914857`, and the unchanged tested runner/guide as `93dda99fc3b9a7d471d7f1a2d24f503dfdb40e97`. The integrated test commits are `6e40932e` and `dc397a8a`. The final verification checkout includes its recorded runner/guide worktree patch and dependency symlink; it is frozen, not described as clean.

The existing empty-source and literal-caption cases remain unchanged. Two new cases use real Mention and Color definitions, authored marks around the widgets and a separate unwrapped control. Fixed expected labels, locally supplied image data, all canonical fields/sidecars, renderer output in detached/mounted/iframe contexts, both mode transitions, native caption input, exact one-operation Undo/Redo and cleanup are checked. Image contributes **670 passing observations**: 82 default and 196 each for literal, wrapped-widget and unwrapped-widget captions. The expected alternative text comes from fixed fixture semantics and browser HTML decoding, not from the implementation under test.

| Executed gate | Current result | Reference observations | UTC interval |
| --- | --- | --- | --- |
| Final differential, 47 cases | 7945 observations, zero failures | v1: 7879 observations / 651 classified raw differences; spec baseline: 5986 / 68, thirteen incomplete cases and the separately paired existing Embed Redo error | 21:35:53.369–21:37:41.164 |
| Standard native ROUNDTRIP page | 47/47 passed | Candidate only | 21:37:41.420–21:38:16.962 |

Both commands exited zero on unchanged source and used Node `24.22.1` with Chrome `156.0.8078.47`. Source verification checked 212/234/234 loaded source files and 64 loaded dependency files. The original 45 specifications are unchanged. The initial two-case raw probe is retained with exit 1: candidate 392/392 passed, while 132 v1 and seven baseline differences were still unclassified. Offline sensitivity recognizes all 139 observed historical vectors and rejects 2093 mutations.

Pinned v1 Image and its abstract base expose no `mapTextFields` capability; its insertion gate cannot persist the new widget captions. Those exact cases record an unsupported reference capability while preserving the supported current feature. They are not labeled repaired v1 defects. The six baseline alternative-text observations and its one formatted-widget mode failure remain source-specific, and the latter's six unexecuted phases are incomplete. No candidate exception is admitted.

The [complete checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/image-rich-roundtrip/README.md) retains compressed full raw traces, both C11 manifests, native output, classifier script/results and source facts. The final decompressed trace has SHA-256 `46b00751b8326ae547cbc48b4aec379baabe5f38157b296017f7034d2b1a1655`; the three-file patch has SHA-256 `9ab57b6b3861508a790814cf20963743eb939aeb0301b7023a72648880bc3dc0`. The register reaches **30 accepted / 179 open**. This accepts the common Image ROUNDTRIP obligations; its upload/cropper/provider/detail rows, Gallery and whole-library acceptance remain separate.


## LinkPreview and Poll roundtrip parity 2026-10-29

**Accepted scenarios: `BLOCK_LINK_PREVIEW_ROUNDTRIP` and `BLOCK_POLL_ROUNDTRIP`.** The frozen executed source is `34439ee106a82ea7cbf4535aa151e6458866f149`, including the reviewed native-source field completion and the minimal Poll/LinkPreview repairs. LinkPreview was also independently verified on original core (19 native and 18 unit tests) and published as `f8df108cb03de7cde39261bffd1006c9cd2a116f`. This evidence is scoped to the tested source and the shared templates, not to every detailed action or a later CI run.

The cumulative **53-case differential passes 9,129/9,129 candidate observations**, with no candidate page/server error. The six new cases contribute **1,184 passing observations**: 810 across four Poll cases and 374 across two LinkPreview cases. The existing standard native ROUNDTRIP page passes **53/53**. The final C11 manifest also records **121/121 ordinary projection contracts**, **14/14 native Poll controls**, both typecheck configurations, plugin source audit and extension README validation, all on unchanged source.

Poll includes the real two-option default, rich literal question/options with fixed local results, and separate wrapped/unwrapped persistent Mention/Color controls. All option IDs, order, question/option marks, selected answer, 67%/33% results, sidecars and three renderer contexts remain fixed expectations. Trusted native question input preserves sibling options and neighbors through exactly one Undo/Redo. Intentionally rebuilt mode/history fields must retire their old controls. Separate regressions prove native option completion, backward-range retention during widget updates, runtime-only result rebuilding and rejection of foreign result labels and whole-wrapper input. Poll now completes readable marked labels through `afterProjection`; no direct option input listener remains.

Pinned v1 Poll and its abstract base lack `mapTextFields`, and its public inline insertion gate rejects such blocks. The default/literal cases execute meaningful v1 parity. Its two widget cases retain their real sidecars and raw differences as **unsupported v1 reference capability**, while proving the supported current behavior. No adapter removes them or invents v1 support. The only captured v1 default data are the generated block identity and two nonempty unique option IDs; all content, counts and later records remain independently fixed.

LinkPreview covers the real empty `notion` default and populated `horizontal` metadata with literal HTML-like/token-looking text, controlled local image/favicon, exact URL and plain metadata output. Real native URL typing clears the previous metadata and updates the visible card without a configured provider. One Undo/Redo restores canonical records, input value, caret and renderer output. The separate native controls reject readonly/retired input and metadata cancellation that authors a successor URL. The runtime fix compares updates with the accepted canonical predecessor, completes native no-op submissions and stops superseded view/metadata work.

The full trace preserves **781 raw v1 differences and 79 raw specification-baseline differences**, with no unexpected failure in any source. The existing exact Embed page-error pair remains separately classified. **Fifteen baseline cases are explicitly incomplete**, including the two Poll widget cases that fail after load; those remaining phases are not passes. The four existing empty-block authoring scopes remain explicitly not applicable. The new classifier accepts only captured historical source/scenario/phase/value/author-record and native-owner combinations; candidate exceptions are impossible. Offline sensitivity recognizes 141 historical vectors and rejects 2,271 mutations plus 3,044 passing observations as exceptions.

The differential ran **2026-10-29 23:04:17.341–23:06:18.575 UTC**; its C11 gate took 121.999 seconds and the native page 41.920 seconds. Environment: Node `v24.22.1`, Chrome for Testing `156.0.8078.47`. Loaded Git source/style identity is verified for 218/241/241 files plus 64 dependency files. Runner SHA-256: `48bf7394b51cacddf955d3f1fce72fa5894da2d5b4f78b83d8551ceee1b2a8b5`; fixture: `499386bb8be98d9858f84839ec2cf88e92b1835166dd383ff4523820abd9eb6d`; the separately verified classifier: `7807e295fff45c5d96011a3365cadf18efc5cebce972d8cdec1c518bde1a5c72`.

The [complete checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-29/link-poll-roundtrip/README.md) retains full compressed raw traces, manifests, exact logs, source facts, reconstruction patch and positive/negative classifier controls. Original product REDs and invalid fixture/driver attempts are identified separately. The final decompressed trace SHA-256 is `285a3287d606315e03f6f3cc9201b415510d832f39eaa1345cd881023b0ad419`. The register reaches **32 accepted / 177 open**; detailed LinkPreview/Poll rows, Gallery/Carousel/Person ROUNDTRIP and full library parity remain separate obligations.

## Final integration verification

The final production source is `60fec50c9ac9ec9a82e1d1c0653ce44cda06d51b`; `f04e63da788564cd00d5316dacf9146b6d6d8aba` changes Russian preservation prose only. Evidence is collected in the [final integration checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/final-integration/README.md). The original isolated run on `f04e63da`, `run-bJYxpZ`, ended with `docs: failed` and `browser: interrupted` after its controlling execution process disappeared. Its source remained unchanged, and no browser assertion failure was recorded before interruption.

The recorded cutoff is **36 ordinary pages plus 25 named native pages containing 970 native cases passed**. Sequential execution also shows completion of the earlier Enter/toolbox/history matrix and six additional native arrays, but their final aggregate JSON was never printed. The separate continuation `run-aO0xLM` passed all remaining **10 named native pages / 939 cases**, plus the heap gate (**23 sentinels, zero retained; history-eviction controls passed**), on the identical unchanged source. Together the records cover all 35 planned named native pages and 1909 explicitly recorded named-native cases. Counts for the unprinted initial arrays are not reconstructed. This is composed coverage, not a successful uninterrupted full browser command. The corrected documentation has its own final gate in the checkpoint.

The combined source completes natively changed rich fields through the existing hydration and ownership path, keeping Gallery's derived alternative text current. Image/Person derived presentation and Poll's readable result labels use their admitted projection owners. The final Person URL correction removes its direct input listener, admits and revalidates original roots at read/mode boundaries, and retires resources without clearing foreign DOM. Carousel captions use the existing inline parser for entities, formatting and actual widget data. The already published LinkPreview URL/metadata correction (`f8df108c`) and native vertical-selection repair (`afea0f34`) are included.

Completed checks cover both typecheck configurations, **1987 unit tests**, installed-package contracts, **7 consumer type cases**, and the package-size gate. The fresh three-source differential on the final code records:

| Source | Observations | Outcome |
| --- | --- | --- |
| Candidate, 53 cases | 9129 | Zero failures |
| Pinned v1 reference | 9040 | 781 raw historical differences, classified |
| Specification baseline | 6824 | 79 raw historical differences; 15 cases remain incomplete |

Classifier controls pass. Historical differences stay visible, incomplete reference phases are not passes, and candidate exceptions are not admitted. These cumulative observations overlap the preceding checkpoints and must not be added to their totals.

Earlier attempts remain failed in `run-T69Tfd` (Russian prose validation), `run-aoJ0oS`, and `run-Ea04al` (dependency setup/realpath). The `run-aoJ0oS` failure was a dynamic import of optimized `highlight__js.js` from the shared Vite dependency cache; the failed URL and cache metadata are retained in the diagnostic. These documentation and verification-environment failures are retained separately from product-regression evidence; none is counted as a successful complete run. The isolated continuation records its own source and outcomes.

At this recorded checkpoint the preservation register contained **209 rows: 32 accepted / 177 open**. Gallery, Carousel and Person ROUNDTRIP acceptance was still open. The later Gallery/Person proof below supersedes only those two common rows. `B-HTML`, `B-STYLE`, Carousel auto-height/Swipe obligations, `C09`/`T15` performance acceptance and the existing platform-coverage limits require their own evidence. These completed fixes and scoped checks do not establish overall functional parity or whole-library acceptance.

## Gallery and Person roundtrip parity 2026-10-30

**Accepted scenarios: `BLOCK_GALLERY_ROUNDTRIP` and `BLOCK_PERSON_ROUNDTRIP`.** This accepts the common template within the four recorded cases for each block. The register retains **209 unique IDs: 34 accepted / 175 open**. It does not accept detailed Gallery/Person actions, the Carousel template or whole-library parity.

The [Gallery checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/gallery-roundtrip/README.md) uses unchanged production `4bfb39426744bc0a96725258c06dc9192b58098b`. Its initial process failure came from unclassified historical differences; the candidate passed from the first literal-caption iteration. This bounded template did not produce a new Gallery runtime defect. Its final frozen test inputs and original C11 manifests are retained separately from later structural-field repairs.

The [Person checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/person-roundtrip/README.md) starts from the same production base and records the final isolated source `b1bf7bc9bf16802d690165e67adfe231eac3e6e4`, tree `b26955c95b6f2d6848ba750cdcc6e06d6953bf4f`. Only its plugin and renderer change runtime behavior; the archived four-commit sequence and seven exact file hashes identify the tested source independently of later publication commit IDs.

| Isolated verification | Recorded outcome |
| --- | --- |
| Gallery three-source run, Chrome 156; `run-fFA7Pt` | 703/703 Gallery candidate observations; cumulative 57-case candidate 9,832/9,832 |
| Gallery shared native page, Chrome 156; `run-EJFGkt` | 57/57 PASS |
| Gallery native cases, Chrome 142; `run-Sw4PUG` | 4/4 PASS |
| Person three-source run, Chrome 156 | 926/926 Person candidate observations; cumulative 57-case candidate 10,055/10,055 |
| Person native cases and responsive-renderer controls, Chrome 142 | 4/4 and 2/2 PASS |
| Person related unit files and both typecheck projects | 135/135 in 11 isolated files; both typecheck commands exit 0 |

These cumulative runs share the preceding 53 cases; their totals must not be added. The merged fixture contains 61 distinct specifications with all earlier fixed inputs preserved. The table above reports the actual isolated executions, not an invented merged-run total. Node is `v24.22.1`; recorded browser versions are Chrome `156.0.8078.47` and `142.0.7444.175`. Each checkpoint retains command intervals, source/dependency fingerprints and original outcomes. No current failure, page error or incomplete phase is granted a classifier exception.

### Preserved behavior and actual repairs

Gallery covers the actual empty-images default, two independently fixed local images with literal entity/markup/token-looking captions, and wrapped/unwrapped real Mention/Color caption controls. Empty Gallery has no fabricated editable field or history action. The populated cases preserve IDs/order, captions, marks, sidecars, styles/options, all declared fields and the native caret through one first-caption edit and one Undo/Redo. A mode-rebuilt predecessor must be detached and unable to author through retained input, blur or removal controls. The renderer's detached, immediately attached and `renderTo()` outputs preserve decoded image media and readable alternative/accessibility labels; its grid intentionally has no inline widget DOM.

Person covers the actual empty default and two fixed profiles with avatars, names, roles, biographies and identified links. Literal, wrapped-widget and unwrapped-widget cases are separate. The populated cases use trusted clicks to the second profile and back without author history, followed by a native first-name edit with exact Undo/Redo. Every phase checks the whole fixed document, including the inactive profile, sidecars and neighbors. Retired fields lose write authority; all three renderer surfaces contain both profiles' output.

The unchanged Person renderer initially omitted cards from detached output and its immediate attachment: the retained literal fixture records 12 candidate failures. Cards now exist synchronously. A further regression test required the same cards and actual widgets to survive the responsive list-to-carousel upgrade; the renderer passes those nodes through its existing content-factory port. Native Next/Previous and disposal controls pass. Finally, two real wrapped/unwrapped tab-switch failures showed that an already completed first label reverted to a literal token. Retaining the owned tab nodes, revalidating the click across the existing flush and updating active/ARIA state repairs those failures without a new canonical write or label cache.

### Historical reference limits and remaining obligations

Both runs use v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`. v1 Gallery has plain `textContent` captions and no image IDs; its adapter supplies fixed equivalent plain strings without decoding through product helpers. v1 Person likewise lacks current profile/link IDs. Neither v1 block declares the required persistent rich-field hook, and both disable inline tools. Their real widget cases remain explicitly unsupported reference capabilities, with raw sidecars and differences visible; this does not invent v1 widget support.

Gallery retains 103 raw v1 and 36 baseline failure records. Person retains 181 v1 and 36 baseline records. The two rich baseline cases for each block stop after load at the recorded mode-hydration failure; their remaining phases stay incomplete. Exact recognizers bind source, case, phase, full authored records, mode/history and relevant native owners. Gallery sensitivity rejects 2,644 altered records and 1,585 passing observations. Person sensitivity rejects 4,562 altered records and both actual candidate tab regressions. These checks test the recognizers; they do not convert failed reference execution into a pass.

**The never-opened Person widget-name tab was OPEN at this checkpoint; the later [canonical tab-label fix](/architecture/rector-v2/PUBLICATION_REVIEW#person-canonical-tab-labels-2026-10-30) resolves it.** The fixed second profile in these cases has literal rich text. A profile whose name contains a persistent widget before that profile has ever been opened is a separate presentation gap. `afterProjection` completes mounted fields; preservation of a previously completed label does not establish the never-mounted case. No private sidecar decoder, hidden authoring field or new public API is implied by this acceptance.

The four detailed Gallery rows (`SOURCES`, `LAYOUT`, `CAPTION_ORDER`, `APPEARANCE_VIEWER`) and five detailed Person rows (`CARDS`, `HIDDEN_FOCUS`, `READONLY_TABS`, `AVATAR`, `LINKS`) remain open under their full `BLOCK_…` IDs. All seven Carousel rows, including its common ROUNDTRIP, remain open at this checkpoint. `B-HTML`, `B-STYLE`, complete structural `C09`/`T15` performance acceptance and broader browser/platform coverage are also separate obligations. A completed common template or an owner-local repair does not establish every detailed capability.

## Carousel roundtrip parity 2026-10-30

**Accepted scenario: `BLOCK_CAROUSEL_ROUNDTRIP` only.** The isolated proof below is complemented by completed combined `run-M5oL2Z` on the [published candidate](https://github.com/Shelamkoff/editor/commit/fc669f9178a6ea9d8d566380e450fb47fa7c595f), detailed in the [final continuation](#final-combined-continuation-2026-10-30). All **209 unique IDs** remain: **35 accepted / 174 open**. The six detailed Carousel obligations retain their separate open status. The table below preserves actual isolated results; the earlier parent comparison retains its own outcome.

The [Carousel checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/carousel-roundtrip/README.md) records clean source `942467e2669064433e2b50a14dbdd0df4df01d2b`, tree `4bd0667b6eda0d4d222d1f22380384394c0e072a`, and C11 `run-64mauO`. All eight gates and the whole run report `sourceUnchanged: true`; execution is 2026-10-30 01:37:21.378–01:40:25.290 UTC. No additional Rector production runtime change was needed beyond the published `4bfb3942` baseline. The dependency is the actually installed immutable Carousel commit `f7f6485886a1d77f9213d9079eb70000efeff499`; all 47 installed distribution files match the verified narrow upstream build. Package/lock identity, source hashes, original logs and commands are retained in the checkpoint.

| Isolated gate | Recorded result |
| --- | --- |
| Three-source differential, Chrome 156, 57 cases per source | Candidate 9,847/9,847 observations; Carousel 718/718; zero unexpected failures |
| Native Carousel common page, Chrome 156 and Chrome 142 | 4/4 in each browser |
| Standard projection contracts, Chrome 156 and Chrome 142 | 147/147 in each browser, including actual automatic height |
| Existing native Carousel media controls, Chrome 156 | 16/16 |
| Strict Carousel classifier replay | 123 historical differences recognized; 2,418 altered controls and 1,649 passing observations rejected |
| Localized README contracts | 47 pairs validated |

**Interim parent differential:** the `differential65` gate in C11 `run-2Zb0Ur` passes on clean immutable `9ccae3589fed3cc9f601fdf847654efbdcb1d584`, tree `49caefb7386d24612c36a86e603cfa634da9c178`. It records **65 cases / 11,458 passing candidate observations**, including the same 718 Carousel observations; v1 has 11,258 observations and the specification baseline 8,043. Every source has zero unexpected failures and zero unexpected reports in either browser error channel. The raw historical differences remain present. Source identity is verified and the gate is unchanged from 01:51:09.725 to 01:53:40.956 UTC. Its original record is `test-results/run-2Zb0Ur/differential65.log`; the restored local-media fingerprint is `acc9e5c613e78cf0a6c73a18dabbb2662e090f0331e4f31cbc9f9f1f53499d75`. The historical run later failed its browser gate in three Gallery cases. Its successful differential is retained, but the whole run remains failed; the corrected source is verified by the separate final integration record below.

The four cases are the actual empty `slides: []` default, populated literal mixed media, and populated real Mention/Color captions with and without formatting wrappers. The empty block has no fabricated caption or history action. Fixed records preserve every slide's identifier, type, caption, independent alternative text, options, sidecars and neighboring blocks. Trusted pointer clicks select local video, HTML and image without changing author history; the 16-by-16 WebM must expose real metadata. Native caption input, one keyboard Undo/Redo and the exact caret complete each populated case. Detached, immediately attached and `renderTo()` outputs retain all media and widgets. Retired fields and callbacks cannot author through the current view.

No case substitutes a fixed aspect ratio for automatic height. The [dependency investigation](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/carousel-autoheight-dependency/README.md) retains the original public-renderer RED: 146 existing projection cases passed while the new actual-height case failed with two ResizeObserver errors. The upstream fix coalesces observer writes in an owned animation frame and cancels obsolete work; its loop-width bookkeeping and published `update([])` guard have their own controls. Earlier prepare-only installation failures remain failures. The final published Git artifact contains the canonical generated distribution and was installed with scripts disabled; the current browser checks use that actual package without an observer monkeypatch or error filter.

The differential uses v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`. It retains **91 v1 and 32 baseline Carousel failure records** with original values. v1 literal captions receive independently fixed equivalent plain strings; its persistent rich-caption widgets remain explicitly unsupported. The two rich baseline cases stop after load at the exact mode-hydration error; their remaining phases stay incomplete. Exact source/case/phase/record recognizers grant no current-candidate exception. The full 57-case record separately retains the previously classified paired Embed error; Carousel introduces no new error-channel exemption.

The merged fixture now has **65 distinct cases across all 21 registered built-in blocks**. The final combined differential and complete native/browser validation are recorded in `run-M5oL2Z` below. The earlier Gallery, Person and Carousel 57-case totals overlap the preceding 53 cases and must not be added or presented as that execution. Browser versions in the Carousel evidence are Chrome `156.0.8078.47` and `142.0.7444.175`, with Node `v24.22.1` on Linux.

Only the common Carousel row is accepted. `BLOCK_CAROUSEL_MIXED`, `BLOCK_CAROUSEL_STRUCTURE`, `BLOCK_CAROUSEL_CONTROLS`, `BLOCK_CAROUSEL_AUTOPLAY`, `BLOCK_CAROUSEL_HTML` and `BLOCK_CAROUSEL_TASKS` remain open, including their full source/action/option and lifetime matrices. The existing 16 media controls are regression coverage, not acceptance of those complete rows. Detailed Gallery/Person rows, `B-HTML`, `B-STYLE`, full structural `C09`/`T15`, platform breadth and whole-library parity also remain open.

## Final combined continuation 2026-10-30

The tested source is published as [`fc669f9178a6ea9d8d566380e450fb47fa7c595f`](https://github.com/Shelamkoff/editor/commit/fc669f9178a6ea9d8d566380e450fb47fa7c595f), with original local identity `6409e2d24585ac69bc0d991f8c096674c3905a27` and tree `0d65a81e4678088fa07d59b7c1539793b0ab47c9`. The complete trees match; this establishes source equivalence, not a second execution under the remapped commit ID. All ten gates and the whole `run-M5oL2Z` passed with unchanged source; completion was 2026-10-30 03:02:16.865 UTC. [The final integration checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/continuation-final-integration) retains the original `run-M5oL2Z` manifest, logs, source/dependency identity and command outcomes.

| Gate on this unchanged source | Actual result |
| --- | --- |
| Unit tests | 2027/2027 passed; no failures or skips |
| Both source typecheck projects, package build and generated consumers | Passed |
| Documentation contracts and installed-package checks | Passed |
| Production documentation | 127 HTML pages; 0 broken links; 0 missing assets; browser smoke passed for 21 block and 2 inline plugins, EN/RU and light/dark controls |
| Complete browser command | 36/36 ordinary pages; 41 native result groups, 2,247/2,247 passed |
| Heap/resource controls | 23 sentinels; 0 retained; all three history eviction/release phases and the 12 → 11 replay control passed |
| Three-source common ROUNDTRIP differential | 65/65 candidate cases; 11,434/11,434 candidate observations; 21 built-in types; no unexpected failures |

The comparison still uses the pinned real v1 and specification-baseline sources. Their explicitly unsupported capabilities, narrowly classified historical failures and incomplete phases remain visible. The candidate receives no historical exception. The 65-case fixture has the same bytes as the earlier 11,458-observation run. The 24 fewer candidate observations are six conditional retired-field checks in each of four Person cases: healthy sibling hosts now remain live instead of becoming retired. No case or assertion was removed from the fixture; retained fields continue to receive their identity, content, native-input and history checks. Observation totals describe executed branches, not a fixed number of independent requirements.

The bounded Table comparison uses five warmups and 21 paired samples with alternating source order. Large-Table public synchronous p50/p95 changes from 62.4/74.2 to 59.9/88.6 ms: the marginal median improves, but p95 is 19.4% worse. The candidate is faster in only 10/21 public pairs, with a median paired difference of +0.2 ms, so this does not establish a stable public-edit speedup. The candidate includes both descriptor reuse and the subsequent focus repair. Native p50/p95 changes from 89.2/100.5 to 82.4/100.7 ms. Sampled V8 allocation totals fall from 50,333,476 to 33,413,128 bytes for the public path (33.6%) and from 61,033,108 to 42,273,660 bytes for the native path (30.7%). These are sampled allocation observations over the comparison, not RAM usage or per-edit byte counts; 21 samples do not establish a latency guarantee. The 24 controls comprise 20 functional controls and four deliberate-failure sensitivity controls. Each measured source/shape group has zero retained objects in 1,008 WeakRef observations, with live positive controls. These bounded observations do not close full `C09`/`T15` performance acceptance.

The merged source includes the Person sibling-rich-field preservation repair, Gallery external file-drop handling alongside retained reorder state, native structured-history grouping, source dedentation, typed-pattern selection authority, and Table field-descriptor reuse with the original ownership path checked before focus. Their scoped regression records remain separate from the common template. The previous `run-2Zb0Ur` browser failure is not relabeled as success.

This completes the common Carousel acceptance and records a fresh combined source check. The register therefore has **35 accepted / 174 open** obligations. The never-opened Person widget-name label was a reproduced presentation defect on that source and is resolved by the subsequent [canonical field-text repair](/architecture/rector-v2/PUBLICATION_REVIEW#person-canonical-tab-labels-2026-10-30). `B-HTML` and `B-STYLE` remain unresolved confinement/preservation decisions, and full structural `C09`/`T15` acceptance remains open. The earlier seven-shape performance checkpoint records its own unresolved latency limits, including a slower large Table public sample; those historical measurements are not results for this final source. Table descriptor reuse has its own bounded measurements. Detailed capability rows and wider browser/platform proof remain separate. Open proof obligations are not a count of known bugs; this result does not establish whole-library functional parity.

## Person canonical tab labels 2026-10-30

The previously reproduced never-opened Person widget-name label defect is fixed in the isolated implementation/test source `d673b9d04d9aad7d1687b356f7a726455b6fd99e`, tree `97b0748553c19307f84a2dae3782fbe427318643`, based on `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef`. The [tracked checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/person-field-text/README.md) retains the original RED/GREEN manifests, exact tracked patches, the then-untracked generic fixture and complete compressed logs. The earlier common Person and sibling-field proofs retain their own original scopes and outcomes. The change is included in the [later published assembly](https://github.com/Shelamkoff/editor/commit/37ed30083ee97629eecf284944f99b7b330d65ad), which also contains other Gallery/core repairs; this isolated result does not assert tree equivalence or combined acceptance for that assembly.

Specification §16.8 defines one block query, `context.getFieldText(fieldKey)`, and optional pure `InlinePluginDefinition.toText(data)`. The query reads a canonical schema field, including the prospective record during projection, and uses the common reference/literal parser. Its decoded payload is owned and deeply frozen; receiver, synchronous completion and scope/root ownership are checked. It does not mount hidden widgets or request provider data. Successful use enables the existing `update` path for sidecar-only changes; an update-absent consumer uses the existing replacement path. The active Person tab continues to use actual field completion through `afterProjection`.

The original `run-xQuiuf` is a genuine RED: 160 existing projection cases passed and the new assertion failed with `Alpha {{mention}} {{swatch}} tail` instead of `Alpha @Ada #123456 tail`. Opening the real field was a passing positive control, with no author/history change and no prior hidden widget/provider acquisition. Final `run-QMUd5Z` completed at `2026-10-30T03:44:02.230Z`: **306/306 related unit tests, 190/190 projection cases, 20/20 native Person cases, both source typecheck projects and 7/7 generated declaration contracts passed**. All five gates report unchanged source. Browser evidence uses Chrome `156.0.8078.47` on Linux; the verified source is the base plus the exact tracked patch and hashed then-untracked file, not an asserted clean pre-commit checkout.

Controls cover configured Mention triggers, Color, a third-party text capability, literal/unknown tokens, one-pass entities, hidden sidecar Undo/Redo, both modes, exact active Text/range/widget retention and pending native URL input. Generic checks cover pre-commit delivery, optional-update replacement, payload immutability, malformed keys, nested writes/control/tasks, reentry, stale/adopted roots and initial/read/canonical/mode failures including falsy values and callable thenables. The native sidecar control runs during a real `beforeinput` event and retains the input, icon, continued text and exact history sequence.

This closes that known presentation defect without changing the preservation accepted-count or accepting any detailed Person row. Full combined validation of later assembled sources, wider browser/platform coverage, structural performance and whole-library parity retain their separate proof requirements.

## Gallery caption order parity 2026-10-30

**Accepted scenario: `BLOCK_GALLERY_CAPTION_ORDER`.** This is a separate detailed-action proof, not an inference from the common 65-case ROUNDTRIP corpus. The executed runtime is `ff828ef5a6db070172f56a6c4a92ba68b2740c4f`, based on `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef`; the unchanged executed fixture, runner and recognizer are committed in `f795edf098fe733146e2cf34de77977bdcb01819`. The [durable checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/gallery-caption-order-evidence/README.md) contains compressed original raw runs, native logs, source reconstruction patches, exploratory fixture/runner bytes and both compressed/decoded SHA-256 hashes. Earlier failed runs retain their original results.

The published [runtime fix](https://github.com/Shelamkoff/editor/commit/836fed7db5af30240b8156f811cb2a10b4fa0511) and [proof](https://github.com/Shelamkoff/editor/commit/24c012015542e0f955164a47d52fa4c4c7db75ae) are integration counterparts with their own trees; the source hashes above identify the isolated executed trees.

Six cases combine literal, supported rich and real Mention/Color captions with either native image drag/swap or native removal. Three fixed image IDs and distinct local PNGs sit between unchanged Paragraphs. Trusted input appends `X` to the middle caption; the action swaps the outer images or removes the edited middle image. Two separate native Undo operations restore first the structure and then the caption; two Redo operations replay them independently. The Remove case prunes the Color sidecar and Undo restores its exact identity and payload. Canonical records, live marks, URL/ID/caption order, widget ownership by image, alternative text, both neighbors, history flags, caller input immutability and zero provider calls are fixed expectations. No fixture focus repair occurs between the structural action and the history shortcuts.

The original literal comparison exposed a genuine candidate regression: v1 completed the native drag and keyboard replay, while the candidate focused a caption that the swap immediately retired. The focus moved outside the editor, preventing subsequent keyboard Undo/Redo. `ff828ef5` focuses the retained Gallery wrapper before projection. The dedicated regression first failed in a full affected page with **240/241 passing**, then passed alone; the same full page subsequently passed **241/241**. After the detailed cases were registered, their focused standard CDP run passed **6/6**. These are separate actual results, not a claimed combined 247-case run. Gallery unit tests passed **16/16**.

| Final differential source | Cases | Observations | Raw differences | Unexpected differences/errors |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8` | 6 | 336 | 123 | 0 |
| Specification baseline `e981ff3` | 6 | 378 | 101 | 0 |
| Candidate `ff828ef5` | 6 | 378 | 0 | 0 |

All planned phases have recorded observations; historical failed operations retain their failures. The final command exited zero on unchanged, Git-verified source in Node `v24.22.1` and Chromium `156.0.8078.47`; 125/117/117 loaded source/style files and 14 dependency files are recorded. The candidate has no exceptions. The recognizer requires the exact reference source, complete phases, independently modeled records/history, native trust, body focus for failed shortcut delivery, and actual/expected failure vectors. Four baseline widget errors are paired exactly between window and Playwright, including case, phase, message and immutable stack. Offline controls accept 224 historical observations and four paired errors, and reject **3808 observation mutations and 11 error mutations**.

v1's literal rich-caption rendering and absent persistent caption sidecars are explicit reference capability limits. Its loss of keyboard history after removing the edited caption is a historical defect. The baseline's swap focus loss, stale/encoded alternative text and widget-remount exceptions are historical defects. An exploratory `<u>` input was an oracle mistake: that tag is outside the shared allowlist. Its original failed raw remains archived; the final fixture uses supported `<code>` formatting, without changing sanitation or granting a candidate exception.

Acceptance is bounded to these native caption, swap/removal and replay actions on the recorded three-image fixtures. It does not claim the step buttons, final-item/overflow variants, additional caret/range boundaries, a fresh mode/renderer matrix, other browsers, upload/source delivery, layouts or viewer controls. Those unexecuted variants are not reported as passes; the distinct `SOURCES`, `LAYOUT` and `APPEARANCE_VIEWER` rows remain open. No timing or whole browser-suite result is inferred from this slice. The register retains **209 unique scenario IDs: 36 accepted / 173 open** within their recorded scopes; Person and whole-batch acceptance are unchanged here.


## Person, Gallery, CSS and canonical reads continuation 2026-10-30

The [fresh combined checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/next-integration) records **all eight gates PASS** in `run-sWvJG9` on unchanged local `b2d9e46fc1a856aadb4aff072425fb09a7aff721`, published exact-tree counterpart [`9925c805`](https://github.com/Shelamkoff/editor/commit/9925c80584e17214013791a4e8ed1791c7e02080), tree `ab58ba3cc14e05982a365f83e5a6f0305c086058`. The whole run includes **2,031/2,031 unit tests**, both typechecks, build, seven declaration contracts, installed-package consumers, **38 ordinary pages and 41 native groups / 2,256 passing cases**, and the complete heap/resource gate. The integrated native plugin page passes **248/248** cases and native core behavior **67/67**.

The common three-source corpus remains **65 cases across 21 types / 11,434 candidate observations**. The detailed Gallery corpus adds **six cases / 378 candidate observations**; neither candidate has a historical exception, incomplete case or unexpected error. This validates the newly combined Gallery keyboard-history repair, the never-opened Person label contract and CSS grammar repair together. Scoped Gallery caption-order acceptance brings the register to **36 accepted / 173 open**, with all **209 IDs** retained. Other detailed Person/Gallery/Carousel rows remain separate obligations.

The separate quiet-window Table 20×20 experiment confirms two fewer payload traversals in public/native edit paths. It does not establish stable latency improvement: public synchronous p50/p95 changes **64.6/81.7 → 65.3/93.0 ms**, native **74.4/100.3 → 73.5/88.7 ms**, with only **9/21** and **10/21** faster pairs. Sampled edit-sequence allocations fall by 9.6%/5.1%, while the empty-no-op sample rises by 17.1%; these are not exact per-edit or RAM measurements. Full C09/T15, B-HTML/B-STYLE and wider platform/detailed capability acceptance stay open. The new documentation and evidence do not change production behavior; their validation is recorded separately.


## Checklist empty exit parity 2026-10-30

**Accepted scenario: `BLOCK_CHECKLIST_EMPTY_EXIT`.** The [checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/checklist-empty-exit) records eight native cases on unchanged `ebf128b1` production. The test commit `d70b318420afd105d311912110dd1caa44444d2c` has the published exact-tree counterpart [`47a0c1f5`](https://github.com/Shelamkoff/editor/commit/47a0c1f5af0d978731435a4a5f92718c99d70437), tree `7c5f943c49d979d05c6c5105ad78b2a72c47b77d`. No production repair was needed for this row.

Six cases cover an empty, BR-only or formatting-only sole/last item. Two positive controls require visible formatting and real Mention/Color content to split into another Checklist item. A preceding native text edit, rich checked surviving items and neighboring Paragraphs exercise separate structure/input history. Tests use native Enter and two keyboard Undo/Redo steps without repairing focus between history commands. Fixed records, sidecars, identities, focus/caret, caller immutability and provider silence are checked.

| Source | Cases | Observations | Raw historical differences | Unexpected differences |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8` | 8 | 217 | 5 | 0 |
| Specification baseline `e981ff3` | 8 | 222 | 35 | 0 |
| Candidate `d70b3184` | 8 | 222 | 0 | 0 |

Every source completes every planned phase with zero page/server errors, verified loaded Git bytes and unchanged source. Chromium is `156.0.8078.47`, Node `24.22.1`, Linux x64. The separate native gate `run-X2E06e` passes 8/8 and records the exact added test bytes. The raw three-source command exits **1** because it preserves the historical failures; it is not presented as an all-source green gate.

The five v1 differences are incorrect caret restoration after trailing-empty Undo and visible-item split Redo; canonical records and both keyboard history steps still pass. The baseline does not perform the three trailing-empty exits and cannot split the widget-only control. Its 35 consequent mismatches remain raw failures. The offline review independently builds fixed author input, verifies case metadata and recomputes every observation verdict. Exact historical values are recognized separately; eight mutation controls are rejected and the candidate receives no exemption. The initial review weaknesses and their corrections are retained in the checkpoint history.

Acceptance is bounded to these eight Chromium cases. Separate Checklist CRUD/merge/export rows, arbitrary cross-item selection, other engines, IME and read-only composition are not accepted by this proof. The register retains all **209 IDs**, now **37 accepted / 172 open**; earlier dated counts remain historical.


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


## Fourth continuation: compound fields, Link and Gallery — 2026-10-30

The frozen implementation source for this continuation is `6f5f4ff5205a25adfd00cef6d5b2279c068db633`, tree `cb4e9b2dd903177c946e93de97a95e5d41d9ec6a`. The scoped comparisons below ran on that unchanged source in Chrome `156.0.8078.79`, Node `v24.22.1`, Linux. They are separate from the final combined gate table.

### Live rich fields and Toggle focus

Eight blocks now preserve unchanged canonical rich fields during sibling or presentation updates: List, Checklist, Toggle, Spoiler, Quote, Warning, Image and Embed. Comparing hydrated markup with stored widget tokens, or consulting a stale captured caption, previously replaced live author DOM. Saved strings could remain correct while Text nodes, widget ownership, caret or backward selection were lost. The repair uses the existing `update(next, previousCanonical)` argument: native input can commit canonical data without invoking the instance update hook, so a captured earlier record is insufficient. Actual field changes still use existing sanitation and inline ownership.

Native regressions cover real Mention/Color occurrences, retained Text/widget identity, directed selections, continued typing and separate keyboard Undo/Redo actions. Image and Embed also have controls for native input before a read-only round trip. These tests use fixed author records, verify caller-input immutability and require provider silence. The corresponding checkpoints retain the original RED/GREEN results and their actual source identities.

A keyed focus request for closed Toggle content now reveals its live field and lets the existing logical-focus path complete. That presentation change preserves canonical `open: false` and creates no history action. Unrelated updates and replay retain the temporary disclosure; an actual canonical open-state change remains authoritative. Invalid field keys and read-only requests cannot disclose the body.

### Link ownership and Gallery output

Link detection, Apply and Unlink share author-content boundaries. Native controls, locked descendants and nested editing hosts retain their markup and nodes. Authored line breaks and complete inline widgets participate in unlinking; a widget's outer authored link can be removed while its own DOM remains live. Partial selections retain established whole-link unlink behavior. Cross-block text traversal discovers author fields without entering nested hosts.

The committed Link regression fixture contains **12 direct real-DOM cases and three native editor cases**. The native cases cover cross-block Apply/Unlink and a real atomic occurrence, with selection and history controls. The separate historical runner executes **13 direct public-tool cases**; its observations do not establish native historical caret or keyboard-history parity.

Gallery image notifications now belong to the existing output resource lifetime. Settlement, disposal and replacement retire listeners; queued cached-image work checks its live owner before reading geometry or changing layout. Viewer captions and image alternatives share resolved plain caption text with the grid, including overflow images and the iframe viewer. Caption resolution completes before Gallery resources are acquired, preserves input records and renders the resolved label as text. Lifecycle notifications in the controlled fixture are not claimed as trusted browser input.

### Scoped comparison and reconstruction

| Comparison on the frozen candidate | Executed candidate result | Historical limits retained in raw evidence |
| --- | --- | --- |
| Link | 13 cases, **113/113 observations** | v1: 33 failures; specification baseline: 27; direct calls only |
| Gallery viewer | **26/26 observations**, 13 per realm | v1 main: 3 failures; iframe: 1 failure and **12 unexecuted observations**; baseline: 4 failures per realm |
| Toggle/Checklist rich-field controls | 2 cases, **120/120 observations** | v1: 2 failures; baseline: 16; bounded disclosure/checked-state actions |

The references remain v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`, using shared installed dependencies. Unsupported v1 rich Gallery captions and incomplete iframe work remain explicit. All three raw commands exit **1** for historical failures/incompleteness; the candidate has no exception, failure or incomplete phase. Independent audit matched all **765** observation statuses to actual/expected values, **623** production-module hash records and **70** dependency-file hashes. Page/server/runtime errors were absent.

Seven deterministic gzip, binary-capable patches reconstruct isolated validation sources from `355577fce341e77bead7d69705744db724f1b79f`. Each passed independent temporary-index application and exact original-tree comparison. Their manifest records compressed/decoded hashes and integration mappings without asserting equality of full integration trees or recreating original commit metadata.

The preservation register remains **209 unique IDs: 37 accepted / 172 open**. No additional complete row is accepted here. Wider platform coverage, detailed action matrices, `B-HTML`, `B-STYLE`, structural `C09`/`T15` and whole-library parity retain their separate proof obligations.

### Completed combined verification

The [fourth integration checkpoint](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/fourth-integration) retains the complete `run-Jd9HAT` manifest and raw logs. **All 12 gates pass on unchanged `6f5f4ff5205a25adfd00cef6d5b2279c068db633`**, tree `cb4e9b2dd903177c946e93de97a95e5d41d9ec6a`; completion: `2026-10-30T15:32:34.280Z`. This records a local checked source. Remote publication was blocked by automatic approval review; this record asserts no published counterpart.

| Combined check | Recorded result |
| --- | --- |
| Unit tests | 2,031/2,031; zero failures, cancellations or skips |
| Checked JavaScript | Both source configurations pass |
| Build and external declarations | 285 declarations, zero source diagnostics; 7 declaration contracts pass |
| Installed package | Bundler, NodeNext, Vite and browser consumers pass; 22 CSS assets verified |
| Documentation contracts | README, source, localization and documentation audits pass |
| Ordinary browser pages | 38 pages pass |
| Native result matrix | 41 array groups / 2,339 cases pass; plugin parity 316, tools 107, core behavior 67 |
| Disposal and history eviction | 23 sentinels, 0 retained; all three eviction phases and live Undo control pass |
| Common differential corpus | 65 cases across 21 block types / 11,446 candidate observations; zero candidate failures or incomplete cases |
| Gallery caption/order differential | 6 cases / 378 candidate observations; zero candidate failures or incomplete cases |
| Documentation site | Build and both static/browser smoke checks pass |
| Source identity | All 12 gates and the complete run retain unchanged source |

The common corpus has 12 more candidate observations than the third integration: four existing retired-caption checks now execute in each of the three populated Embed cases after Undo. All pass; the fixture and runner hashes, 65 case IDs and completed phases are unchanged. The earlier 11,434 total remains a result for its own source.

The final native aggregate is counted once, including its initial JSON groups; overlapping scoped results are not added. Three newer raw comparisons remain separate from the twelve passing gates and retain their historical exit code 1. No new performance measurement or broader platform acceptance is inferred. The interrupted earlier run `run-NKp1Lt` remains interrupted: six gates completed, the browser gate was stopped for Link review, and later gates were not run. Subsequent evidence/report edits and their documentation validation have separate source identities in the checkpoint.

## Table settings and public focus acceptance 2026-10-30

**Accepted scenarios:** `BLOCK_TABLE_ROWS_COLUMNS`, `BLOCK_TABLE_HEADINGS`, `FOCUS_VALUES_OFFSET_1`–`FOCUS_VALUES_OFFSET_6`, and `DEFECT_FIRST_FOCUS`. The frozen implementation is `a7dc4172198dea9c641f5de41d4331e5a94a17b4`. Its [combined validation](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/fifth-integration) records 11 original gates PASS: 2,031 unit tests, 38 ordinary pages, 41 native result groups / 2,370 cases, package/declarations, both established differential corpora and resource controls. The documentation command exits 0 with successful build and smoke checks, but its gate fails on exactly three generated untracked assets; the original manifest remains `failed` with `sourceUnchanged: false`. A one-line `.gitignore` correction is the only tracked difference, and the separate `run-0ehV77` run passes all three documentation gates on its own unchanged source `369cf74e`. These nine additions bring the unchanged 209-row register to **46 accepted / 163 open**; those are verification obligations, not a defect count or a completion percentage.

The fresh comparisons execute the pinned v1 source `5e5c7f8d`, specification baseline `e981ff30`, and the frozen implementation. All cases complete without page or server errors. Historical failures retain their raw verdicts. As the user explicitly clarified, improved current behavior is preserved; parity does not require restoring earlier defects.

### Table settings

The [Table evidence](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/table-settings) covers **14 cases / 1,346 candidate observations**, all passing. Every existing row/column action and the heading toggle run on a populated 2×2 table both with and without headings. Separate cases cover the disabled deletion controls on a headed 1×1 table and removal of a row/column containing additional Mention/Color occurrences.

Real native input precedes the setting action. The checks preserve text, marks, sidecars, surviving IDs and order; added IDs are nonempty and unique. Editor and renderer output agree on cells, TH/TD and THEAD/TBODY structure. Each setting is exactly one action separate from the preceding input; keyboard Undo/Redo restores the original, typed and final records, including deleted widget payloads and generated IDs. Disabled minimum-size actions create no history. Retained menu controls cannot author after retirement.

The specification baseline also passes 1,346 observations. v1 completes 1,210 observations with 38 historical focus/caret failures; its data, formatting, structure, rendering and positive history checks pass. Current focus and disabled-control improvements remain intact. The fixture explicitly refocuses the first field before the history sequence: it proves action count and input-caret replay, **not an exact caret position immediately after the settings menu**. The minimum-size native controls use headings; their availability depends on dimensions, not the heading flag, in the reviewed implementation.

### Public focus coordinates

The [focus evidence](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/public-focus) completes **7 cases / 147 candidate observations**, all passing. On the already-focused five-character `Alpha` field, requests resolve as follows:

| Requested offset | Resulting logical offset |
| --- | ---: |
| `2` | 2 |
| `2.9` | 2 |
| `-2` | 0 |
| `1000` | 5 |
| `'start'` | 0 |
| `'end'` | 5 |

Each request returns `true`, preserves canonical/caller data and creates no history. The first request to another block's `text` field returns `true` at offset 2; the current-block event observes that completed position. Native insertion and one keyboard Undo/Redo preserve the exact records and caret.

The specification baseline has eight raw differences in `DEFECT_FIRST_FOCUS`: the first request returns `false`, publishes offset 0 and consequently inserts/replays at the wrong position. v1 has no keyed/numeric focus API or boolean acknowledgment. Those seven v1 capabilities remain explicitly **unsupported**; the adapter does not invent them. Its separate public `block.focus()` plus native navigation control completes 20 observations with one historical Undo-caret failure.

Independent review recomputed all **4,216** raw verdicts across the Table and focus comparisons, including the historical failures. It additionally reconstructed 282 Table phase states from fixed author data and checked all 314 focus expectations independently. The corresponding source-module and dependency hashes match their recorded sources.

Acceptance is limited to these nine rows in Chrome 156 on Linux. Other Table operations, hidden/compound-field focus, IME and wider browser/platform coverage retain separate obligations. The Code and formatting-host repairs add bounded regression evidence without accepting their complete detailed rows. `B-HTML`, `B-STYLE`, complete structural `C09`/`T15` and whole-library parity remain open.

The runtime published counterpart is [`0fbe8c78`](https://github.com/Shelamkoff/editor/commit/0fbe8c78d3dcc14d8a619cc152f08d6343cb3952), with the identical full tree `500d124440261953986dac14afa51d444f35ac5c`. The later ignore-only repair is published separately as [`ae79a89c`](https://github.com/Shelamkoff/editor/commit/ae79a89c66c9b4b467e149dcaf45db2c99b0f617), matching its tested tree `dccd6e5ca1d77ea087c1ec5ac5dc1589b6240c22`. Both original and repair validation retain their own sources and outcomes in the checkpoint; final report-content validation is recorded separately.

## Heading, List, Columns, Raw and tool action acceptance 2026-10-30

**Eight additional scenarios are accepted:** `BLOCK_HEADING_LEVELS`, `BLOCK_LIST_STYLES`, `BLOCK_COLUMNS_LAYOUTS`, `BLOCK_COLUMNS_NO_LOSS_REDUCE`, `BLOCK_RAW_SOURCE`, `BLOCK_RAW_PREVIEW`, `TOOL_CASETRANSFORM_ACTION` and `TOOL_CLEARFORMATTING_ACTION`. The register retains **209 unique IDs: 54 accepted / 155 open**. These counts describe proof obligations, not known defects or a completion percentage.

This sixth continuation adds tests and retained evidence. Production remains identical to `69c8425e` and to the runtime previously validated on `a7dc4172` (published as `0fbe8c78`). No new runtime repair or fresh full-suite PASS is claimed. The four fixed corpora use Chrome `156.0.8078.79`, Node `v24.22.1`, Linux x64 and pinned Git sources with recorded loaded-module/dependency hashes. v1 is `5e5c7f8d`; the specification baseline is `e981ff30`.

| Scope and frozen candidate source | Candidate: complete cases / observations / FAIL | v1: complete cases / observations / FAIL | Spec baseline: complete cases / observations / FAIL |
| --- | --- | --- | --- |
| [Heading/List](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/text-block-settings), `d483be745b0bc00f40a89b823a12f993f1ae21f8` | 21 / 2,323 / 0 | 17 / 1,691 / 29; four toolbox variants unsupported | 21 / 2,323 / 185; ten page errors |
| [Columns](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/columns-layouts), `b7ac66388e44999d794368cd00a99b4057d41083` | 12 / 2,880 / 0 | 6 / 1,253 / 30; six settings-menu cases unsupported | 12 / 2,880 / 0 |
| [Raw](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/raw-source-preview), `90b28965d2ea7735c44f5f1483a334f8a565fda3` | 21 / 1,421 / 0 | 21 / 1,260 / 226 | 21 / 1,421 / 30 |
| [Tool actions](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/tool-actions), `9cb70473c9793623632e1018144e490ca2cc73d7` | 48 / 2,072 / 0 | 44 / 1,786 / 278; four atomic-only cases unavailable/incomplete | 48 / 2,072 / 258 |

All candidate cases complete with no failed observations or page/server errors. Columns, Raw and tool comparisons retain observed process exit **1** because historical failures remain raw failures. The final Heading/List JSON is complete, with `completedAt` and `candidatePass: true`, but the interrupted shell wait did not retain its actual process exit. The runner's policy implies exit 1; the observed shell exit remains **unknown**. A completed phase list does not erase the ten specification-baseline Heading page errors: widget reprojection rejects the level action, and later content/history failures can be consequences of that event. Failed observation counts are not counts of independent bugs.

### What the eight rows establish

Heading tests H2–H6 through settings and inline controls, and all five current toolbox variants. It preserves rich text, Mention/Color records, the intended editor/renderer tag, selected inline range and separate native input/action history. List tests both starting and target styles, including same-style no-ops, while retaining item text, order and IDs. Retained controls are tested with a different setting that would change the document. v1 genuinely executes the H2 toolbox action; its four absent higher-level variants are not synthesized. Its 29 failures include caret/direction defects and ten retained-control observations. General exact post-settings-menu caret placement is outside this proof.

Columns exercises all four layouts through direct controls and the v2 settings menu. Three rich fields reduce to two by appending the removed content to the second field with a BR; expansion adds an empty third field. Literal-empty removed/receiving fields check when no BR is needed. Fixed marks, six real widget records, surviving/new IDs, editor/renderer width ratios and each independent native Undo/Redo are verified. The retired menu negative runs after returning to editable mode with an opposite layout. v1's six absent menu cases remain unsupported; its 30 direct-control failures concern host/widget rebuilding, focus and input-caret replay. General field editing/conversion and exact post-menu caret placement remain separate.

Raw covers twelve native indentation cases and nine preview/mode cases. Literal source, selected-line boundaries, forward/backward ranges, tabs/spaces, no-op behavior and separate subsequent input survive keyboard replay. Pointer and keyboard preview controls, automatic read-only preview and return to the usable source field preserve data and source range without authoring history. The baseline's 30 failures are confined to mixed-prefix Shift+Tab; v1's indentation, direction and focus defects remain visible. No B-HTML/B-STYLE policy is changed.

The two tools cover mixed partial marks, Text/Element endpoints in both directions, one field, separate blocks and Quote text/caption. CaseTransform covers both case directions and Unicode width/context changes; ClearFormatting retains links, BR, unselected content and actual Color widgets. Canonical and live DOM oracles agree throughout Apply/history. A preceding native edit, no-ops preserving an existing Redo branch, read-only controls and destroyed buttons beside a valid editable successor prove one action and retirement. v1's four atomic-only actions are unavailable; its absent v2 transaction-observation API is also explicitly unsupported.

Independent review checked the source/oracle limits and retained raw outcomes. Earlier test-preparation errors remain archived as such, including mutable observation arrays fixed before the final tool-source freeze. The current implementations receive no historical exception. Improved current behavior is retained rather than replaced with old defects.

### Focused verification after integration

[Run `run-OXtLxQ`](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/sixth-integration) completes all six gates on unchanged `24cc569c2fdcb3f115417ae895a01084858cdf67`, tree `a3a77a3670e6b17f8000b4cd95720eec1a7edc2a`, with `sourceUnchanged: true`. Its fetched published counterpart [`0cceb84e`](https://github.com/Shelamkoff/editor/commit/0cceb84eceeb6299f2338ac4798ff40e9aa36ec8) has the identical tree; this source mapping is not a second execution. Both source typecheck configurations pass. The five native selections pass **208/208 cases**: Heading/List 21, the Columns filter 23, tool actions 48, the complete source-indentation page 54 and the complete source-modes page 62. The latter two pages include neighboring Code cases; their entire totals are not attributed to Raw. These are the actual merged-run counts, distinct from the earlier isolated filters. No full native, unit, ordinary-browser or heap matrix was rerun for this tests/evidence-only integration; the earlier complete runtime checks retain their own source and outcome.

The accepted scope is limited to these eight rows and the recorded Chrome environment. `BLOCK_HEADING_RICH_PASTE`, `BLOCK_HEADING_SPLIT_CONVERT`, `BLOCK_LIST_ITEM_EDIT`, `BLOCK_LIST_PARTIAL_CONVERT`, `BLOCK_COLUMNS_FIELDS`, `BLOCK_RAW_NAVIGATION`, `BLOCK_RAW_PRESENTATION`, other tool actions, B-HTML/B-STYLE, complete structural C09/T15, other platforms and whole-library parity remain open.

### Comparison reporting repair

The [runner correction](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/runner-reporting) fixes false-success exits for empty Columns and Heading/List filters. Raw now retains a structured failed JSON result for its already-failing empty filter. All four new runners reject missing candidate evidence, unsupported current capability, missing or reordered phases, empty observations and reported environment errors. The isolated source `67bb364d` passes 62 deterministic reporting controls; actual empty-filter CLI checks exit 1 with `candidatePass: false`, while four positive controls retain successful candidate results and historical exit 1. These are evidence-reporting checks, separate from product browser coverage. Production, browser fixtures and historical verdicts are unchanged.

## Code, Table keyboard, Person and basic mark acceptance 2026-10-30

**Eight additional scenarios are accepted:** `BLOCK_CODE_SOURCE`, `BLOCK_CODE_LANGUAGE`, `BLOCK_TABLE_KEYBOARD`, `BLOCK_PERSON_HIDDEN_FOCUS`, `BLOCK_PERSON_READONLY_TABS`, `TOOL_BOLD_ACTION`, `TOOL_ITALIC_ACTION` and `TOOL_STRIKETHROUGH_ACTION`. All **209 unique IDs** remain: **62 accepted / 147 open**. These numbers count evidence obligations, not known defects or a completion percentage.

This continuation fixes a reproduced shared-input defect and adds four bounded comparative corpora. The current sources complete **165 cases and 15,488 observations without failures**. They use Chrome `156.0.8078.79`, Node `v24.22.1`, Linux x64, immutable source modules and recorded dependency hashes. v1 is `5e5c7f8d`; the specification baseline is `e981ff30`. The Table comparison also executes the immediately preceding implementation using the same final fixture.

| Scope and original tested source | Current cases / observations / failures | v1 observations / failures | Specification observations / failures |
| --- | --- | --- | --- |
| [Code source/language](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/code-source-language), `e6842abf` | 20 / 2,062 / 0 | 1,894 / 178 | 2,062 / 232 |
| [Basic mark tools](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/basic-mark-tools), `0b8541da` | 96 / 4,494 / 0 | 3,951 / 408; six unavailable/incomplete atomic actions | 4,494 / 504 |
| [Person focus/modes](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/person-modes), `fde41c70` | 28 / 5,497 / 0 | 791 / 193; four executed cases and 24 explicitly unsupported capabilities | 5,041 / 901; two incomplete cases and 17 page-error events |
| [Table keyboard](https://github.com/Shelamkoff/editor/tree/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-10-30/table-keyboard), `3a16cf9f` | 21 / 3,435 / 0 | 2,738 / 159; 19 executed cases and two unsupported focus controls | 3,435 / 216 |

Every recorded final comparison exits **1** with a separately successful current result. Historical failed observations, unavailable actions and incomplete phases remain unchanged. The 17 Person baseline page events also appear in its per-case error and diagnostic channels; those are corresponding records, not 51 distinct defects. All current cases complete without page/server errors; the fixtures that collect diagnostics report none. Code does not collect a console-message or diagnostic-callback channel and does not claim their absence. Failure counts are repeated observations across fixed cases, not independently diagnosed bug totals.

### Authored line-break formatting repair

The same final Table fixture records **12 failed observations on `01fb551a` and zero on `3a16cf9f`**. In two headed/body cases the caret starts inside the end of `<b>Alpha</b>`, before a plain suffix and real widgets. Enter creates the correct BR inside the bold wrapper, but restoring the collapsed logical position with the ordinary start bias puts the caret at the following plain text. Subsequent native typing loses bold. Paragraph Shift+Enter reproduces the same shared defect.

`LogicalSelection` now resolves a collapsed boundary immediately after an authored BR to that BR's owning wrapper; ordinary boundaries and noncollapsed forward/backward ranges keep their existing resolution. Correcting this point alone is insufficient in the recorded Chrome runtime, which can still move typing into the next visual text run. `NativeInputController` therefore handles only trusted, cancelable, noncomposing `beforeinput` with nonempty `insertText` at that live collapsed authored boundary. It confirms the current mounted rich-field owner and active range, inserts into that boundary, and uses the existing native commit/history/selection path. It adds no state, transaction or selection owner.

Projection padding is excluded on both sides: an existing padded terminal break keeps native input and its trusted input event. Plain-text/native controls, clipboard, composition, ordinary text boundaries, foreign/locked/nested/retired hosts and noncollapsed ranges retain their prior paths. New controls check nested marks, a plain BR before marked text, unchanged ordinary mark boundaries, exact Undo/Redo and fresh typing after Redo. The final **30 native cases** comprise 21 Table cases plus nine shared-boundary cases; the earlier terminal Table regression passes separately. All **24 focused guard unit tests** and both typecheck configurations pass on the frozen source. Failed end-bias-only experiments and incorrectly strict preparation oracles remain archived, without being described as successful fixes or extra product defects.

### What the other seven rows establish

Code uses twelve native source-editing cases and eight language-control cases. The independent author oracle covers literal HTML-like source and entities, four-space indentation, selected line boundaries, empty/final lines, backward direction and exact source selection through history. Filtering and changing a language remain separate from preceding source input; known/Auto highlighting and unknown/plain fallback preserve inert readable source. No-op, read-only and destroyed controls are tested with a meaningful opposite choice. The source is deliberately refocused before keyboard history, so historical post-menu focus is not imposed on the current UI.

Each of Bold, Italic and Strikethrough has 32 complete cases. The shared TOOL template includes applying and removing mixed/nested marks with partial Text and full Element endpoints, both directions, one field, different blocks and Quote's two fields. Actual Color/Mention data, visible contents, children and identity survive each action. A preceding native edit remains a separate action; atomic no-ops preserve an existing Redo branch. Retired controls are tested beside an editable successor. Mention's internal editing-mode attribute is not equated across versions; every root attribute must still remain unchanged within the actual tool action. The historical Color-dot losses remain failures.

Person tests first-request hidden focus for name, role, biography and URL, literal/widget fields, numeric/end URL positions and offsets after widgets. Actual range replacement and two independent input histories preserve complete three-profile records and caret direction. Reader tabs remain usable by pointer and keyboard while author inputs are disabled. Returning from read-only preserves the selected third profile; subsequent input and replay follow that profile. Retired author controls remain inert after editing resumes. Missing legacy keyed/numeric focus, persistent rich widgets and keyboard-tab capabilities are explicitly unsupported; real legacy public focus/native navigation and pointer tabs execute separately.

Independent reviews are retained under the corresponding `peer-review/` directories. They check the actual fixed oracles, lifecycle controls, raw verdicts and source identity, with separately authored literal models for the named capabilities. Initial test-preparation failures remain labelled as such. Original raw commit bytes and binary patches reconstruct the tested sources even when publication changes commit metadata. Tree-equivalent publication is not a second test execution.

The full merged regression matrix is recorded separately on its exact execution source; the bounded comparisons above do not substitute for that matrix. Later documentation/evidence-only commits retain their own validation scope. Other detailed Code/Table/Person/tool capabilities, `B-HTML`, `B-STYLE`, complete structural `C09`/`T15`, other browsers/platforms and whole-library parity remain open. Improved current behavior is retained.
