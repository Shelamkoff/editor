# Structural authoring and owned event publication

This checkpoint fixes proven repeated event copies and three structural
field-lifetime defects. It records a complete seven-shape comparison, including
real native input, scheduled notification, UI traces, allocation sampling and
GC observations. **Full C09/T15 performance acceptance remains open.** Reduced
work is demonstrated, but consistent native/render-settled latency improvement
is not. The large Table public path was slower in this sample.

## Production changes and independent controls

`createEditorRuntime` now publishes only the exact engine-owned, validated,
deeply frozen commit graph without recapturing it for each notification channel.
All other event sources still use strict capture. Arbitrary frozen external
objects receive no trust. The original regression observed two extra structured
captures between transaction and document events for edit, Undo and Redo;
the same test after repair observes zero. Nested event immutability, mutable
public snapshot isolation, one-read external accessors and opaque sidecars remain
covered. Both independent reviewers approved the private provenance boundary.

The structural fixture then found real public single-field update defects:
Table and Columns rewrote untouched sibling rich content because hydrated
widget DOM differed from serialized tokens; Gallery rebuilt all caption hosts.
Table/Columns now compare with the actual previous canonical field text.
Gallery retains the existing fields while its media identities, layout and
options are unchanged; core performs the changed rich-text projection.
The original fixed-oracle run has six failures. The same nine registered
controls pass after repair, including native composition and exact Undo/Redo.
Deliberately missing notification and corrupted sibling content are rejected.

## Final comparison

The clean paired run is `run-2yA8Wz`, 2026-10-30 01:24:01–01:29:17 UTC.
Both measured trees contain the same structural lifetime fixes. Their loaded
production sources differ only at `core/createEditorRuntime.js`:

* Baseline: `3b539c059c2b25945fa81cce29bcb9ae29eb83bb`.
* Candidate: `ea4afc7c6cca93a8d52e3c052896e79c994f511f`.

There are five warmups and 21 recorded samples for each variant, shape and
operation; first/second variant order alternates. The seven shapes are a small
Paragraph, 2×2 and 20×20 Tables, 3- and 48-image Galleries, and legal two-/three-
column layouts with 2/256 repeated rich-text words. Every fixture contains fixed
neighbor Paragraphs, two actual Mention occurrences and one opaque occurrence.
Gallery uses local images, the fixed `3a` layout and its actual overflow row;
all intended captions are mounted. History depth is one and the supported
`changeDebounceMs` option is explicitly zero. This does not measure the default
notification debounce delay.

The runner records 74 functional/sensitivity controls, 56 timing groups,
56 separate attribution groups and 14 retained-object observations. Both
variants pass the same strict canonical, DOM, sibling-instance, notification,
composition and history assertions. All loaded source/dependency files have
hashes; source bytes remain unchanged. The environment, exact raw samples,
commands, viewport and fixture sizes are in the archived result.

Selected first-edit medians in milliseconds:

| Shape / path | Sync before → after | `onChange` before → after | Two-frame opportunity before → after |
| --- | ---: | ---: | ---: |
| Paragraph / public | 1.8 → 1.6 | 2.4 → 2.4 | 33.4 → 33.3 |
| Paragraph / native | 2.5 → 2.1 | 15.0 → 15.3 | 47.5 → 47.7 |
| Table 20×20 / public | 58.3 → 61.5 | 61.1 → 63.9 | 70.3 → 70.7 |
| Table 20×20 / native | 89.7 → 90.4 | 95.3 → 95.1 | 120.2 → 121.3 |
| Gallery 48 / public | 13.2 → 11.7 | 14.9 → 13.1 | 33.2 → 33.2 |
| Gallery 48 / native | 19.4 → 19.3 | 23.3 → 23.9 | 45.8 → 46.3 |
| Columns 3×256 words / public | 32.7 → 32.6 | 35.9 → 35.5 | 49.8 → 50.1 |
| Columns 3×256 words / native | 39.7 → 40.4 | 43.6 → 43.7 | 59.6 → 58.3 |

These observations establish no universal speedup or absolute SLA. For the
large Table public path, p95 sync rises from 64.4 to 74.2 ms; do not omit that
tail or present reduced copies as improved overall Table latency. Small-control
native notification differs by 0.3 ms and its render opportunity by 0.2 ms;
the complete distributions, including no-ops and replay, remain available.

## Attribution and memory limits

The independent counter run measures JSON-record visits and selected DOM
operations. First public edit visits decrease 282→232 for Paragraph,
20,022→18,292 for Table 20×20, 2,632→2,382 for Gallery 48 and 423→361 for large
Columns. The instrumented counters are never used as clean timing samples.

Actual Chrome `Layout`, `Paint` and `UpdateLayoutTree` records are retained in
separate traces, restricted to the subject renderer process and marked command
windows. A two-animation-frame timestamp is labelled a render opportunity,
not proof that a paint happened. Native settlement is scheduled immediately
from `onChange`, independently of the input driver's return; driver transport
has its own field. No-op windows intentionally include 50 ms to prove absence
of an extra notification and are not no-op application latency.

V8 allocation profiles use an 8,192-byte sampling interval and include objects
collected by both minor and major GC. Their byte totals are estimates, not exact
allocation counts. Profiles include edit/Undo/Redo/reset and oracle work. For
large Table public/native sequences the estimates are 53.43→49.17 MB and
64.27→60.69 MB; some small/Columns estimates increase. Raw profiles and call
stacks are preserved rather than selecting only favorable samples.

Each of 14 separate GC controls observes 1,008 released weak references after
12 edit/replay cycles: event envelopes, `changes`, before/after data and inline
roots, and saved document/blocks/data/inline roots. All are collected; the
strong positive snapshot and mounted fields remain live. These are reference
observations, not unique-object counts or proof about every possible nested
descendant. Whole-heap usage also includes this harness and performance marks;
its delta is not an allocation count or claimed memory saving. Existing C10
history-retention evidence has a different scope and is not replaced here.

## Provenance and unsuccessful attempts

Original C11 manifests and logs are retained unchanged under `runs/`.
`summary.json` distinguishes actual product REDs from the early stylesheet and
selector setup failures. The initial Paragraph runner probe used an older
driver-inclusive settlement boundary and envelope-only GC observations; its
results are historical and are superseded by the final run.

Every reconstructed tracked RED/GREEN patch was checked against its original
C11 patch SHA. The original untracked fixture/test bytes are also archived.
`sources/structural-sources.bundle` preserves the original candidate and matched
baseline commits with the published `4bfb3942` ancestor as prerequisite.
`comparison-command.json` and `detached-runner.py` preserve the exact invocation.
`artifact-hashes.json` records stored and uncompressed hashes. The dependency
set used here predates the separate Carousel Git backport pin; these are exact
scoped performance observations, not a claim about an unmeasured final tree.
