# Fifth integration — 2026-10-30

**Eleven original gates pass; the original combined run remains failed.** Its
documentation command exits 0 with successful build and smoke checks, but the
cleanliness gate rejects three generated untracked assets. After an exact
one-line `.gitignore` repair, all three documentation gates pass in a separate
run on its own unchanged source. This continuation fixes Code language
selection and formatting across independently owned editing fields, then
accepts two detailed Table rows and seven public-focus obligations.
Improved current behavior is retained; historical defects are recorded without
requiring the implementation to reproduce them.

## Source and publication

| Identity | Value |
| --- | --- |
| Tested source | `a7dc4172198dea9c641f5de41d4331e5a94a17b4` |
| Tested tree | `500d124440261953986dac14afa51d444f35ac5c` |
| Published counterpart | `0fbe8c78d3dcc14d8a619cc152f08d6343cb3952` |
| Combined run | `run-k1J3Tr` |
| Completed | `2026-10-30T16:36:36.123Z` |
| Separate documentation repair source | `369cf74e33f982eed78d5a8171e98b46e13f9fbb` |
| Documentation repair tree | `dccd6e5ca1d77ea087c1ec5ac5dc1589b6240c22` |
| Documentation repair published counterpart | `ae79a89c66c9b4b467e149dcaf45db2c99b0f617` |
| Documentation repair run | `run-0ehV77` |
| Environment | Node `v24.22.1`, npm `11.9.0`, Chrome `156.0.8078.79`, Linux x64 |

The published commit tree equals the tested local tree. [Publication mappings](../publication/README.md)
retain original raw commit objects and every original/published source pair.
The user explicitly authorized publication; this supersedes the earlier
publication blockage without relabeling any previous test run. The API changed
commit metadata, not code, tests or their recorded results.

The first publication batch contains 17 earlier commits. The second contains
the ten integrated Code/formatting/Table and evidence commits and ends at the
runtime source above. The later ignore-only housekeeping commit is mapped
separately to `ae79a89c66c9b4b467e149dcaf45db2c99b0f617`; it does not replace the runtime second-batch
identity. The source of every gate is recorded in its original manifest;
subsequent documentation and archive changes receive separate verification.

## Changes and accepted scope

- [Code language fallback](../code-language-highlighting/README.md): an explicit
  unsupported language keeps literal source and its language ID, as required by
  the current Code contract. `auto` and supported explicit languages retain
  highlighting. Default/shared renderer behavior is unchanged.
- [Formatting ownership](../formatting-host-ownership/README.md): CaseTransform
  and ClearFormatting no longer alter nested editing hosts in a cross-block
  selection. The existing shared target collector, Link and normalization use
  one host-discovery helper. Explicit selection inside a nested host remains
  editable. No additional core selection/history owner is introduced.
- [Table settings](../table-settings/README.md): existing row/column controls and
  headings pass 14 detailed cases, including minimum-size no-ops and deletion
  of widget-bearing cells. The Table implementation required no repair.
- [Public focus](../public-focus/README.md): six numeric/start/end coordinates
  and the first request to another block pass with native input and keyboard
  replay. The v1 keyed/numeric API is explicitly absent; its separate native
  navigation control is not presented as an implementation of that API.

Accepted rows are `BLOCK_TABLE_ROWS_COLUMNS`, `BLOCK_TABLE_HEADINGS`,
`FOCUS_VALUES_OFFSET_1`–`FOCUS_VALUES_OFFSET_6` and `DEFECT_FIRST_FOCUS`.
The unchanged register has **209 unique IDs: 46 accepted / 163 open**.
These count proof obligations, not known bugs or a completion percentage.
The full Code and tool-action rows remain open.

Table minimum-size controls use a headed 1×1 table. The fixture deliberately
refocuses the first field before keyboard history, so it does not claim an exact
caret immediately after the menu. Other Table actions, hidden/compound-field
focus, IME and wider platform coverage remain separate obligations.

## Completed combined validation

| Check | Recorded result |
| --- | --- |
| Unit tests | 2,031/2,031; no failures, cancellations or skips |
| Checked JavaScript | Both source configurations pass |
| Build and declarations | 285 declarations, zero diagnostics; 7 declaration contracts |
| Installed package | Bundler, NodeNext, Vite/browser consumers and 22 CSS assets pass |
| Documentation contracts | README, source, localization and documentation audits pass |
| Ordinary browser pages | 38 pass |
| Native result matrix | 41 array groups / 2,370 cases; plugin parity 333, tools 121 |
| Resources and history eviction | 23 disposal sentinels, zero retained; all eviction phases and live Undo pass |
| Common corpus | 65 cases / 11,446 candidate observations; no failures or incomplete cases |
| Gallery caption/order | 6 cases / 378 candidate observations; no failures or incomplete cases |
| Documentation site | Original command exits 0 with successful build and static/browser smoke; gate fails because three generated assets are untracked |
| Source identity | Original HEAD, tracked tree, patch and lock remain unchanged; its full source-cleanliness result is false |
| Separate documentation repair | Build, documentation contracts and documentation-site checks all pass on unchanged `369cf74e` |

