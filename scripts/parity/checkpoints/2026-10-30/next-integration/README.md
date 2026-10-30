# Person, Gallery, CSS and canonical reads — 2026-10-30

This checkpoint records the completed continuation from `e99fec9d`: three reproduced user-visible defects repaired, redundant canonical copies removed, and one further detailed Gallery preservation obligation accepted. The current register contains **36 accepted / 173 open** obligations and retains all **209 unique IDs**. These are proof obligations, not a bug count or a completion percentage. Complete v1 parity and whole-library acceptance remain open.

## Exact source and verification

- C11 run: **`run-sWvJG9`**, all eight planned gates **PASS**, with unchanged source identity for every command and the whole run.
- Original tested local commit: `b2d9e46fc1a856aadb4aff072425fb09a7aff721`.
- Published exact-tree counterpart: [`9925c80584e17214013791a4e8ed1791c7e02080`](https://github.com/Shelamkoff/editor/commit/9925c80584e17214013791a4e8ed1791c7e02080).
- Exact tree: `ab58ba3cc14e05982a365f83e5a6f0305c086058`.
- The production integration is local `8d2e37d0c0f7989b5abc6aea03ba722f5dd960e5`, published [`5eb0abec1df5be70ff42576f78bf2d2e1ce5ff03`](https://github.com/Shelamkoff/editor/commit/5eb0abec1df5be70ff42576f78bf2d2e1ce5ff03), tree `e004d9901c3a33e992bfdf27391ded765a3b3229`. The tested source adds only the CSS evidence archive to that production source.
- Environment: Linux x64, Node 24.22.1, npm 11.9.0, Chrome 156.0.8078.47.
- References remain pinned at v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`.

Git Data publication verifies each complete tree before creating its corresponding commit, then updates the branch with an expected-head comparison. Different commit metadata produces different commit IDs; matching trees establish source equivalence, not a second test execution. `source-tree-mappings.json` preserves this continuation's code and validated documentation source mappings. Earlier checkpoints retain their own immutable sources and outcomes.

| Check | Recorded result |
| --- | --- |
| Unit suite | **2,031/2,031 PASS**, zero failures or skips |
| Source typechecks | Both configurations PASS |
| Package build | 285 runtime declarations, zero source diagnostics |
| Declaration consumers | 7/7 PASS |
| Installed package | Dependency integrity, offline installation, Bundler/NodeNext, Vite, native imports, external browser and 22 CSS assets PASS |
| Common three-source differential | 65 cases across all 21 built-in block types; candidate **11,434/11,434 observations PASS** |
| Detailed Gallery three-source differential | Six cases; candidate **378/378 observations PASS** |
| Ordinary browsers | **38/38 pages PASS**, including the new CSS and Trusted Types pages |
| Physical/native browsers | **41 groups / 2,256/2,256 PASS**; counted once from the final aggregate, not repeated progress markers |
| Heap/resource controls | 23 sentinels, zero retained; all three history release phases and live Undo 12 → 11 control PASS |

The integrated native plugin page has **248/248 PASS**, including the newly combined Person and Gallery cases; native core behavior has **67/67 PASS**. Those integrated counts do not rewrite the earlier isolated Gallery 241-case full run or its separate six-case extension. The original commands, environments, full compressed logs, source identities and outcomes are preserved under `run-sWvJG9/`, with artifact hashes and a compact summary.

## Changes exercised together

**Gallery keyboard history after drag.** A real image swap focused a caption that the subsequent structural projection removed. Keyboard Undo/Redo then went outside the editor. The drop handler now focuses the retained Gallery wrapper before updating the image order. Real trusted drag, caption input and two separate Undo/Redo steps verify the repair. Pinned v1 passes the original literal swap case; this was a demonstrated regression. [Gallery evidence](../gallery-caption-order-evidence/README.md) preserves its original RED, successful runs and the later detailed comparison.

**Never-opened Person names.** Person now derives labels for unmounted name fields through `context.getFieldText(fieldKey)` and the optional pure inline-definition `toText(data)` formatter. Specification §16.8 defines capture, synchronous results, owned immutable input, original-owner validation, prospective records, existing recovery and sidecar-only update delivery. The shared rich-text scanner preserves literal/unknown references and decodes entities once. No hidden widget/provider lifetime is acquired. The active label continues to use completed author DOM through `afterProjection`. [Person evidence](../person-field-text/README.md) retains the initial RED and generic third-party, lifecycle, history, mode, failure and native-input controls.

**Inline CSS grammar.** The sanitizer and canonicalizer use the owning element's CSS declaration block. Valid custom-property names containing `expression`, comments with semicolons, escaped property names, priorities and duplicate precedence are retained correctly. The three-property allowlist remains unchanged. Pending shorthand longhands without serializable values are omitted. Native typing/history, renderer appearance, a foreign owning document, resource-observation controls and Trusted Types pass. [CSS evidence](../inline-style-grammar/README.md) retains exploratory failures, final positive runs and the final oracle run against the original implementations. This is a bounded preservation repair, not acceptance of general CSS confinement or all C06 requirements.

**Internal canonical reads.** `DocumentRuntime.update()` and projection synchronization use existing private `peek()`/`has()` reads where no ownership boundary is crossed. Producers still receive detached mutable snapshots; partial updates retain detached data before schema callbacks. Retained mutations, nested updates, falsy failures, no-op behavior and history are checked. No cache, alternate authority or production counter was introduced.

## Differential interpretation

| Corpus/source | Cases | Observations | Raw failed observations | Unexpected failures/errors |
| --- | ---: | ---: | ---: | ---: |
| Common v1 | 65 | 11,258 | 1,156 | 0 |
| Common specification baseline | 65 | 8,043 | 183 | 0 |
| Common candidate | 65 | 11,434 | 0 | 0 |
| Gallery v1 | 6 | 336 | 123 | 0 |
| Gallery specification baseline | 6 | 378 | 101 | 0 |
| Gallery candidate | 6 | 378 | 0 | 0 |

Only captured historical differences are classified. The candidate has no exception, incomplete case, unexpected failure or page/server error in either corpus. The common specification baseline retains its 21 incomplete cases; it is not reported as fully passing. The Gallery classifiers distinguish unsupported v1 rich/widget caption capabilities from actual historical defects, including lost keyboard history. Four paired baseline error reports remain explicit. The candidate's literal/rich/widget × swap/remove cases check fixed IDs, distinct image URLs, captions, sidecar deletion/restoration, neighbors, caller input and provider silence.

Only `BLOCK_GALLERY_CAPTION_ORDER` receives new scoped acceptance. Step buttons, last-item and overflow variants, broader caret/range behavior and other Gallery rows remain outside that proof. The Person repair closes its reproduced never-opened-label defect; it does not accept all detailed Person capability rows.

## Performance: less copying, no established latency improvement

The [new Table comparison](../next-core-integration/README.md) separates the isolated core mechanism (`e99fec9d` → `4dcbffeb`) from the whole integrated source (`e99fec9d` → `8d2e37d0`). It uses a 20×20 Table, five warmups and 21 paired samples with alternating source order in a quiet window. All 14 functional/sensitivity controls pass.

| Synchronous operation | Baseline p50 / p95, ms | Integrated candidate p50 / p95, ms | Faster pairs |
| --- | ---: | ---: | ---: |
| Public edit | 64.6 / 81.7 | 65.3 / 93.0 | 9/21 |
| Native edit | 74.4 / 100.3 | 73.5 / 88.7 | 10/21 |
| Empty no-op | 26.8 / 32.0 | 25.7 / 49.8 | 12/21 |
| Equal-data no-op | 27.0 / 32.6 | 26.8 / 30.8 | 12/21 |

The public p95 is 13.8% worse; empty-no-op p95 is 55.6% worse. Median paired deltas for public/native edits are +0.3/+0.9 ms. These samples do not establish a stable latency win. Deterministic headless work drops by 844 JSON-record visits for a large public/projection edit; real browser public/native counters drop by 862 visits and two structured-payload traversals, with unchanged DOM counters.

Sampled V8 allocations for full edit/Undo/Redo/reset/oracle sequences fall by 9.6% for public edits and 5.1% for native edits, while the empty-no-op sample rises by 17.1%. These are statistical allocation samples, not exact per-edit bytes or RAM usage. Both bounded retention cases report zero retained released objects over 1,008 WeakRef observations with positive live controls; they do not prove the absence of every leak. The checkpoint preserves exact paired arrays, original compressed results and source/profile hashes; large trace/profile files are explicitly omitted. **Full C09/T15 acceptance remains open.**

## Remaining scope

B-HTML/B-STYLE confinement and preservation decisions, detailed plugin actions, complete structural performance acceptance and broader browser/platform coverage remain open. This run uses Chrome 156 on Linux; earlier sources retain their own Chrome 142 evidence. No whole-library or cross-platform parity is inferred from the completed bounded corpora.

The later publication documentation and archive commits change no production behavior. Their completed documentation verification is recorded below.

## Final documentation validation

**`run-OjMZrE` passes all three gates** on unchanged local `d38d84f1fad9a0242c3af4bac59cc55539592b7b`, published exact-tree counterpart [`accfd5726e9435b497874bfad36cdcf5e09a6341`](https://github.com/Shelamkoff/editor/commit/accfd5726e9435b497874bfad36cdcf5e09a6341), tree `ff76ccf5ff6b06538baa4d3f96dfa119d1bda100`. Completion: `2026-10-30T08:45:01.108Z`. Package/README build, `npm run test:docs` and `npm run docs:check` all pass. The full manifests/logs and rendered-site observations are retained under `documentation/`; source comparison confirms that changes after the code verification are documentation/evidence only.

The failed documentation runs `run-oTlMzN`, `run-SfXrAc`, `run-UvzzqM` and `run-Ykk6Lb` remain failed. The first three identify untranslated widget names in the Person README, the inline README, and untranslated prose in the Gallery preservation/review sections. The route follow-up also retains the four rejected relative guide cross-links. Corrections translate the prose, check every Russian Markdown source, and use the established absolute guide routes without weakening any validator. These failures do not relabel the separate successful code verification.
