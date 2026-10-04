# Rector v2 implementation recheck — 2026-10-04

Target branch: `refactor/rector-v2-architecture`.

Normative specification: [RECTOR_V2_REMEDIATION_SPEC.md](RECTOR_V2_REMEDIATION_SPEC.md).

**Later local verification:** [RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md) records the checkout, subsequent fixes and executed gates. The source-only conclusions and unavailable-checkout limitations below describe the earlier inspection; they are not the latest acceptance status. Native Chrome clipboard, heap and browser-engine composition are now verified. User screenshots exposed gaps in the earlier parity matrix; visible mixed selection, margins, toolbar controls and structural keyboard behavior now have native regression cases. Further checks restored click-below-document insertion, Enter exits from List/Checklist and preservation of an existing cross-field range on Shift+Left/Right. The expanded full run passed 138 native cases and all package/documentation gates. S10 is not declared closed; the current report records the evidence boundaries and the unverified physical OS IME session.

This recheck records the implemented source state. It does **not** claim green CI: GitHub Actions has no workflow/status result for the inspected branch SHA, and the current execution environment cannot resolve `github.com` for a local checkout, so the project command matrix could not be executed here.

## S1 — current-only document format

Implemented.

- One explicit document wire version (`2.0.0`) and required block/inline `dataVersion`.
- Exact-version schema decode for registered types; `currentVersion: 1` remains a valid current schema.
- Removed runtime document migrations, preserved-document mode, `legacyVersion`, migration chains and old validation/version-policy configs.
- Unknown current block/inline types remain inert/opaque; known version mismatches reject.
- Editor, renderer and async preset ingestion use the same current boundary.
- Poll/Carousel/Gallery legacy-shape recovery paths were removed.
- Removed configs are rejected rather than silently ignored.

## S2 — canonical transforms and lossless linked data

Implemented.

- Canonical record assembly/remap/filter behavior is centralized.
- Whole/partial/cross conversion, split, merge and local updates use canonical assembly semantics.
- Inline sidecar references survive supported conversions; targets unable to preserve linked inline data are rejected before mutation.
- Literal placeholder-shaped text is distinguished from linked references.
- Inline collisions are remapped without payload aliasing.
- Session-issued IDs are not reused within one editor lifetime.
- Browser coverage includes merge collisions, conversion save/reload/renderer and lossy-conversion rejection.

## S3 — transaction/projection commit protocol

Implemented.

- Store and history support prepared commits/cursor transitions.
- Projection protocol is `prepare → apply → recover/finalize/discard`.
- Old owners are finalized only after commit; failed projection can recover without committing model/history.
- Unrecoverable recovery puts the runtime/engine into failed health while committed model data remains readable.
- Initial mount failures restore holder contents and release owned resources.
- Transaction events expose immutable direct data with monotonically increasing committed sequence/revision.
- Undo publishes applied inverse changes in application order; redo publishes forward changes.
- Host mutation authority is distinct from interaction authority in read-only mode.
- Candidate staged plugin contexts read candidate data before model commit.

## S4 — lifetimes, definitions and async persisted work

Implemented.

- Definition/schema/capability descriptors are snapshotted and immutable from the editor's point of view.
- Mounted block/inline occurrences use revocable instance scopes.
- `DataTask` is the persisted async-result authority; stale/replaced/read-only-epoch tasks cannot commit.
- Image, Gallery, Carousel, Attaches, Person avatar, Embed cover/action and LinkPreview persisted async paths use the task authority while retaining their own concurrency policy.
- Browser proof covers same-ID replacement and read-only epochs.
- Extension locale namespaces are registry-owned (`plugin.*`, `inlinePlugin.*`).
- Unused `ScopedI18n`/full-key bypass was removed.

## S5 — ownership, selection and protected formatting

Implemented.

- Keyboard/native-input routing classifies document rich-text/plain-text vs auxiliary native controls/editor chrome.
- Inline tools are bound to the editor selection port and one mutable tool instance cannot be mounted into two live editors.
- Same-block multi-field and cross-block rich-text formatting commits through one protected model synchronization path.
- Stale toolbar selections are revoked by selection-version leases.
- Alignment is model-first and persists only in `tunes.textAlign`.
- First-field guessing and old extra-argument selection-port calls were removed.
- Inline tools no longer import core-private DOM/icon/constants helpers; neutral helpers live under `shared`.

## S6 — capability-driven structural HTML import

Implemented.

