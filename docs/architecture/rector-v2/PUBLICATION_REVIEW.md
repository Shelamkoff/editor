# Publication review — 2026-10-21

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
