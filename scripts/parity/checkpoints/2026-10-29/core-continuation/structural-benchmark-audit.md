# C09 / T15: structural benchmark completeness audit

Date: 2026-10-29. This is a read-only audit, not a new benchmark run or a
production defect report. No source, test, specification or integration file
was changed. Exact inspected file/evidence hashes are in
`/tmp/rector-c09-structural-benchmark-audit.json`.

The inspected combined candidate is frozen integration
`0cf0cc72a12a2995e22e73cf75c2e29ef91bd476` at
`/tmp/rector-presentation-integration-20261029`. Main was
`a03dfd87d6f06ff7bff2c05b7625ca77c91cfc83` when the inventory was recorded.
Earlier benchmark sources are identified separately below; their results are
not fresh acceptance results for this integration commit.

## Conclusion

**C09 has accepted bounded work, but full T15 remains partial.** The public
snapshot comparison proves reduced repeated payload visits and faster detached
reads on its measured headless path. The newer inline comparison measures a
real public extension-context update through DOM projection and fixes a
demonstrated quadratic guard cost. Neither comparison measures native
structural authoring, scheduled `onChange` work or layout/paint. Gallery and
Columns have no comparable complete-path performance evidence in the reviewed
sources. An earlier populated Table focus comparison exists, but deliberately
performs no author edit or history operation.

The new C10 proof supplies actual live-editor retention evidence after repeated
history eviction. It does not turn serialized history byte accounting into
heap measurements, and it does not establish allocation or retained-memory
behavior for populated structural authoring.

This is an evidence gap, not proof that Table/Gallery/Columns are currently
slow or broken. The governing contract requires measurements before an
optimization is selected. Do not remove a second schema encode, weaken JSON
capture, or add a general field-patch API to satisfy this audit.

## Governing requirements

`RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`, section 13/C09, requires:

- Public/native complete paths, separately from store-only measurements:
  capture/normalization, rich-field traversal, equality, projection, history,
  event publication and scheduled work.
- Populated **Table, Gallery and Columns** fixtures; preservation of no-op,
  field identity, sidecars, live composition and Undo/Redo.
- Recorded runtime/dependency/browser/hardware, fixture shape/size,
  warmup/repeats, distributions and measured boundaries. UI work and memory
  must be separate; a synchronous call without paint must say so.
- Reduced demonstrated work and comparative end-to-end improvement without
  material regression on small ordinary inputs. Historical large-table times
  are observations, not a universal latency limit.

T15 additionally names measured traversal/allocation and retained-memory
observations. Section 13 explicitly retains strict external JSON validation,
one-read accessors, private owned-data provenance and schema postconditions.
These are constraints on any later optimization, not optional controls.

## What the existing evidence actually measures

| Evidence | Actual boundary and input | What it proves | Remaining limit |
| --- | --- | --- | --- |
| `benchmarks/snapshot.mjs` | `DocumentStore` export/draft/update/commit; 10/100/500/1000 simple Paragraph records; 50/200/100 repetitions | Store-only median/p95 observation | No editor, schema-rich mapping, DOM, native input, public event adapter, UI or memory; no paired source/environment manifest in that script |
| `benchmarks/public-snapshots.mjs` and `core-continuation/public-snapshot-comparison.json` | Synchronous `EditorBlocksApi` plus real runtime/store/schema/history and its `onCommit`; default no-op projector; 287-byte small input and 141,039-byte three-block custom structured input; 21 samples | Query/producer adapter traversals reduced; complete synchronous query/update costs on this boundary; exact commit/revision counts; isolated mutable reads | Custom schema has no built-in rich-field mapper. Rich-looking strings are not a populated Table/Gallery/Columns projection. No `createEditorRuntime` public-event fanout, browser, native/IME, scheduled work, layout/paint or allocation/retention measurement |
| `/tmp/rector-inline-payload-benchmark/result-linear.json` | Real registered `InlineWidgetContext.updateData` through actual `createEditor`, scope/schema/store/history/events and DOM projection; one middle sidecar in **one Paragraph field**; 50/200/800 widgets; 3 warmups + 9 samples; maxStack 1 | Every sample commits once and updates one widget; no extra widget acquisition; real synchronous DOM work is included; repaired implementation removes the v2 quadratic slot-scan cost | No structural plugin, empty/data-equal update, native/IME, exact Undo/Redo timing, configured `onChange`, async observer/UI work, layout/paint or retained memory. rAF and save/assertions occur outside the timed interval |
| `/tmp/rector-presentation-v2/native-presentation-table-perf.js` plus baseline/v5 traces | Actual populated Table with 100/400/1600 cells; public `blocks.focus` on the final field; 3 warmups + 12 samples; earlier C12 sources | Correct field identities, caret, unchanged model and no history, plus synchronous focus cost at scale | The operation intentionally makes **zero commits**. It does not measure native edit/capture, normalization, equality, history, publication or structural allocation. It is historical v5 proof, not final v9/combined acceptance |
| C10 `history-heap` evidence | Live public editor, twelve 32 KiB custom JSON payload actions, maxStack 100/maxBytes 1; three actual Chrome heap snapshots | Evicted payloads disappear while latest whole-action history survives; retained public sentinel remains then disappears on release; actual Undo/Redo and final disposal | Bounded newest-oversize history case. No structural payload allocation profile or general heap/latency guarantee |

