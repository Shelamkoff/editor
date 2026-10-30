# Private draft journal sharing — 2026-10-30

This checkpoint removes a demonstrated internal copy while preserving mutable
public snapshots and strict input ownership. It does **not** complete C09/T15:
full-path latency remains mixed, including a slower large-Table native median
and a higher small-Columns public p95 in this run. No general speedup, lower RAM
or absence-of-leaks claim follows from the reduced work.

## Exact sources and change

- Baseline: `69c8425e0081fde69cf5176ccb73d032720c15fc`, tree
  `bf2b6820b2e08a6e882630959415e668542c34a0`.
- Initial journal change: `e8ea1b6659ea9bd67904598acbbaf13fa267731c`.
- Final isolated candidate: `11d5b5d0d5a900b5a4f2e7ae0fd0ff5cd4128995`, tree
  `e28320ddca33c6c94168fad460dee08d7f90ada4`.

The only changed production file is `core/DocumentStore.js`. Insert, update and
remove previously cloned already-owned, validated, deeply frozen records into
the private change journal. The journal now retains those immutable records;
the existing `changes` getter still returns a fresh deep copy, as do the other
mutable snapshot boundaries. History preparation and immutable event ownership
are unchanged. No new API, cache, registry, transaction owner or selection owner
was added.

The initial optimization exposed an older internal construction edge:
`new DocumentDraft(owner, state, { state: true })` without the private borrow
token previously accepted a shallow-copied map of caller records. Sharing such
a record would allow later caller mutation to alter a journal entry. The final
candidate captures these records through existing `ownBlock()` at that
untrusted construction boundary. Only the existing private token permits
borrowing. Normal `DocumentStore.createDraft()` uses that token and incurs no
new payload traversal. This internal constructor is not exported by the public
package, but its prior journal isolation is preserved. Shallow freezing does
not confer trusted provenance.

Full-index patches and raw commit objects reconstruct both isolated sources.
The final benchmark reads their loaded production bytes against the exact Git
objects, and records source/dependency hashes. The sources remained clean and
unchanged before and after the run. Later integration/publication mappings are
separate from these isolated source identities.

## RED, GREEN and controls

The first meaningful journal RED observes 14 repeated JSON-boundary visits to
the already-owned canonical graph during update/removal; the intended count is
zero. The same test passes after the journal change. Independent behavioral
controls cover mutating returned change snapshots, retaining caller inputs,
chained same-block updates, strict frozen external accessors/cycles/nonfinite
values, immutable events, detached history queries and exact Undo/Redo.

The state-shaped construction regression is RED on `e8ea1b66`: late mutation of
a shallow-frozen caller record changes the saved `before` value. It is GREEN
after the existing boundary captures its own records. All five journal tests
then pass. The final clean source passes **171** neighboring DocumentStore,
PersistentBlockMap, HistoryStore, TransactionEngine and public-snapshot tests
with no failures, skips or cancellations. Both checked-JavaScript configurations
pass. These are scoped checks, not a replacement for combined integration.

The initial child-process report was incomplete because this environment's
sandbox interfered with Node child-process reporting; a direct run exposed the
intended failure. An early fixture also expected the word `cyclic` while the
existing validator reports `circular`; that expectation was corrected without
changing production. Those artifacts and reconstructed exact test bytes remain
separate. The first headless comparison could not complete because sandboxed
Node `spawnSync(git)` returned `EPERM`; the unchanged command subsequently ran
with the supported execution permission. The incomplete attempt is not counted
as a product RED or a successful comparison.

## Deterministic work

The headless public/runtime Table comparison runs five commands on 2×2 and
20×20 data, preserving exact data, input isolation, no-op history and replay.
The benchmark's explicit `changed` expectation mode requires a reduction for
real edits and **exactly unchanged** counters for all no-ops; its previous
default `all` mode is unchanged. Baseline-versus-baseline is retained as a
negative control: every reduction is zero and the assertion fails with exit 1.

For the final candidate, public/projection edits avoid 16 JSON object visits on
2×2 and 844 visits on 20×20, with two fewer Table-payload traversals in each.
All six no-op combinations have exactly unchanged counts. These headless
counts exclude DOM, timing and the assertion/replay phases.

The independent real-browser counter run includes sidecars and the full live
path. On Table 20×20, public editing changes JSON visits **17,430 → 16,568** and
native editing **30,090 → 29,228**, or **862 fewer** in each, with two fewer
structured-payload traversals. First public/native edits avoid 22 visits for
Paragraph, 34 for small Table, 32/122 for small/large Gallery and 26/28 for
small/large Columns. No-op and Undo/Redo counters are unchanged. Corresponding
DOM child-list reads, node clones and element-creation counters are unchanged.

## Complete-path measurement

The quiet-window run lasts **2026-10-30T18:21:25Z–18:26:13Z**. Root and both
sibling agents stopped browser/test runners before it began. Node is
`v24.22.1`, npm `11.9.0`, Chrome `156.0.8078.79`, Linux; the container has an
8-core CPU quota and an 8 GiB memory limit. The original runner/environment
records include viewport, host CPU, dependency identities and start/end load.