The original `run-k1J3Tr` manifest remains `outcome: failed` and
`sourceUnchanged: false`; its documentation gate remains failed. The three
untracked files are `docs/.vitepress/.temp/editor.png`, `favicon.ico` and
`logo.svg`, with bytes matching the tracked public assets. The evidence does
not establish why those generated copies remained after the command.

The only tracked difference between the runtime source and `369cf74e33f982eed78d5a8171e98b46e13f9fbb`
is the addition of `docs/.vitepress/.temp/` to `.gitignore`. A recorded
`git diff --exit-code` excluding `.gitignore` is empty, so implementation,
tests and build source files are identical. The repair run `run-0ehV77`
passes all three gates with `sourceUnchanged: true`. The summary adds
`validationOutcome: passed` only after verifying those exact conditions; it
never rewrites the original failed outcome. The full native matrix was not
rerun for this ignore-only correction.

Native totals are counted once from the final aggregate. The initial
enter/toolbox/history objects and isolated runs are retained separately, never
added to the total. Resource figures are disposal evidence, not a new benchmark.

## Fresh comparisons on the same frozen source

All five raw commands exit **1** because historical defects retain their failed
verdicts. Every candidate case completes with zero failures, exceptions or page/
server errors: **47 cases / 1,862 observations** across these distinct suites.

| Comparison | Candidate | v1 | Specification baseline |
| --- | --- | --- | --- |
| Focus | 7 cases / 147 PASS | Separate public-focus/native control: 20 observations, 1 Undo-caret failure; 7 absent keyed/numeric capabilities explicitly unsupported | 147 observations, 8 failures in first focus |
| Table | 14 cases / 1,346 PASS | 1,210 observations, 38 historical focus/caret failures | 1,346 PASS |
| Code | 3 cases / 186 PASS | 186 observations, 8 caret/retired-provider failures | 186 observations, 12 unknown-language failures |
| Formatting ownership | 10 cases / 70 PASS | 70 observations, 30 ownership failures | 70 observations, 5 ownership failures |
| Link regression control | 13 cases / 113 PASS | 113 observations, 33 historical failures | 113 observations, 27 historical failures |

The Code runner also executes the exact published pre-fix tree: 186 observations
with 12 unknown-language failures. No new classifier or candidate exception is
introduced. Existing common/Gallery corpus historical recognizers are unchanged.

Independent review checks raw verdicts, complete execution/error channels and
the loaded module/dependency hashes. The dedicated acceptance review recomputes
4,216 Table/focus verdicts, reconstructs 282 Table phase states from fixed author
data and independently derives all 314 focus expectations. Publication review
restores all 17 original first-batch commits in a fresh object store containing
only the published history; trees and parent chains match exactly.

## Evidence and remaining work

`run-k1J3Tr/` retains the original combined manifest and complete logs.
`documentation-repair/` retains the separate `run-0ehV77` manifest/logs,
the exact housekeeping patch and the source-comparison proof.
`scoped-comparisons/`, `scoped-review/`, `acceptance-review/` and
`publication-review/` retain the raw results and independent checks.
`verification-summary.json` contains machine-readable counts and commands;
`artifact-hashes.json` covers archived and decoded bytes. The per-slice
checkpoints retain original RED/positive controls and distinguish fixture errors
from product failures.

`B-HTML`, `B-STYLE`, full structural `C09`/`T15`, the remaining detailed actions
and wider browser/platform acceptance remain open. `B-PRESENTATION` retains its
settled and implemented status. This checkpoint makes no whole-library parity
or new performance claim. Final documentation verification is recorded below
when completed on its own immutable source.

## Final documentation verification

The updated English/Russian review, preservation register, progress report and
archived evidence were committed as `ab81ae7983e1fd22e1fc7b5ce96b5643d089172f`, tree
`a82fadf7df2eebfdb8993de8671d5d4abad570d7`. Run `run-CgSk72` completed with **3/3 gates PASS**
(`build`, `docs-contracts`, `docs-site`) and unchanged source. Its exact published
counterpart is `6986b4db2804af6f02eaacd1dbd71d1a133e7dec`. The original manifest and
complete logs are retained in `final-documentation/run-CgSk72/`; the summary and
[publication mapping](../publication/source-map-reports.json) retain both source
identities. This documentation run is separate from the original full run and
its generated-output repair, and does not relabel either result.

The subsequent archive commit changes only checkpoint evidence and publication
metadata. It is not counted as an additional browser run or as acceptance of any
additional preservation requirement.

## Independent continuation-publication review

`publication-second-review/` retains the independently checked ten-commit
runtime/evidence batch and the one-line documentation-output repair, ending at
`ae79a89c`. All 11 original/published tree diffs are empty; ordered parents and
messages match. The review checks 43 explicitly uploaded blobs, 30 inline
content records and all 87 planned changes across 84 paths, reconstructing all
11 trees. In a fresh object store containing only the published history, all
11 original commit IDs were initially absent and were recovered exactly from
the retained raw objects; connectivity verification passed. The review records
the branch observation at that publication and does not claim to cover later
documentation commits.
