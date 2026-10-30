# Final maintained differential verification

## Result and scope

All **235 candidate scenarios across 14 maintained comparison entrypoints** completed with zero raw candidate failed observations on `1c933545c6f05701741031997945c64b1ab5ba9d`. Loaded source bytes, source revision, fixture and runner hashes were verified; all comparison servers reported zero errors and every C11 gate retained `sourceUnchanged: true`.

The full C11 result remains **failed: 5 passed gates and 10 failed raw differential gates**. Those ten commands return 1 for historical reference failures or incomplete reference behavior. No exit code, failed observation, unsupported API or incomplete phase was converted to a pass. Candidate verification is the conjunction of zero candidate failures, completion, no unsupported candidate capability, no candidate runtime errors, source verification and zero server errors.

The incoming merge changed four maintained runner completeness checks. A separate run on `19cea0f8b8715c171b839cf6c3027ba66ea3f556` repeated **102 scenarios** for text block settings, Columns, Raw and tool actions. All 102 candidate scenarios completed with zero failures under the stricter checks. All four raw commands exited 1, so that separate C11 result is also **failed**. The 102 cases are repetitions within the original 235, not additional coverage. The followup preflight proves an empty diff for production code, fixtures, tests and dependencies between these two SHAs.

The exact source revisions and every source/case ID are listed in [coverage.json](coverage.json). Historical incomplete and unsupported cases are retained in that file and the original raw reports.

## Full corpus on `1c933545`

| Comparison | Candidate cases | Candidate failed observations | Raw exit / C11 outcome | Historical failed observations |
|---|---:|---:|---|---:|
| common-parity | 65 | 0 | 0 / passed | 1339 |
| gallery-parity | 6 | 0 | 0 / passed | 224 |
| presentation-values | 11 | 0 | 0 / passed | 22 |
| public-focus | 7 | 0 | 1 / failed | 9 |
| formatting-ownership | 10 | 0 | 1 / failed | 35 |
| link-ownership | 13 | 0 | 1 / failed | 60 |
| gallery-viewer | 2 | 0 | 1 / failed | 12 |
| code-languages | 3 | 0 | 1 / failed | 32 |
| text-block-settings | 21 | 0 | 1 / failed | 214 |
| table-settings | 14 | 0 | 1 / failed | 38 |
| columns-layout | 12 | 0 | 1 / failed | 30 |
| tool-actions | 48 | 0 | 1 / failed | 536 |
| raw-source | 21 | 0 | 1 / failed | 256 |
| embed-preview | 2 | 0 | 0 / passed | 4 |

The additional offline Gallery validator passed: **224** positive historical observations, **3808** negative observation controls, **4** paired historical page errors and **11** negative page-error controls. Candidate exceptions: **0**.

The strict Embed entrypoint passed only after checking all six source/scenario pairs, the exact four historical failed observations and zero candidate failures. Its raw child exit **1**, raw JSON and stderr are saved separately; the wrapper's successful exit does not erase the child result.

## Reference identities and exact comparisons

The immutable references are v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`. Code also uses pre-fix `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`.

Exact failed-observation signatures include source SHA, case, phase, property/name, status, actual and expected payload, including duplicate counts. Existing archived signatures matched exactly for Gallery ordering, public focus, formatting ownership, link ownership, Gallery viewer, Table settings, Columns and Raw, and tool actions. These are observations of reproduction, not new acceptance exceptions.

Common roundtrip reproduced 1339 historical failed observations; 1329 signatures matched exactly. The other ten differed only at `/actual/0/id` and `/expected/0/id`: four v1 Person default observations and six specification-baseline Table default observations. The generated IDs agree between actual and expected within each report. Existing maintained classifiers passed, while the exact signature mismatch and every raw ID remain preserved. The read-only field comparison is in `reference-review/common-generated-identities.json`.

The Code archive records pre-fix SHA `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13`; its Git object is unavailable here. All 91 loaded-module hashes recorded for that source match pinned `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`. This establishes only the recorded loaded-module equivalence. No full-tree equality is claimed, and both SHAs remain distinct in raw signatures.

Presentation has no prior archived raw witness in the initial inventory. Its 22 raw v1 failures all concern `neighborDomIdentity=false`, expected `true`, after Undo or Redo; the existing maintained runner classifies that exact tuple. The original no-witness classification remains visible.

The Text settings witness arrived only with the incoming merge. A separate read-only addendum compares that pinned archive with both fresh runs: **1c933545: 212/214 exact, 19cea0f8: 212/214 exact**. The original no-witness classifications are unchanged. Exact mismatched payloads and field paths are retained in `reference-review/incoming-text-witness.json`; this adds no classifier or ledger acceptance.

Reference page errors, incomplete phases and unsupported APIs are recorded separately from failed-observation signature matches. A reference signature match does not assert that all historical scenarios completed.

## Reproduction and provenance

`runs/run-AYPL00/manifest.json` records the full 14-comparison corpus and offline validator on `1c933545c6f05701741031997945c64b1ab5ba9d`. `runs/run-a15oUo/manifest.json` records the four updated runners on `19cea0f8b8715c171b839cf6c3027ba66ea3f556`. Commands, elapsed times, explicit non-secret environment selection, source digests, dependency file hashes and exact raw reports are archived. Runs used Chrome 156 and physical lockfile dependencies, including Carousel commit `f7f6485886a1d77f9213d9079eb70000efeff499`.

`runs/run-gXXU3x` is a closed **not-run** plan on `c6e537e5d7433f0d902749719c8af265c6ae8591`: all 15 gates stayed unstarted, source unchanged. It was superseded after a Russian documentation correction and supplies no comparison evidence. Preparation details and the executable supervisor snapshots are under `supervisor/`.

Raw reports and C11 logs are gzip-compressed with deterministic headers. `hash-index.json` records stored and uncompressed byte counts and SHA-256 hashes for every archived file other than the index itself. This evidence commit changes only the checkpoint directory; no production, fixture, classifier or ledger code is changed.
