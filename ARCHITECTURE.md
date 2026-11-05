# Rector architecture and refactoring

The current implementation target for `refactor/rector-v2-architecture` is [the contract and boundary specification](RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md). Its functional scope is the union of legitimate v1 and current capabilities, not their intersection.

## Authority

1. Explicit preservation and current-only requirements in the current specification.
2. The current specification for the boundaries it changes.
3. [Architecture refinement](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) for unaffected behavior, then [remediation](RECTOR_V2_REMEDIATION_SPEC.md) where unaffected by refinement.
4. Historical audits as evidence only. They are not parallel implementation targets, successful acceptance of the current commit, or permission to revive removed APIs.

The [publication review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md) records source identity, actual commands, cleanup scope and proof limits. The [preservation register](docs/architecture/rector-v2/PRESERVATION.md) records 209/209 accepted obligations after the final source-specific review on 2026-11-05. Earlier dated counts retain their historical scope.

## Readiness

The [fresh full-library recheck](RECTOR_V2_LIBRARY_RECHECK_2026-11-05.md) after `d7a32b63` is complete. It repairs deferred rich inline highlighting, JSON array/object shape capture and file-picker retirement. Production `d8b1c4f2`, frozen verification `125b3e22` and test-only `8c975088` retain all 209 obligations: Node 20/22/24, the complete ordinary/native registries, all 100 comparative corpora and full structural/resource checks. Original failed attempts and complete source-specific follow-ups remain explicit. Earlier acceptance below keeps its recorded source and scope.

The previous [complete audit acceptance](docs/architecture/rector-v2/PUBLICATION_REVIEW.md#complete-audit-acceptance-2026-11-05) closes C01–C12, R01–R20 and all 209 preservation obligations on immutable runtime `e88992ee` in the supported Chromium environment. B-HTML, B-STYLE and the settled field-local B-PRESENTATION proof are complete. Ten frozen integration gates, all 159 native pages, all 100 maintained differential corpora and the separate architecture-to-target comparison pass within their recorded scopes. Subsequent test/CI/documentation changes preserve the same production bytes. Superior current behavior remains; historical failures and unexecuted engines are not relabeled as passes. This is audit acceptance, not a public release receipt.

Do not add a second document store, history engine, selection store, global authority manager, legacy decoder, compatibility shim, or alternate API merely to make a local repair easier. Large modules are split only at a demonstrated responsibility boundary.

## Evidence and generated files

Historical reports and reproduction sources have been preserved. Retained `test-results` evidence is historical; it must never be uploaded as the result of an unexecuted current gate. CI clears its result directory before verification. New generated output belongs to ignored directories or CI artifacts, not to source commits.

The exact pre-publication tree is `e981ff308000c1d92d7e820df95113c1e19bcee8`. Any removed generated log or screenshot remains recoverable from that commit. No branch history is rewritten by the cleanup.