The unchanged structural runner uses seven populated shapes: Paragraph,
Table 2×2/20×20, Gallery 3/48 images, and legal Columns 2/3-column layouts with
2/256 repeated rich-text words. Neighbor paragraphs, two real Mention instances
and an opaque sidecar exercise preservation. Each variant/command has five
warmups and 21 alternating-order paired samples. Public/native paths include
edit, Undo and Redo; empty/equal-data no-ops remain separate. History depth is
one and `changeDebounceMs` is explicitly zero. Native input is trusted browser
input. Live composition, field/widget identity, notifications and fixed
canonical/DOM expectations are controlled.

All **74** functional controls pass: 70 ordinary cases plus four deliberate
oracle-sensitivity failures. There are 56 timing groups, 56 separate attribution
groups and 14 retention observations. No page/server errors occur. Timing,
counter instrumentation, Chrome traces, statistical allocation sampling and
forced-GC observations run separately.

First-edit synchronous milliseconds, baseline → candidate:

| Shape / path | p50 | p95 | Median paired delta | Candidate faster |
| --- | ---: | ---: | ---: | ---: |
| Paragraph / public | 1.3 → 1.4 | 1.7 → 1.7 | +0.1 | 7/21 |
| Paragraph / native | 1.8 → 1.7 | 2.8 → 2.4 | approximately 0 | 11/21 |
| Table 2×2 / public | 2.2 → 2.1 | 4.3 → 4.3 | 0.0 | 9/21 |
| Table 2×2 / native | 2.8 → 2.5 | 4.7 → 3.3 | −0.4 | 12/21 |
| Table 20×20 / public | 45.6 → 46.0 | 61.4 → 60.0 | +0.1 | 10/21 |
| Table 20×20 / native | 57.9 → 59.8 | 81.6 → 77.5 | +3.6 | 9/21 |
| Gallery 3 / public | 2.3 → 2.2 | 3.6 → 3.1 | −0.2 | 15/21 |
| Gallery 3 / native | 2.9 → 2.7 | 5.2 → 4.4 | 0.0 | 9/21 |
| Gallery 48 / public | 8.3 → 8.1 | 9.8 → 11.8 | −0.5 | 12/21 |
| Gallery 48 / native | 12.9 → 12.3 | 16.3 → 16.2 | −0.4 | 13/21 |
| Columns small / public | 3.0 → 2.7 | 3.8 → 5.7 | −0.2 | 14/21 |
| Columns small / native | 2.9 → 2.3 | 3.6 → 2.8 | −0.6 | 14/21 |
| Columns large / public | 23.7 → 24.1 | 32.9 → 32.1 | +0.2 | 9/21 |
| Columns large / native | 27.9 → 27.6 | 32.4 → 31.5 | −1.2 | 11/21 |

The Table native median and paired median worsen despite its lower p95.
Gallery-large and Columns-small public tails also worsen. Therefore the
demonstrated copy reduction is not evidence of consistent end-to-end speedup.
Small results are not silently omitted. The summary retains all no-op/replay
phases and notification/driver/frame metrics with every exact paired delta.
Two animation frames represent a rendering opportunity, not proof of paint;
separate actual Layout/Paint/UpdateLayoutTree traces are retained.

V8 sampled allocations include edit/replay/reset and oracle work at an
8192-byte interval, including collected objects. Large Table public sampled
bytes fall 34,615,348 → 32,575,736 (−5.9%), while native rises
40,565,044 → 41,899,988 (+3.3%). Small Table public/native estimates rise
9.2%/4.8%, and small Columns public rises 22.5%. These single statistical
profiles are not exact per-command allocation or retained RAM measurements.

Each of 14 separate memory controls observes zero retained released references
out of 1008 WeakRef observations after 12 edit/replay cycles; positive controls
and intended mounted fields remain live. These are observation counts, not
unique-object counts or proof about every nested object. Large Table used-heap
deltas are +118,024 bytes baseline / +118,276 candidate; lower RAM is not
established.

## Preserved evidence

`structural/` contains the complete result and **all 112 raw compressed Chrome
trace/allocation files**, without dropping unfavorable samples.
`performance-summary.json.gz` contains recomputed distributions, paired
deltas, counters, allocation, retention and the original artifact inventory.
The separate extraction checks 360 loaded source hashes, 25 dependency
hashes and 1232 saved percentile fields. `review-results.py.gz` preserves that
extraction. `structural-manifest.json.gz` records exact command/environment and
clean unchanged source snapshots. `environment.json.gz` records quota limits.

`tests/` retains initial and final outcomes; `work/` retains complete headless
comparisons and the negative control. `sources/` retains both commits, patches
and the exact RED test sources. `artifact-hashes.json` records every retained
file's stored and, where compressed, uncompressed size/hash. Further combined
checks and any publication SHA mapping belong to the integration checkpoint.
