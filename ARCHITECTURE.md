# Rector architecture and refactoring

The current implementation target for `refactor/rector-v2-architecture` is [the contract and boundary specification](RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md). Its functional scope is the union of legitimate v1 and current capabilities, not their intersection.

## Authority

1. Explicit preservation and current-only requirements in the current specification.
2. The current specification for the boundaries it changes.
3. [Architecture refinement](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) for unaffected behavior, then [remediation](RECTOR_V2_REMEDIATION_SPEC.md) where unaffected by refinement.
4. Historical audits as evidence only. They are not parallel implementation targets, successful acceptance of the current commit, or permission to revive removed APIs.

The [publication review](docs/architecture/rector-v2/PUBLICATION_REVIEW.md) records source identity, actual commands, cleanup scope and proof limits. The [preservation register](docs/architecture/rector-v2/PRESERVATION.md) is an open acceptance inventory, not a certificate that the refactor is finished.

## Readiness

Readiness is per contract and slice. `B-HTML`, `B-STYLE`, and `B-PRESENTATION` remain decision gates for their affected changes. Fresh v1/current/candidate differential proof is required for whole-library acceptance. A ready bug-fix slice does not make the whole library accepted.

Do not add a second document store, history engine, selection store, global authority manager, legacy decoder, compatibility shim, or alternate API merely to make a local repair easier. Large modules are split only at a demonstrated responsibility boundary.

## Evidence and generated files

Historical reports and reproduction sources have been preserved. Retained `test-results` evidence is historical; it must never be uploaded as the result of an unexecuted current gate. CI clears its result directory before verification. New generated output belongs to ignored directories or CI artifacts, not to source commits.

The exact pre-publication tree is `e981ff308000c1d92d7e820df95113c1e19bcee8`. Any removed generated log or screenshot remains recoverable from that commit. No branch history is rewritten by the cleanup.
