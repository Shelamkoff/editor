# Maintained differential verification inventory

This inventory covers the executable comparison entrypoints in `scripts/parity`, excluding historical checkpoint scripts. Execution awaits an explicit final combined source SHA and browser lane A. No production, fixture, classifier, or ledger change is part of this task.

## Comparison gates

| Gate | Maintained command after `node scripts/parity/` | Candidate cases | Prior observed duration | Source mechanism |
|---|---|---:|---:|---|
| common-parity | `block-roundtrip.mjs` | 65 | 155 s | Exact immutable filesystem roots, checked against Git bytes |
| gallery-parity | `gallery-caption-order.mjs` | 6 | 16 s | Exact immutable filesystem roots, checked against Git bytes |
| presentation-values | `presentation-values.mjs` | 11 | Not located | Exact immutable filesystem roots, checked against Git bytes |
| public-focus | `public-focus.mjs` | 7 | 3.3 s | Exact Git objects; v1 uses its separate public focus control |
| formatting-ownership | `formatting-host-ownership.mjs` | 10 | 1.3 s | Exact Git objects |
| link-ownership | `link-owned-formatting.mjs` | 13 | 2.0 s | Exact Git objects |
| gallery-viewer | `gallery-viewer-captions.mjs` | 2 | 9.4 s | Exact Git objects; main and iframe documents |
| code-languages | `code-language-highlighting.mjs` | 3 | 7.5 s | Exact Git objects; adds the pinned pre-fix source |
| text-block-settings | `text-block-settings.mjs` | 21 | Not located | Exact Git objects |
| table-settings | `table-settings-parity.mjs` | 14 | 26 s | Exact Git objects |
| columns-layout | `columns-layout-parity.mjs` | 12 | 34 s | Exact Git objects |
| tool-actions | `tool-actions.mjs` | 48 | 52 s | Exact Git objects |
| raw-source | `raw-source-preview.mjs` | 21 | 28 s | Exact Git objects |
| embed-preview | `verify-embed-preview-timeout.mjs` | 2 | New | Strict wrapper executes `embed-preview-timeout.mjs` once; exact Git objects |

Counts are scenario counts, with overlapping capabilities. They do not assert independent coverage rows or full historical support. Every entrypoint uses one Chromium process with pages sequenced inside it. All 14 comparison gates run sequentially on one browser lane.

The immutable references are v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`. Code additionally compares `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`. Candidate source is supplied only after root freezes the combined revision.

## Validators and supporting modules

`verify-gallery-caption-order-classifiers.mjs <raw-gallery-report.json>` is an additional offline gate. It validates the complete fresh Gallery report and exercises positive and negative classifier controls. It does not run another browser comparison.

`embed-preview-timeout-verification.mjs` is imported by the strict Embed wrapper. Its Node tests belong to the root unit gate. `embed-preview-timeout.mjs` is the wrapper's raw child and must not be counted or run twice.

The five modules ending in `-classifiers.mjs` are imports, not standalone comparison programs: Person, Carousel, Gallery roundtrip, Gallery caption ordering, and Link/Poll roundtrip. The three Markdown guides are documentation. Checkpoint executables are historical artifacts and are never executed by this supervisor.

## Environment and outputs

Each gate uses the final isolated worktree's physical `node_modules`, Chrome 156, and the installed Playwright runtime module. The two reference roots are immutable worktrees under the workspace `references` directory. Relevant filters are explicitly empty. No absolute historical `/tmp` dependency is used.

The supervisor records an explicit non-secret environment whitelist, committed runner and fixture hashes, dependency lock hashes, exact source revisions, raw gate logs, wrapper logs, and one sequential C11 manifest. Each comparator prints complete JSON. The strict Embed wrapper additionally preserves its raw child JSON and stderr with the child's actual exit status.

## Verdict policy

Raw command exit codes remain unchanged. A raw comparator that exits 1 because of reference failures produces a failed C11 gate and a failed aggregate C11 result. Candidate zero failures, source identity, observed phase completion, unsupported APIs, page errors, and infrastructure errors are reported separately.

For previously archived pinned-reference observations, a secondary read-only comparison checks exact source/case/phase/property/status/actual/expected signatures, including duplicate counts. A match is reported as reproduction of that archived observation, without modifying raw verdicts or granting an exception. Newly observed or different payloads remain open for review. No blanket historical error acceptance is used.

Common, Gallery, and presentation runners retain their existing bounded classifiers; their raw failed observations remain visible. The new Embed wrapper permits precisely four recorded historical failed observations, forbids candidate failures, and checks all six source/scenario pairs. Its raw child exit 1 remains in the saved report. Historical incomplete phases and unsupported APIs remain explicitly incomplete or unsupported even when an existing maintained classifier recognizes their cause.
