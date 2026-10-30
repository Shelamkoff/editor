# Large Table: integrated core-copy comparison, 2026-10-30

The eliminated canonical copying is confirmed in both the headless runtime and the real browser path. This run does **not** establish a stable latency improvement: public edit p95 worsened, and the public/native median paired deltas were both positive. **C09/T15 remain open.**

## Immutable sources and method

- Baseline: `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef`, tree `8b22cffd41d5f1e56729029d492f7151dabade56`.
- Full integrated candidate: `8d2e37d0c0f7989b5abc6aea03ba722f5dd960e5`, tree `e004d9901c3a33e992bfdf27391ded765a3b3229`. This includes core-copy optimization, Gallery, Person and CSS changes; browser results are not an isolated core-only ablation.
- Quiet-window run: 2026-10-30T08:05:35.335Z through 2026-10-30T08:06:48.784Z; Chrome 156.0.8078.47, Node v24.22.1.
- Unchanged runner `benchmarks/structural-authoring.mjs`, Table 20×20 / 400 editable fields, 5 warmups per variant/command, then 21 paired samples with alternating order.
- Four commands: public edit, trusted native input, empty no-op and equal-data no-op. Public/native samples include edit, Undo and Redo. Counting, traces, allocation sampling and bounded retention run separately from uninstrumented timing.
- All 14 controls passed: 10 ordinary functional/composition cases and four deliberate oracle sensitivity failures. There were no page/server errors; source bytes remained unchanged. Each variant served 177 source files from its exact commit; 25 dependency files used one shared dependency set.

Runner SHA256: `bd0b1a9908796041ea0006c422beb0c94e7e3c69da9be5e2d11b4b888a8298b9`. Fixture SHA256: `d56a5c54c78ea0cb55878a1375f17cfb048ae4f3ba83f7959844ad335d7b146b`. Lock SHA256: `91874afdcfbe533e607429bdaa3e0a4cbf9d671410831dbeb1d62d4d5d266382`.

## Synchronous command latency

Milliseconds; arrows are baseline → candidate. A paired delta is candidate minus baseline. p50/p95 use sorted indices 10/19 of 21 samples. The accompanying JSON includes every phase, notification and two-frame metric, all synchronous pair deltas, and exact raw-artifact hashes.

| Command | p50 | p95 | p95 change | Median paired delta | Candidate faster |
| --- | ---: | ---: | ---: | ---: | ---: |
| public | 64.6 → 65.3 | 81.7 → 93.0 | +13.8% | +0.3 | 9/21 |
| native | 74.4 → 73.5 | 100.3 → 88.7 | -11.6% | +0.9 | 10/21 |
| noop-empty | 26.8 → 25.7 | 32.0 → 49.8 | +55.6% | -0.6 | 12/21 |
| noop-equal | 27.0 → 26.8 | 32.6 → 30.8 | -5.5% | -0.9 | 12/21 |

Native p95 was lower in this sample, but only 10/21 native pairs and 9/21 public pairs were faster. The empty no-op p95 and allocation sample also worsened. These observations do not support a broad or stable timing-win claim.

## Avoided work and allocation samples

The mechanism was isolated before integration with e99 → `4dcbffebfbd960cee73f0a044f0a32d5c218347d`, saved in `canonical-read-work-isolated.json`. The current exact-source headless rerun uses e99 → `8d2e37d0c0f7989b5abc6aea03ba722f5dd960e5` and passes all ten 2×2/20×20 cases with identical counts; this confirms preservation through integration, not a new isolated ablation. Both use the same deterministic runner.

For large Table, public/projection edit and equal-data no-op avoid 844 JSON-record visits and two Table-payload traversals; the empty no-op avoids 423 visits and one traversal. Caller detachment, canonical results, no-op history and Undo/Redo remain controlled. The same runner's previously saved e99/e99 negative control found zero reductions and failed its assertion as intended; that original control is preserved and was not rerun in this timing window.