The public snapshot pair is based on `ec896d54fd6d6b573dc62e75896a6b77b3383fe5`
plus the recorded C09 patch; the inline pair uses baseline `256cc043…`, first
repair `10d1ee48…`, and linear repair `ede029cc…`. Both comparisons retain raw
samples, source hashes and environment. The inline runner verifies each loaded
source module against its pinned Git commit and checks bytes after the run.

At 800 widgets, the inline comparison reports medians **47.4 / 114.6 / 52.5 ms**
for baseline / v2 / linear repair. It proves removal of v2's large overhead;
it does not prove a speedup over the old, behaviorally defective baseline.
The same data reports equal decode counts (11,213 total per variant) and mode
calls reduced from 10,400 to 812. These are callback observations, not byte
allocation measurements. The returned `unchangedTail` observation is false
for baseline and true for both repairs; it is not itself asserted by the
benchmark's `verify()`. Functional regression tests own that preservation
requirement. No material-regression threshold can be invented from one median
or substituted for the contract's comparative small-input requirement.

## Existing functional coverage is useful, but is not a performance run

The actual built-in fixture shapes in `tests/browser/plugin-parity-fixtures.js`
are a one-row/two-cell Table, two-image Gallery and two-column Columns block.
`native-plugin-parity.js` already has meaningful controls for Table sibling
updates, headings and exact native history; Columns sibling/layout updates;
Gallery caption marks, style-only/data-equal updates, stale controls, native
caption reversion and Undo/Redo. `native-plugin-ranges.js` checks directed
compound ranges and preserved unselected fields. Table and Columns unit
reconciliation suites check unchanged DOM and deterministic structural edits.

The C12 genuine-composition/pending-input tests in
`regressions/presentation-native-cases.js` protect their custom registered
presentation fixture. They do not make a large built-in Table/Gallery/Columns
benchmark an IME test. Keep the existing coverage; add only conditions needed
by the chosen optimization. This audit did not rerun any of these gates.

## Outstanding testable conditions

| Obligation | Current status | A concrete condition still requiring evidence |
| --- | --- | --- |
| Structural author edit at scale | Missing comparative proof | One real Table cell or Gallery caption changes while all unselected data, marks, sidecars and neighboring block identities remain exact; scale the real field count, not just arbitrary JSON |
| Native full path | Missing timing/allocation proof | Trusted browser input reaches `input` and a canonical commit, with exact DOM/model agreement and one intended history action; synthetic `dispatchEvent` alone is insufficient |
| No-op behavior and work | Partially covered | Both an empty producer result and a data-equal populated structural update produce no transaction/history/notification, preserve the caret and every untouched host, and expose their actual traversal costs |
| Scheduled work | Missing comparative proof | Configure `onChange`, record its exact saved payload and notification count, and await that task before declaring the complete path settled. A runner that stops at synchronous return must report that narrower boundary |
| UI cost | Missing | Separately record synchronous DOM work and a settled rendering interval with stylesheet/layout preconditions; rAF is only an opportunity for rendering, so do not relabel one rAF as measured paint without trace evidence |
| Undo/Redo and composition on the optimized path | Partial functional coverage | Exact one Undo and one Redo restore whole structural data and directed selection; queries/no-ops and allowed independent work retain genuine active composition. Do not invent a new permission for writes during composition |
| Traversal and allocation | Partial traversal counts; allocation missing | Attribute repeated schema/JSON/rich-field passes and actual allocated bytes/call stacks on a separate instrumented run. Callback counts or total heap-size deltas alone are not allocation counts |
| Retained memory | Bounded C10 proof complete; structural claim unproved | If claiming structural retention improvement, release caller snapshots and observer captures, keep positive live controls, and inspect GC/heap reachability on that exact scenario |
| Small-input regression | Headless subset only | Pair a small ordinary actual editor case with the large structural case, fixed source/dependencies and comparable sampling; retain distributions rather than imposing a new universal SLA |
| Cache invalidation | No new cache proposed | If reuse is later introduced, changed canonical identity, changed rich text/sidecar, field replacement/mode and failed preparation invalidate it; unchanged owned data must not skip necessary boundary validation |

## Where to attribute the remaining work

