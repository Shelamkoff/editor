# 2026-10-31 continuation: selection capture, renderer publication and attachment metadata

## Scope and frozen source

This manual checkpoint records four published repairs and their bounded evidence.
It does not establish complete v1 parity, whole-refactor acceptance or release approval.
Useful current improvements remain the target when a historical implementation was defective.
Integrated verification has completed: all eleven gates pass on the unchanged frozen source.

- Repository and branch: `Shelamkoff/editor`, `refactor/rector-v2-architecture`.
- Frozen published source: `a7c77d1118f15f55b2cc54aae5c6a6e78881fe0e`.
- Frozen tree: `7130da73428c444edc6662d709a9f5264aee420c`.
- Integrated run: `test-results/run-3Avhty/manifest.json`, started `2026-10-31T10:19:45.723Z`.
- Initial source identity: `318ab123a8af00a9450af10ee605ef25169c15caff816dee52a04996382b3bba`.
- Initial checkout is clean; lockfile SHA-256: `91874afdcfbe533e607429bdaa3e0a4cbf9d671410831dbeb1d62d4d5d266382`.
- Environment: Linux x64, Node `v24.22.1`, npm `11.9.0`, Chrome `142.0.7444.175`.
- Browser executable: `EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome`.

Final run outcome: **passed**, finished `2026-10-31T10:42:19.538Z`. Whole-run source-after identity remains `318ab123a8af00a9450af10ee605ef25169c15caff816dee52a04996382b3bba`.
All eleven gates record exit 0, unchanged source and clean before/after snapshots.
The report was prepared outside the checkout during source freeze; only documentation changed after verification finished.

## Published slices