In the real browser fixture, public edit changes JSON visits from 18,292 to 17,430, and native input from 30,952 to 30,090: **862 fewer visits and two fewer structured-payload traversals** in each. Empty/equal no-ops avoid 441/862 visits and one/two payload traversals. Headless/browser envelopes differ, so their counts must not be conflated. DOM child-list reads, clones and element creation are unchanged in every corresponding phase; Undo/Redo counters are unchanged.

V8 sampled bytes below cover the full edit/Undo/Redo/reset/oracle sequence at an 8192-byte sampling interval, including collected objects. They are statistical allocation estimates, **not exact per-edit allocation, RAM, retained heap or leak evidence**.

| Command | Sampled bytes | Change |
| --- | ---: | ---: |
| noop-empty | 7,698,652 → 9,017,348 | +17.13% |
| noop-equal | 9,471,064 → 9,468,188 | -0.03% |
| public | 34,448,988 → 31,137,812 | -9.61% |
| native | 42,580,024 → 40,401,956 | -5.12% |

Direct samples attributed to `visit` in `shared/jsonData.js` decrease from 13,602,152 to 11,199,500 bytes for public and from 17,886,504 to 16,687,508 bytes for native. Attribution sums sample sizes by direct sample node; it does not sum inclusive ancestors or substitute `head.selfSize` for the sample totals. These are one profile per variant/command and do not establish a stable allocation distribution.

## Retention, rendering and scope

Each variant completed 12 alternating public/native sequences. Both observed 0 retained released objects out of 1008 WeakRef observations, with the positive control and all 400 live fields intact. Used-heap deltas after the bounded sequence were +127,972 bytes baseline and +135,036 bytes candidate. This does not establish lower RAM or a general absence of leaks.

Two animation frames show a rendering opportunity, not proof of paint. Separate actual Layout/Paint/UpdateLayoutTree records are retained in the summary and raw traces; they are not a repeated paint benchmark.

No timing repeat, small-Table timing or isolated core-only browser ablation was run. These structural controls do not close full-editor parity. This checkpoint records the measured outcome and keeps C09/T15 open.

## Artifacts

- `performance-summary.json`: compact checked summary with sources, all timing phases and paired statistics, counters, trace windows, allocation attribution, bounded retention and SHA256 inventories.
- `paired-samples.json`: unrounded baseline/candidate arrays for all 21 pairs, every phase and all four observed time metrics, plus exact synchronous paired deltas, with explicit pair/phase/metric ordering.
- `canonical-read-work.json`: integrated e99 → 8d2 exact-source deterministic rerun and source hashes.
- `canonical-read-work-isolated.json`: original e99 → 4dcb isolated mechanism proof and source hashes.
- `canonical-read-work-negative-control.json`: original e99 → e99 sensitivity control.
- `structural-results.json.gz`: deterministic archive of the complete original `structural/results.json`, including every recorded source/dependency hash, control observation and raw sample.
- `raw-results-archive.json`: archive/original/provenance hashes, compression settings and verification results.
- `run-manifest.json`, `invocation.json`, `structural.log`: original pinned-source manifest, exact command/environment overrides and short runner stdout, copied without modification.
- Original run directory: `/tmp/rector-next-core-ab-20261030/structural`; its results JSON and 16 compressed trace/allocation artifacts are individually hashed in the summary.
- Raw results SHA256: `33f8f8e3a5ed540ac32349ac2dfdbe05294d445693d9774de8f385f2d6d7b95e`.
- This document covers this performance/proof run only; other integration gates are owned and recorded separately.

The archived JSON is 261,936 bytes before compression and 24,306 bytes compressed. Gzip uses level 9, `mtime=0`, no filename and OS byte 255. Two independent compressions produced identical bytes, decompression reproduced the original JSON byte for byte, and original/provenance hashes match the previously recorded summary. Archive SHA256: `5f64e29732185262ec6f1ad64a3b18fece688ef3593d69f82100fdeae8defa1b`.

The eight Chrome trace files and eight V8 allocation profiles (1,781,157 compressed bytes total) are omitted from the repository. Their individual hashes and the recorded aggregate/derived attribution remain in the summary. Complete event/stack inspection or independent allocation re-attribution requires the retained original files; a hash inventory does not embed those contents. This archival follow-up did not rerun tests, timing or profiling and does not change the C09/T15 assessment.
