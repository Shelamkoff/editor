# Rector v2 — extensibility specification correction and recheck, 2026-10-15

## Scope and authority

This is a specification correction, not a production fix. The normative target is [RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md); this report records evidence and review conclusions and cannot add target semantics.

The corrected specification starts from origin/refactor/rector-v2-architecture at `0ee1d123afdf03bfc8bad88ea9ef5d4d556bd4b7`. That branch's production source is still based on `98d5233e43e242d618670e2104da95d79f1a559f`. The local working tree also contains the already inspected unpublished projection, Mention and Poll changes. Those production changes have not been modified by this specification task. The remote branch was checked again before editing and still pointed to `0ee1d12`.

The latest remote specification and its existing architecture recheck were materialized locally so their repository-relative references can be reviewed without checking out a different branch or changing the dirty production files. The older recheck is retained unchanged as historical evidence.

## Evidence acquired before correction

[The recorded extensibility audit](test-results/extensibility-2026-10-15/verification.json) includes eight source-browser observations and five packaged-browser observations in Chrome 155.0.8059.40. These are controlled real-DOM contract probes, not claimed native keyboard/clipboard/OS IME acceptance.

- A marker-free third-party inline widget was mounted but counted as five label characters instead of one widget unit. The complete field length was 12 rather than 8; public focus at logical end landed inside the label. Supplying the existing marker as a diagnostic control restored length 8.
- An ordinary block update returning a Promise was accepted before completion. Resolving two updates in reverse order left committed text `Second` and projected text `First`.
- Each of `isActive`, `getIcon` and `getTitle` could run a public update during presentation refresh. A throwing icon callback skipped the next healthy tool.
- A throwing ordinary `onTriggerCancel` interrupted read-only fan-out: public readOnly was true while root mode presentation remained false and the popup stayed mounted.
- A registered inline runtime's retained global `hidePopup` closed another runtime's active popup.
- The existing source audit passed virtual forbidden imports in a block plugin and inline tool. No files were changed by the virtual injection.
- Published generic payload declarations rejected ordinary interfaces in both Bundler and NodeNext while equivalent type aliases worked.

Positive controls showed custom block/inline/tool/renderer registration without editing built-in inventories, protected formatting with one Undo, retained hidden sidecars, model-first field reordering and paired rendering. They establish a usable extension mechanism; they do not clear the defects above.

The preceding audit also passed 44 focused Node tests and the isolated package-consumer gate, including both type resolution modes, Vite build, Node import and 22 CSS assets. Its inspected static/literal import graph had 274 modules, 673 edges, zero cycles, zero forbidden directions and zero unresolved local JS imports. Those results are an existing implementation baseline; they are not successful results of the corrected target.

## Corrections and traceability

| Finding | Owning normative contract | Replacement/proof and execution |
|---|---|---|
| E1: hidden marker requirement | Section 5.5 makes projection identity markers host-owned; private occurrence ownership remains authoritative | Marker-free widget length/focus/formatting and mounting/recovery proof; slice 1 |
| E2: unchecked async projection completion | Section 3.4 defines completion, thenable/accessor rejection, acquisition, recovery and cleanup by hook class | Ordinary block/inline update/read-only, acquisition and cleanup conformance; slice 3 |
| E3: tool presentation effects/failure propagation | Sections 3.3/9.3 capture used metadata/methods and isolate guarded complete values per tool | Reentry, result failure, healthy-tool continuation and stale-action proof; slice 6 |
| E4: terminal cancellation interrupts controls | Section 10.2 retires the exact session first and completes independent control cleanup | Ordinary cancellation/replacement/read-only/destroy and valid interactive commit controls; slice 8, integrated with 4c |
| E5: global popup close authority | Section 7 returns a frozen per-show close handle, privately bound to runtime/show ownership | Remove public hidePopup and migrate Mention/Color; stale/reentrant/denied/cleanup proof; slice 3 |
| E6: incomplete architectural enforcement | Section 3.6 extends the existing parser-based audit across declared owners and import forms | Negative gate fixtures and real dependency/removal checks; owning slices and final slice 9 |
| E7: interface payload friction | Section 3.5 settles object-shaped public payload parameters/defaults and input slots without weakening runtime JSON rules | Complete public consumer, shared/renderer aliases, declaration generation and both resolution modes; slice 3 |

