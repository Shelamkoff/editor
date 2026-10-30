# Fourth integration — 2026-10-30

**All 12 combined gates pass on unchanged source.** The original manifest and complete logs are retained in `run-Jd9HAT/`. `verification-summary.json` records counts, commands and source identities; `artifact-hashes.json` records the archived bytes and their compressed/decoded SHA-256 hashes.

## Source and environment

| Identity | Value |
| --- | --- |
| Starting branch source | `355577fce341e77bead7d69705744db724f1b79f` |
| Frozen implementation and registered fixtures | `6f5f4ff5205a25adfd00cef6d5b2279c068db633` |
| Complete tree | `cb4e9b2dd903177c946e93de97a95e5d41d9ec6a` |
| Combined run | `run-Jd9HAT` |
| Completed | `2026-10-30T15:32:34.280Z` |
| Runtime | Node `v24.22.1`, npm `11.9.0`, Chrome `156.0.8078.79`, Linux x64 |
| Publication at verification | Local only; automatic approval review rejected remote push. No published counterpart is asserted. |

All gates identify the same clean source. Dependency installation uses the existing lockfile; the source and dependency hashes are retained in the original manifests. Browser commands use `EDITOR_CHROME_PATH`; direct comparison runners additionally use `EDITOR_PLAYWRIGHT_PATH`. The common comparison resolves `EDITOR_V1_ROOT` and `EDITOR_SPEC_BASELINE_ROOT` to the pinned source checkouts. Raw comparisons share installed dependencies and do not claim a full historical package environment.

## Changes and scoped evidence

- [Compound rich fields and Toggle focus](../compound-rich-fields/README.md): canonical previous records preserve hydrated List/Checklist/Toggle/Spoiler fields; keyed focus can reveal closed Toggle content without authoring its open state.
- [Quote, Warning, Image and Embed](../compound-rich-sibling-projection/README.md): unchanged rich siblings, native caret/backward selection and mode round trips retain live fields and widgets.
- [Link ownership](../link-owned-formatting/README.md) and [independent-review corrections](../link-atomic-ownership/README.md): authored anchors are separated from controls and nested hosts; complete widget wrappers unlink without editing widget internals; cross-block Apply shares the host boundary.
- [Gallery resources and reader captions](../gallery-renderer-lifecycle-and-viewer/README.md): image notifications retire with their output, and grid/main/iframe labels use the same resolved plain caption.

The final Link fixture has twelve direct DOM cases and three native editor cases. The historical Link runner has thirteen direct public-tool cases; these are different scopes. No arbitrary nested-host plugin lifecycle or historical native caret/history acceptance is inferred.

## Completed combined verification

| Combined check | Recorded result |
| --- | --- |
| Unit tests | 2,031/2,031; zero failures, cancellations or skips |
| Checked JavaScript | Both source configurations pass |
| Build and external declarations | 285 declarations, zero source diagnostics; 7 declaration contracts pass |
| Installed package | Bundler, NodeNext, Vite and browser consumers pass; 22 CSS assets verified |
| Documentation contracts | README, source, localization and documentation audits pass |
| Ordinary browser pages | 38 pages pass |
| Native result matrix | 41 array groups / 2,339 cases pass; plugin parity 316, tools 107, core behavior 67 |
| Disposal and history eviction | 23 sentinels, 0 retained; all three eviction phases and live Undo control pass |
| Common differential corpus | 65 cases across 21 block types / 11,446 candidate observations; zero candidate failures or incomplete cases |
| Gallery caption/order differential | 6 cases / 378 candidate observations; zero candidate failures or incomplete cases |
| Documentation site | Build and both static/browser smoke checks pass |
| Source identity | All 12 gates and the complete run retain unchanged source |

The common corpus grows from 11,434 to 11,446 candidate observations because four existing `embedRetiredCaptionLeavesCanonical/History/Field/Selection` checks execute after Undo in each of the three populated Embed cases. All twelve pass. The runner/fixture hashes, case IDs and completed phases are unchanged; no overlapping run is added to the total. `observation-count-review.json` records the comparison.

Native counts come from the final aggregate once; `enterScenario`, `toolboxScenario` and `historyMatrix` objects remain in the raw output, and isolated runs are not added. Ordinary pages include their expected-status harness controls. Heap figures are disposal observations, not a new performance benchmark.

## Raw comparisons on the same frozen source

`scoped-comparisons/` retains the commands, full results and source hashes. All three commands exit **1** for preserved historical failures/incompleteness; none is labeled all-source PASS. The candidate has no failure, exception or incomplete case.

| Comparison | Candidate | Pinned v1 | Specification baseline |
| --- | --- | --- | --- |
| Link | 13 cases / 113 passing observations | 33 failures / 113 observations | 27 failures / 113 observations |
| Gallery viewer | 26 passing observations: 13 main + 13 iframe | Main: 3 failures / 13; iframe: 1 failure / 1, with 12 observations unexecuted | 4 failures / 13 in each realm |
| Toggle/Checklist controls | 2 cases / 120 passing observations | 2 failures / 120 | 16 failures / 120 |

Independent read-only review recomputed all 765 observation verdicts and failure lists, checked 623 module-hash records and 70 dependency-file hashes, and found no mismatch. Page/server/runtime errors are absent. Unsupported v1 rich Gallery captions and the incomplete iframe control retain their limitations. The common and Gallery caption/order corpus gates use their existing strict historical recognizers; the new raw comparisons add no recognizer or candidate exemption.

## Earlier attempts and source reconstruction

`first-integration/` retains all four completed gates from `run-8eMxkW` on `0a2a41c7`; those results belong to that earlier combined source. `interrupted-integration/` retains `run-NKp1Lt` on `3fbed38a`: six completed gates, an interrupted browser gate and three unexecuted later gates. It was stopped after independent Link review and is not converted into a passing run. The final full source was checked afresh.

The initial unprivileged unit command in `environment/` failed to complete subprocess-based tests under the sandbox. It is an environment/setup record, not a successful full test run. Invalid nested-host native fixture attempts are separately archived in the Link correction checkpoint; their mount/projection contract failures are not product RED evidence.

[Seven source reconstruction patches](isolated-sources/README.md) restore the exact isolated validation trees from the reachable starting source. Each passed a fresh temporary-index application and exact `write-tree` comparison. Their mappings identify incorporated changes without asserting complete integration-tree equality or restoring original commit metadata. This preserves reproducibility after temporary work branches disappear.

## Remaining acceptance boundaries

The register retains **209 unique obligations: 37 accepted / 172 open**. This continuation accepts no additional complete row. `B-HTML`, `B-STYLE`, structural `C09`/`T15`, detailed capability matrices and wider platform evidence remain open; `B-PRESENTATION` retains its already settled and implemented status. Open obligations are not a count of known bugs. This checkpoint supplies no new performance measurement or whole-library parity claim.

## Documentation validation attempts

The first documentation run, `run-gztFjC` on `6ed34140e9a2733d3ba821b2d001f1f78715aed4`, passed package build and documentation contracts. Its site gate failed the existing Russian-prose audit because the new translated section retained untranslated terms. The original failed manifest and logs remain in `documentation-attempts/`. The correction translates the new prose and fixes Russian number agreement without changing the validator, runtime, registered fixtures or historical sections. A fresh documentation run is recorded separately below.

Recorded comparison sources preserve their original hashed bytes. In particular, the compound checkpoint's `probe.mjs` retains its original trailing space on line 124; a whole-diff whitespace review reports that single formatting warning. This does not change any execution result or source identity.

