# Prepared rich fields and complete structural paths

The implementation and isolated C09/T15 evidence are ready for final integration.
Whole-audit acceptance and the 209-scenario register remain open. No scenario is
accepted by this performance checkpoint alone.

`20afc8da` reuses derived normalization and placeholder counts inside the existing
block projection state. Keys include the exact author string and sidecar key set;
changed sidecar values still enter current schema, ownership and hydration checks.
Removed fields are pruned, disposal clears the cache, and live DOM is still
validated. There is no second model, public cache API or external-frozen-object
trust shortcut. Required JSON ownership/validation is retained.

## Isolated evidence

Baseline `8761946d` and candidate `906e3dbf` have identical 184-module production
graphs except `core/InlineProjectionRuntime.js`. The fixture/dependencies are
identical. Exact Git bytes are served without source transforms. The benchmark
now also accepts `git:REF`, avoiding extra checkouts and Windows path/newline
assumptions. Checkout inputs still require committed bytes, allowing only text
CRLF/LF conversion; working-file end checks remain byte exact.

The run has five warmups and 21 alternating paired samples on each of seven
populated shapes: Paragraph, 2x2/20x20 Table, 3/48-image Gallery and two/three
Columns with 2/256 repeated rich words. All retain two real Mention occurrences,
one opaque occurrence, fixed neighbors, one-action history and zero notification
debounce. Results: 74 controls, 56 timing groups, 56 separate attribution groups
and 14 forced-GC observations, with unchanged source and no page/server errors.
Executed 2026-11-02 19:44:57-19:48:51 UTC, Windows 10.0.19045 x64,
Node 24.9.0, Chrome 156.0.8078.79, Ryzen 7 4800H/16 logical CPUs and 31.4 GiB
reported RAM.

First-edit medians, milliseconds (before -> after):

| Shape/path | Synchronous | Scheduled onChange | Two-frame opportunity |
| --- | ---: | ---: | ---: |
| Table 20x20/public | 54.1 -> 38.2 | 56.3 -> 40.1 | 66.9 -> 48.6 |
| Table 20x20/native | 79.2 -> 66.1 | 82.5 -> 69.2 | 93.5 -> 80.7 |
| Gallery 48/public | 10.6 -> 9.8 | 12.1 -> 11.2 | 14.1 -> 13.8 |
| Gallery 48/native | 16.8 -> 15.3 | 19.7 -> 17.9 | 31.7 -> 25.2 |
| Columns 3x256/public | 32.0 -> 24.5 | 34.4 -> 27.0 | 36.1 -> 28.1 |
| Columns 3x256/native | 37.4 -> 38.2 | 41.4 -> 42.0 | 50.6 -> 48.1 |

No uniform speedup or universal SLA is claimed. Native Columns' synchronous
median increases 0.8 ms while its p95 decreases 44.8 -> 43.2 ms. Native Gallery's
synchronous p95 increases 20.0 -> 21.5 ms and frame-opportunity p95 increases
33.9 -> 37.3 ms despite lower medians. Small-shape medians remain comparable;
the largest first-edit frame-median increase is 0.4 ms (small native Table).
All raw distributions, including no-ops, Undo and Redo, remain available.

The measured reduction is in DOM preparation/traversal, not a new reduction in
JSON visits. Earlier event-copy repairs remain independently covered. Counter,
Layout/Paint, V8 allocation and retained-object observations are separate from
timing. Allocation sampling includes reset/oracle work and is not retained heap
or history-byte accounting. The two-frame metric is a render opportunity;
actual Layout/Paint windows are independently checked from Chrome traces.
Each memory observation retains its live positive controls and has zero retained
released references; this does not prove absence of every possible leak.

## Reproduction and review

Run from the repository root with the installed Playwright module and Chrome
selected using `EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH`:

```text
node benchmarks/structural-authoring.mjs git:8761946d git:906e3dbf EMPTY_OUTPUT_DIRECTORY
node scripts/parity/checkpoints/2026-11-02/core-prepared-fields/review.mjs OUTPUT_DIRECTORY 8761946d 906e3dbf
```

The reviewer verifies the identical graph/sole production change, source and
dependency bytes, fixed fixture sizes, all 336 metric summaries, native/event
counts, sensitivity controls, all 112 trace/allocation artifacts and memory
controls. It reports slower sub-metrics and assesses complete-path medians.

Local evidence lives under the ignored
`test-results/audit-closeout-2026-11-01/structural-prepared-isolated/`. Earlier
`structural-prepared-complete/` and `structural-prepared-small-repeat/` compare
against `cabcfa97`; they are separate pilot/repeat evidence, including their
mixed small-input tails. The pilot checker first incorrectly assumed a measured
synchronous IME interval and then a strict improvement in every sub-metric;
those failures remain separate. No runtime, fixture, raw measurement or expected
author content was changed to hide them.

Final common integration remains pending the corrected HTML-ready observations.