The same corrections are represented in section 11's replacement/consumer map, section 12's acceptance matrix and the owning slices. Slice 4 is divided into 4a (current-view immediate commands), 4b (range/clipboard planning and handles) and 4c (ingress dispatch and task lifetime). Slice 5 consumes 4a–4b; final toolbar integration reconciles the alignment adapter and conversion; slice 8 integrates 4c's shared read-only composition. No new state/transaction/search manager or compatibility layer was added.

## Recheck of material decisions

- The corrected target separates value preparation, projection/lifecycle effects, settled notifications and interactive trigger actions. Terminal observer protection does not prohibit a valid interactive session.commit. Normal user update producers still use the existing nested transaction semantics.
- Projection markers are derived presentation; they neither carry canonical payloads nor grant occurrence authority. External marker stripping remains required. Editable Mention labels remain supported.
- Synchronous completion is checked inside its owning operation. Thenable containment is not described as cancellation of arbitrary later JavaScript. Acquisition/recovery and post-commit/cleanup failures keep distinct outcomes.
- Popup close rights belong to a specific show request. Ownership is retired before cleanup; a stale close cannot affect a successor. Host forced closure remains internal. Newer legitimate reentrant shows follow the existing generation ordering.
- Object-shaped public payloads do not relax JSON/schema validation. Inline ID maps, tunes, locales and other true dictionaries remain dictionaries. Arbitrary-key public snapshots are not mechanically rewritten.
- Independent external conformance uses published entries and an installed package consumer, covers all four extension classes and their applicable capabilities, and is integrated with existing runners. Current built-in parity remains required.
- Architecture checks stay in the existing parser/script and CI path. Static/literal proof does not claim computed-import or runtime authority coverage.

### Payload-type feasibility probe

A complete external TypeScript consumer was compiled against the published entries with an ordinary interface containing text and a nested array. It defines and registers a block and inline plugin, supplies a current document/inline payload, calls host insertion/update and inline insertion, and defines both renderers.

Current published declarations produced **12 diagnostics in Bundler and 12 in NodeNext**. Applying only the proposed declarations through an in-memory compiler host produced **0 diagnostics in each mode**, with strict checking and without skipLibCheck, registration casts, index signatures or any. The initial exploratory probe had fixture-only errors; they were corrected before recording this final result. No production declaration or generated output was patched for this probe.

Two additional controlled browser preservation probes confirmed that synchronous session.commit from both onTriggerQuery and onTriggerKeydown currently succeeds; the key callback also consumes its owned Enter. Those paths therefore remain outside the terminal read-only observer guard. They establish existing behavior to preserve, not successful implementation of the future guard.

This proves feasibility of the specified type boundary on the inspected declarations. It does not replace implementation-time regeneration, built-in source typecheck or the installed-package conformance gate.

## Readiness and remaining implementation

The corrected specification is **implementation-ready** for the described target: the seven findings have explicit owners, target behavior, contract disposition, consumers, failure semantics, proof and execution ordering. Readiness does not mean the runtime defects have been fixed.

No implementation gate is newly claimed green by this document edit. E1–E7's runtime/type/audit deficiencies remain in the current implementation until their owning slices are delivered and their registered acceptance proofs pass. Full native/browser/heap/docs gates and OS-specific IME checks were not rerun for a specification-only correction.

Final review artifacts are [the specification recheck data](test-results/extensibility-2026-10-15/specification-recheck.json), [the source-browser probes](test-results/extensibility-2026-10-15/source-browser-probes.mjs), and [the package-browser probes](test-results/extensibility-2026-10-15/package-browser-probes.mjs).
