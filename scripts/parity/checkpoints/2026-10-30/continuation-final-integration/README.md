# Final combined continuation — 2026-10-30

This checkpoint records the completed, source-frozen continuation after recovery of local patches and repair of the Gallery integration failures. It accepts the common Carousel ROUNDTRIP alongside the 20 previously accepted common block templates. The preservation register contains **35 accepted / 174 open** obligations; all **209 unique IDs** remain. Open obligations describe missing or incomplete proof, rather than a count of known defects.

## Source and reproducibility

- Original tested commit: `6409e2d24585ac69bc0d991f8c096674c3905a27`.
- Published tree-equivalent commit: [`fc669f9178a6ea9d8d566380e450fb47fa7c595f`](https://github.com/Shelamkoff/editor/commit/fc669f9178a6ea9d8d566380e450fb47fa7c595f).
- Exact Git tree: `0d65a81e4678088fa07d59b7c1539793b0ab47c9`.
- C11 run: `run-M5oL2Z`; whole-run outcome **PASS**, with unchanged source identity before and after every command and the whole run.
- Environment: Linux x64, Node `24.22.1`, npm `11.9.0`, Chrome `156.0.8078.47`.
- v1 reference: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`; specification baseline: `e981ff308000c1d92d7e820df95113c1e19bcee8`.

Git Data publication reproduces each complete local Git tree and checks its SHA before creating the corresponding remote commit. Commit IDs differ because commit metadata differs. `source-tree-mappings.json` preserves the mapping; tree equivalence does not represent an additional test run. Branch updates use an expected-head comparison and do not force-update history.

`run-M5oL2Z/manifest.json` contains the original commands, timestamps, environment, lock fingerprint, per-command source identities and outcomes. Its complete logs are preserved with deterministic gzip and SHA-256 hashes. `verification-supervisor.py` records the actual orchestration and temporary environment paths; it is evidence of this invocation, rather than a portable dependency installer.

## Completed combined checks

| Gate | Actual recorded result |
| --- | --- |
| Source typechecking | Both configurations PASS |
| Unit suite | **2,027/2,027 PASS**, no failures or skips |
| Package build | **285** runtime declarations; zero source diagnostics |
| Declaration contracts | **7/7 PASS**, including Bundler and NodeNext consumers |
| Documentation contracts | **47** localized README pairs, **94** READMEs, **53** examples; package README copies and imports checked |
| Installed package | PASS: immutable dependency integrity, offline consumer install, Bundler/NodeNext, Vite, import and external browser; **22 CSS assets** |
| Three-source differential | **65 cases per source**; candidate **11,434/11,434 observations PASS** |
| Ordinary browser suite | **36 pages PASS** |
| Physical/native browser suite | **41 groups, 2,247/2,247 PASS**; initial 6 groups contribute 302 and the next 35 contribute 1,945, counted once from the final aggregate |
| Heap/resource gate | **23 sentinels, zero retained**; all three history eviction/release phases and the live Undo 12 → 11 control PASS |
| Production documentation | **127 HTML pages, zero broken links, zero missing assets**; production browser smoke PASS, including EN/RU and light/dark controls |
| Table performance experiment | Functional and negative controls satisfied; measurements retained below; full C09/T15 acceptance remains open |

The browser run uses Chrome 156 on Linux. Earlier isolated Carousel evidence also includes Chrome 142, but the present complete run is not presented as multi-browser or cross-platform acceptance.

## Repairs exercised together

1. **Structured asynchronous history completion.** Object- and array-valued fields compare canonical JSON values rather than the identity of independent snapshots. Whole-snapshot continuity and task ownership still restrict continuation, preserving one logical Undo/Redo action.
2. **Source indentation.** Code/Raw Shift+Tab removes a leading tab or the supported run of spaces, preserving backward selection, exclusion of an untouched next line, and one history action.
3. **Caret changes inside typed matchers.** A callback that moves the selection invalidates the former conversion continuation. The old Space/Enter cannot replace the previous word, insert a stray space in the new field or split a different block.
4. **Person rich field hosts.** Sibling name, role and biography updates retain healthy field nodes when avatar and links are unchanged. Core projection updates the actual changed rich value, while Mention/Color instances, backward selection and live URL controls keep their owning hosts. Changes requiring a real view replacement still replace it.
5. **Gallery external Files drag.** A file hover/drop supersedes the retained internal image drag, clears obsolete drag state and uploads once, preserving existing item order and a single Undo/Redo action. Two stale-control fixtures now request a genuine layout replacement; all retired-control assertions remain.
6. **Table field descriptors.** The plugin reuses its frozen ordered descriptor snapshot until key, order or host identity changes. Structural/header updates and destruction refresh or clear it. Core live ownership checks remain active for every consumer.
7. **Table and block focus ownership.** Focus validates the original cell/row/table/wrapper path, and core rejects a block root moved beyond its original shell before the plugin callback. Rejected focus preserves the foreign textarea's selection and next trusted input. Supported layout wrappers and hidden-field disclosure continue to work.

The recovered source also includes the prior renderer repairs, structural host preservation, immutable event-publication work and the immutable Carousel dependency pin. Their original checkpoints keep their own tested sources and narrower claims.

## Differential scope and count audit

The selected corpus has **65 distinct cases across all 21 registered built-in block types**. It exercises default/populated construction, detached and mounted output, read-only round trips, declared-field native edits, Undo/Redo and disposal where applicable. Empty or noneditable cases retain their explicit not-applicable phases; no fabricated editable field is introduced.

| Source | Observations | Raw failed observations | Classified historical differences | Unexpected failures |
| --- | ---: | ---: | ---: | ---: |
| v1 | 11,258 | 1,156 | 1,156 | 0 |
| Specification baseline | 8,043 | 183 | 183 | 0 |
| Current candidate | **11,434** | **0** | **0** | **0** |

The specification baseline retains **21 incomplete cases** and one known classified Embed error. Historical unsupported capabilities and error-channel records remain explicit in the raw results. The candidate has no incomplete case, classifier exemption, unexpected error or page error. This bounded differential does not establish complete parity for every one of the 209 preservation obligations.

The earlier `run-2Zb0Ur` candidate produced 11,458 observations. The current fixture hash is identical. Exactly six conditional `personRetiredFieldsLeaveCanonical`, `personRetiredFieldsLeaveHistory` and `personRetiredFieldsLeaveSelection` observations at Undo/Redo no longer apply in each of four Person cases because those fields remain mounted. The other observation identities, all 65 cases, completed phases and trusted-event sequences are unchanged. `observation-count-audit.json` records the exact comparison; no fixture assertion was removed to lower the count.

## Performance interpretation

The structural-authoring experiment compares the source immediately before the Table descriptor cache (`14cc4fd2`) with the final candidate. It uses identical fixture/dependency bytes, small 2×2 and large 20×20 tables, **5 warmups and 21 paired, alternating samples**. Twenty functional controls and four deliberately failing controls establish that the exercised paths and their failure detectors work. Performance runs were isolated from other browser/performance workloads.

| Large Table measurement | Baseline p50 / p95, ms | Candidate p50 / p95, ms |
| --- | ---: | ---: |
| Public edit, synchronous | 62.4 / 74.2 | 59.9 / 88.6 |
| Public edit, notification delivery | 66.6 / 81.4 | 61.9 / 90.7 |
| Public edit, two animation frames | 83.9 / 99.9 | 83.2 / 100.4 |
| Native edit, synchronous | 89.2 / 100.5 | 82.4 / 100.7 |
| Native edit, notification delivery | 94.1 / 106.2 | 85.6 / 104.5 |
| Native edit, two animation frames | 120.5 / 136.8 | 108.6 / 125.0 |

Sampled allocation bytes for the large public sequence fall from **50,333,476 to 33,413,128**, and for the native sequence from **61,033,108 to 42,273,660**. These V8 samples cover edit/Undo/Redo/reset/oracle sequences; they are neither exact resident-memory measurements nor exact per-edit allocations. Two animation frames measure a rendering opportunity, without proving that a paint occurred.

The descriptor microproof records **40,000 → 400 distinct descriptors** and **100 → 1 arrays** over 100 queries of the unchanged large Table, while retaining mutation/invalidation controls. Bounded memory checks record zero retained released objects across 1,008 WeakRef observations per source/shape, with positive live controls. These controls do not prove the absence of every possible leak.

The public-edit p95 worsens, and small-table measurements are mixed. The large public path is faster in only **10/21 pairs**, with a median paired difference of **+0.2 ms**; its marginal p50 does not establish a stable speedup. The timing candidate includes both descriptor reuse and the subsequent focus repair. **Full C09/T15 acceptance remains open**. `performance-summary.json` gives the complete small/large measurement table and caveats; `table-performance-results.json.gz` retains all sampled values, source metadata and memory results. Trace/profile file hashes are retained, but the large raw trace files are not part of this compact checkpoint.

## Historical failures and remaining work

The [earlier combined attempt](../continuation-65-integration/README.md) remains **failed**: its differential passed, but its full browser command stopped at three Gallery failures. The repairs above were verified in the separate new run; the old failure is not relabeled.

`earlier-run-u0HNzY/` preserves an additional failed attempt caused by an incorrectly inherited Vite CLI wrapper in the unit bundle-budget check. The final supervisor scopes that wrapper to the browser command. The failure record is retained, and no product assertion was weakened.

The never-opened inactive Person tab still exposes literal inline-widget tokens in its label until the name field is opened. Its actual RED proof and positive hydration control remain in [the Person checkpoint](../person-rich-field-preservation/README.md). Solving this requires a supported way to derive inactive labels without acquiring hidden widget lifetimes or introducing plugin-specific sidecar decoding.

Other remaining obligations include B-HTML/B-STYLE, full structural performance acceptance, detailed plugin actions, and wider browser/platform/differential coverage. B-PRESENTATION is already settled in the specification. This checkpoint accepts the stated common templates and scoped repairs; it does not mark the whole refactor or complete v1 parity finished.
