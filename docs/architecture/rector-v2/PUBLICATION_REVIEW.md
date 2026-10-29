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