- Hardcoded block-type HTML switch was removed from `ClipboardController`.
- Structural HTML import is planned synchronously through `htmlImport.matchesRoot/importRoot`.
- Paragraph, Heading, List, Quote, Code and Table own their structural root interpretation.
- `PasteCapability` accepts only text/file input; structural HTML is a separate contract.
- Entire accepted HTML is planned/validated before document mutation.
- Browser proof covers ordered mixed roots, nested wrappers/text siblings, sanitization, one-step undo and late importer failure without partial mutation.

## S7 — canonical clipboard fragments

Implemented.

- One private MIME: `application/x-rector-fragment`, version `2`.
- Old `application/x-rector-editor` runtime path is absent.
- Current private MIME has priority; invalid/old/future private versions reject without HTML/plain fallback.
- Partial rich-text fragments are model-derived and retain only referenced inline sidecar entries.
- Whole/structured transfer parts omit source block ID and producer revision.
- `clipboard.slice(data, context)` owns composite export and `remaining` together.
- Checklist, Columns, List, Quote, Table, Warning, Toggle and Spoiler provide structured slice semantics.
- Copy/Cut share one prepared slice; Cut checks private MIME write/readback before deletion.
- Target plans carry generation/revision and stale plans reject.
- Browser coverage includes independent-editor private roundtrip, sidecar collision/literal handling, Quote/List/Table structured Cut/Paste and one-step undo.

## S8 — pointer drag session

Implemented.

- Drag uses one scoped pointer session with pointer capture and pointerId ownership.
- Placement is resolved as a gap in order with the source ID removed.
- Pointermove changes preview only; pointerup commits at most one move.
- Revision/generation change, read-only, source replacement/removal and cancellation invalidate stale sessions.
- Gesture-scoped click suppression is bounded.
- Unit and browser coverage exercise gaps, foreign pointer, concurrent reorder, read-only cancellation, one history move and DOM identity.

## S9 — cheap document queries

Implemented.

- Internal metadata query surface: `size`, `has`, `idAt`, `indexOf`, `ids`, `peek`.
- Interaction state, current index/selection, drag and public count/at/index paths use metadata rather than cloning whole document payloads for IDs.
- Public `get/list/save` remain detached snapshots.
- Instrumented 1000-block/large-payload test forbids payload `Map#get` during metadata queries.
- Paragraph/default/full gzip limits remain 40/64/96 KiB. The owner waived the core-size completion gate on 2026-10-04; its 51 KiB reference target remains informational.

## S10 — convergence recheck

Source-level convergence completed.

- Removed source paths are absent: old core DocumentSchema, document migrations, preserved snapshot store and old clipboard runtime.
- Current replacements are present: shared current DocumentSchema/document format, CanonicalTransforms, InstanceScope, HTML import planner and fragment codec.
- External sanitizer no longer accepts/reconstructs serialized widget markers (`data-inline-plugin`, `data-id`, `data-value`, `contenteditable`) as a compatibility decoder. Live host-owned inline projection still serializes owned occurrences to canonical placeholders before rich-text normalization.
- Current plugin graph has no structural-HTML `PasteInput` consumers.
- Inline-tool production files have no private-core DOM/icon/constants imports.
- Root type surface exports transaction/event diagnostics; type consumers exercise `DataTask`, `HtmlImportCapability`, `ClipboardCapability` and typed transaction events.
- Documentation EN/RU heading/fence structures match for modified guides.
- Browser acceptance includes real ru/en inline-plugin labels/no-results, lifecycle/task ownership, structured HTML/clipboard, formatting ownership, drag, events/recovery and security/Trusted Types boundaries.

## Verification limitation

**Historical note:** the limitation below describes the earlier source-only recheck. Local execution subsequently became available. The actual Windows/Chrome runs, fixes, source manifest and remaining evidence limits are recorded in [RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md); plugin-by-plugin behavior is recorded in [RECTOR_V2_PLUGIN_PARITY_2026-10-04.md](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Do not use this older limitation as the current execution status.

The normative command matrix is still required on a machine/CI runner with the repository checkout:

```sh
npm run typecheck
npm test
npm run test:docs
npm run test:types
npm run build
npm run test:package
npm run test:browser
npm run docs:check
node benchmarks/bundle-budget.mjs --enforce
```

For the branch SHA inspected during this recheck, GitHub reported no workflow runs/status checks. Local execution was unavailable because the current environment could not resolve `github.com`. Therefore this document records source-level implementation/convergence only; it deliberately does not mark the command matrix as executed or green.