| Commit | Repair |
| --- | --- |
| [`34759438`](https://github.com/Shelamkoff/editor/commit/3475943853a73cfb25e2c91a0bc11a93b275c169) | Protect selection and bookmark capture before an admitted DOM edit. |
| [`52a944e9`](https://github.com/Shelamkoff/editor/commit/52a944e9414a6290e3b5061d55a3dfa99779c7ca) | Restore the total size in an Attaches variant-A group header. |
| [`1d2aa408`](https://github.com/Shelamkoff/editor/commit/1d2aa40823cb8990797e099489e72e01e507133a) | Revalidate new renderer blocks and wrappers before publishing ownership. |
| [`d37665be`](https://github.com/Shelamkoff/editor/commit/d37665be21eac8716398dd47ac25dba4a1902e50) | Protect early inline-widget selection capture without restricting its author producer. |

`a7c77d11` publishes the Attaches comparison fixture, immutable-source runner and historical-difference audit.
Each completed product slice was committed and pushed separately; the proof-source commit follows those repairs.

## Selection capture boundaries

An early selection capture can clear a stale cross-block selection and synchronously publish `selection:changed`.
Its observer previously borrowed idle mutation rights after the outer operation had already been admitted.
Host writes could create an unrelated history action, and a mode change could invalidate the outer producer.
Plugin-owned native-input selection getters expose the same DOM-edit boundary.

The DOM-edit repair enters the existing projection-edit guard before reading `metadata.selectionBefore` or capturing the selection.
A capture failure releases that guard without invoking projection recovery for an edit whose producer never started.
The inline repair wraps only its early capture in existing `prepareExtensionValue`; author composition still runs after that scope exits.
Healthy idle selection observers remain able to author; successful nested inline and host producers still form one Undo action.
Controls retain exact document restoration, native input focus/caret recovery and atomic producer-failure rollback.

| Completed slice proof | Baseline and result | Repaired result |
| --- | --- | --- |
| DOM-edit unit regression | `c3c8be4c`; 0 PASS / 1 intended FAIL | 1/1 focused PASS; 252/252 broader core tests. |
| DOM-edit actual DOM | `c3c8be4c` plus only final fixture/import; 115/118 PASS, three intended failures | Same fixture: 118/118 PASS. |
| Inline early-capture units | Source without inline repair; 1 PASS / 2 intended FAIL | 3/3 focused PASS; 255/255 broader core tests. |
| Inline actual DOM | `791efebf1fad2a61534d521eb1e357ba9d3afce6`, tree-equivalent to published `34759438`; 119/121 PASS | Same final fixture: 121/121 PASS. |

Both slice typecheck configurations passed. Root reviewed the core changes and their real selection-event controls before publication.
Actual-DOM evidence: `test-results/core-selection-{red,green}/` and `test-results/core-inline-selection-{red,green}/`.
RED files are `browser-runtime-contracts.html.json`; GREEN files are `browser.log`.
Sources: `core/DocumentRuntime.js`, its runtime/inline-read tests, and `tests/browser/regressions/dom-selection-capture.js`.
These counts belong to the independent slice runs and are not added to the integrated totals.

## Renderer provisional ownership

A later renderer or stylesheet callback could adopt an earlier staged block; the final commit could steal it back or accept incomplete output.
Connection callbacks can also move a pending or inserted block, or move the entire new wrapper to another parent/document.
The repair revalidates newly created blocks after final style acquisition, before insertion and after final connection callbacks.
Detached document rendering checks its wrapper before further append/return and verifies each block's direct parent and realm.
First `renderTo()` publication also validates the provisional wrapper's parent/document before accepting mounted ownership.

Failure retires each provisional resource once. Previously accepted output keeps its resource owners.
Rollback restores caller container content while leaving a foreign-adopted provisional wrapper and its children untouched.
A failed attempt permits a healthy retry; changed revisions retire their old result only after successful publication.
The additional checks are linear in newly created results and preserve unchanged revision reuse without deep payload reads.
Adoption of an already accepted reused wrapper remains outside this repair's declared scope.

- Initial staged-block Node comparison on unchanged `c3c8be4c`: ten intended failures with the final corrected staging fixture.
- Subsequent peer-review wrapper cases: two intended failures before the follow-up; one falsely accepted mount and one destructive rollback.
- Final targeted renderer suite: 122/122 PASS across six files, including 46 reentrancy tests.
- Final real-DOM fixture on `c3c8be4c`: 31 cases, 21 PASS / ten genuine failures.
- Identical real-DOM fixture with the complete repair: 31/31 PASS.
- The precommit GREEN checkout was based on `52a944e9` with the repair subsequently published as `1d2aa408`; it was not a pristine `52a944e9` result.

Independent core review found the whole-wrapper gap, then accepted the corrected guard/recovery branches and healthy reuse controls.
The ordinary page adds an isolated module; the existing frozen three-source lifecycle oracle was not edited.
Sources: `renderer/EditorRenderer.js`, `renderer/reentrancy.test.js`, `tests/browser/renderer-publication-ownership.js`, `tests/browser/renderer-lifetimes.html`.
Evidence: `test-results/continuation-2026-10-31-next/renderer-ownership-{node-red,browser-red,browser-green}.log` and corresponding browser result records.

## Attaches metadata and bounded comparison

The seven-line repair restores an existing v1 capability: sum accepted file sizes and display the result in the A-group header.
It creates presentation DOM only; it does not modify canonical metadata or create history.
The ordinary real-editor regression uses independent expected `2KB`, `4KB` and `3KB` values and checks updates, Undo/Redo, group/single transitions, modes and collapse.
With the same final `plugin-surfaces.js` fixture, unchanged `c3c8be4c` fails on the missing `2KB`; the repaired worktree passes.
That precommit GREEN was `c3c8be4c` plus the repair later published as `52a944e9`, not a pristine baseline result.
Independent review accepted the calculation, schema assumptions, exact metadata preservation and absence of presentation history.

The new 29-case corpus covers four variants, one/three files, no-op and changed variants, core settings, API reorder, native rename, Unicode/literal names and boundary spaces.
It checks exact metadata/order, stable current IDs, separate history, read-only/editable projections and renderer href/download names.
Eight v1 gaps are declared before execution: four absent core-settings actions and four absent public-update reorder actions.
Historical errors are never reclassified as unsupported. Current SPACE/NBSP preservation remains an improvement; historical trimming is not restored.

The corrected minimal-tree comparison (`de4c2e08b2a6d1bf4582f3a56038d81318c26798`) has 29 candidate cases / 2,967 observations, all PASS.
v1 retains 147 whitespace/history consequences; the specification baseline retains 54 missing summaries plus 112 whitespace consequences.
Raw differential exit remains 1; the separate exact-difference audit exits 0, with no candidate exceptions.
Final common-source comparison at `a7c77d11` completed `2026-10-31T10:21:05.247Z`: the same 29 cases / 2,967 observations all PASS, with no candidate errors, incomplete cases, unsupported cases or exceptions.
Independent read-only proof review confirmed exact candidate commit/tree, unchanged HEAD, all 166 loaded product hashes, raw counts and raw exit 1 / audit exit 0.
Pinned references remain v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`; their 147 / 166 failures are unchanged.
Fixture SHA-256: `ea94437f4cfcfb170b5493e46fa243cf63d205f5908d18e961b70bb7d7c74d59`; runner SHA-256: `70c7f72513ba95a350872a8ba59fd8a8be41cdcc0af6b5b8b3e41b11157dc667`.
Evidence: `test-results/attaches-names-variants/final-a7c77d11/{raw.json,audit.json,exit-status,audit.exit-status}`. The bounded proof has independent scoped acceptance.
`BLOCK_ATTACHES_NAMES_VARIANTS` is accepted within this bounded Chrome/Linux proof after independent review and the completed integrated verification. The other detailed Attaches rows remain open.

## Rejected fixtures and evidence discipline

A proposed late `renderer.styles` getter fixture was invalid: public registration captures that getter before rendering.
It was replaced by a real `head.appendChild` callback during late stylesheet acquisition; the corrected callback count and baseline RED were verified.
Initial Attaches control lookup lacked the shared locale labels; that incomplete attempt is excluded.
Whole-`save()` comparisons incorrectly included generated `time` values in both a group-size check and the first full comparison.
The corrected view-only oracle compares exact blocks/version/history, excluding only the generated query timestamp; names and metadata remain exact.
The first renderer-page wrapper did not map nested observations to the ordinary runner protocol; its unnamed failures are excluded in favor of the mapped final fixture.
Original rejected attempts and their nonzero exits remain local evidence; none is presented as a product failure or successful verification.
Generated reports stay in ignored `test-results` or CI artifacts, following `ARCHITECTURE.md`; this document is a manual account.

## Integrated verification snapshot

| Gate | Observed result in `run-3Avhty` | Evidence |
| --- | --- | --- |
| Unit | 2,151/2,151 PASS; no failures, cancellations, skips or TODOs | `unit.log` |
| Typecheck | Both production configurations PASS | `typecheck.log` |
| Build | PASS | `build.log` |
| Public type contracts | 7/7 PASS | `types.log` |
| Installed package | Bundler/NodeNext, Vite, ESM, external Chrome and 22 CSS assets PASS | `package.log` |
| Documentation contracts | README, plugin source/locale, documentation audit and smoke PASS | `docs.log` |
| Ordinary browser | 42 registered pages PASS, including `trusted-types.htm` | `browser.log` |
| Full native | 47 result groups / 2,683 cases PASS, plus separate physical typing/toolbox and history controls | `native.log` |
| Heap/resources | 23 sentinels / zero retained; history-eviction positive control and live Undo PASS | `heap.log` |
| Documentation site | 127 pages; zero broken links or missing assets; browser smoke PASS | `docs-site.log` |
| Attaches parity audit | PASS, exact historical differences retained; no candidate exceptions | `attaches-parity-audit.log` |

The ordinary browser count includes 41 `.html` pages and `trusted-types.htm`; the earlier interim count of 41 omitted the latter extension. The same header recount in the preceding `run-8lUEK4` confirms 42 pages there too; its manual summary and progress entry are corrected without changing its source, raw evidence or outcome. All 42 registered pages completed successfully, including the harness's intentional negative controls. The native total counts the 47 array-valued result groups only: 2,683 PASS. Its separate controls retain six Enter/formatting snapshots, eight toolbox/deletion snapshots, 14 named history cases and three public event names. The 41 later-page progress lines are only part of that native aggregate.

The history-eviction control authors 12 actions with 32 KiB payloads under a one-byte history budget. Its deliberately retained control survives eviction, is released after the explicit reference is dropped, and the live editor still reports current case 12 / Undo case 11. These are bounded resource checks; the 23 sentinel result does not claim every possible leak is excluded.

## Reproduction and remaining acceptance

Use a fresh checkout at the frozen commit, `npm ci`, and an available Chrome executable; leave page/case filters unset for full gates.
First reproduce the frozen Attaches raw comparison using the commands in [its detailed checkpoint](../attaches-names-variants/README.md), preserving its expected raw exit 1 and separate audit exit 0. Then record the integration commands in a fresh manifest:

```sh
export EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome
export EDITOR_RESULTS_DIR="$(node scripts/verification-results.mjs init unit typecheck build types package docs browser native heap docs-site attaches-parity-audit)"
node scripts/verification-results.mjs run unit -- npm test
node scripts/verification-results.mjs run typecheck -- npm run typecheck
node scripts/verification-results.mjs run build -- npm run build
node scripts/verification-results.mjs run types -- npm run test:types
node scripts/verification-results.mjs run package -- npm run test:package
node scripts/verification-results.mjs run docs -- npm run test:docs
node scripts/verification-results.mjs run browser -- node tests/browser/run.mjs
node scripts/verification-results.mjs run native -- node tests/browser/physical-history.mjs
node scripts/verification-results.mjs run heap -- node tests/browser/heap-gate.mjs
node scripts/verification-results.mjs run docs-site -- npm run docs:check
node scripts/verification-results.mjs run attaches-parity-audit -- node scripts/parity/attaches-names-variants-audit.mjs test-results/attaches-names-variants/final-a7c77d11/raw.json
node scripts/verification-results.mjs finish
```

Use the actual executable path on a different machine. A gate failure is retained in its own log and final manifest; do not overwrite or relabel a failed run.
Focused pages use `EDITOR_BROWSER_PAGE=runtime-contracts.html`, `renderer-lifetimes.html` or `plugin-surfaces.html` with `node tests/browser/run.mjs`.
For RED, copy only the final fixture/registration into the stated isolated baseline and retain the actual nonzero result.

Preserve raw runner and audit exit statuses separately; historical failures intentionally make the raw comparison nonzero.
The register now contains 209 unique obligations: **63 accepted / 146 open**. Only `BLOCK_ATTACHES_NAMES_VARIANTS` changes status in this continuation. These are proof obligations, not bug counts or a completion percentage.
B-HTML/B-STYLE, full C09/T15, attachment source/download/lifetime rows and remaining detailed/platform cases are not closed here.