The existing owners already give a bounded investigation seam:

1. `DocumentRuntime.#normalizeLocalData` performs encode → schema rich mapping
   → encode. `shared/versionedDataSchema.js` captures and normalizes inputs and
   results; all three structural schemas enumerate their declared rich fields.
   These passes are real, but the last encode validates a transformed value.
   Repetition alone does not prove it can be removed.
2. Table's `read`, `update/reconcile` and `editableFields` enumerate rows/cells;
   Columns enumerates its legal two/three columns. Gallery can preserve its
   caption hosts for native/style updates but uses a distinct full projection
   path for other changes. A useful fixture must say which route it exercises.
3. `TransactionEngine.#event` creates a detached deeply frozen
   event. `DocumentRuntime` adds a frozen history envelope without recapturing
   the event's changes. `createEditorRuntime` then calls
   `immutableEventPayload` independently for `transaction:committed` and
   `document:changed`, each traversing the changes graph again. This is a
   concrete candidate for a later ownership-transfer investigation, not yet a
   measured structural bottleneck or an approved fix.
4. `ChangeNotifier.schedule` does nothing when no `onChange` callback exists;
   with a callback it schedules save and notification. Neither current paired
   benchmark configures that path. Its cost cannot be inferred from the
   synchronous event counter.

Any event-copy repair must retain immutable events and mutable detached public
queries, accessor/reentry behavior, independent observers after an error,
current-draft semantics and history isolation. The existing public-snapshot
tests' narrow payload-visit spy is a useful test mechanism; it must not become
a production hook or a frozen-external-object trust test.

## Recommended next isolated slice

**Start with a Table full-path measurement fixture and contract controls.**
Keep this separate from C12 ownership changes and from the optional Table
default-size parity decision. Explicit fixture data avoids conflating defaults
with performance. Do not change production merely because this coverage is
missing.

Suggested bounded files/seams:

- A small module imported by the existing registered native plugin parity
  page, using its normal harness and native input helpers. No new public API
  or standalone unregistered acceptance gate.
- A focused `benchmarks/structural-authoring.mjs` comparison driver plus the
  same fixed fixture definitions, reusing the existing Chromium/native setup
  and source-pin conventions. Keep the current headless snapshot benchmark
  separate. No general benchmark framework or runtime phase hooks.
- Only after a repeated transfer is measured and its ownership is proven,
  add the precise traversal regression beside the existing owner tests and
  patch that owner alone. Event publication is a suitable first candidate;
  arbitrary schema post-transform encode removal is not.

Use a small explicit 2×2 Table and populated 10×10 / 20×20 Tables first; add
40×40 only if it resolves a scale question. Include normal rich text, a known
inline occurrence and an opaque current sidecar, with stable row/cell IDs and
fixed neighbor Paragraphs. Measure separately: equal-data no-op, public
single-cell update, trusted native insertion, and exact Undo/Redo. Use a real
small Paragraph control for ordinary-input cost. Enable normal editor styles
and an `onChange` observer; await stable assets outside the timed interval.

Before trusting the fixture, prove its oracle can fail: a test-only suppressed
notification or deliberately premature completion must fail the notification
count/payload/settlement assertion; a deliberately changed sibling must fail
the untouched-field/identity check. These are harness-sensitivity controls,
not product REDs. For a production optimization, first obtain a real baseline
traversal RED on the existing owner, then the same fixture GREEN after the
minimal fix. If no product defect is found, retain honest baseline evidence
without manufacturing a runtime failure.

Keep instrumented attribution/allocation runs separate from clean wall-clock
comparisons. Record source hashes before/after, actual loaded dependency files,
Node/browser/V8/OS/CPU, viewport, exact fixture bytes and field/widget counts,
warmup, raw samples, order and boundary. Retain median/p95/distribution; do not
run competing browser benchmarks in the timing window. History contents and
observer-held data must be controlled equally for both variants.

Then extend the same bounded evidence to Gallery and Columns before marking
T15 complete: Gallery needs real local images, captions enabled, all intended
caption hosts actually mounted, and separate fixed-layout/overflow behavior
where relevant. Columns permits only layouts `1-1`, `1-2`, `2-1`, `1-1-1`;
scale text/sidecars and document block count rather than inventing hundreds of
columns. Suggested shapes are 3/12/48 Gallery images and two/three Columns
with small/medium/large rich content. These sizes are proposed fixtures, not
new capacity requirements.

## Completion boundary

The audited work does not need to be rolled back or reclassified as failed.
Public snapshots, C07 phase typing, C10 history retention and the bounded
inline preservation/performance repair have their own evidence. What remains
open is the explicit broader C09/T15 structural and native complete-path
obligation. The next step is narrow reproducible measurement and meaningful
contract tests, followed by a demonstrated owner-local reduction if warranted.
