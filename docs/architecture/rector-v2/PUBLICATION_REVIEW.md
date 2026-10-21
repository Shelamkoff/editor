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
