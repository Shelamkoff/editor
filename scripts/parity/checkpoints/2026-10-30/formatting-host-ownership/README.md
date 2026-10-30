# Formatting ownership across editing hosts

## Result and source

The current Clear Formatting and Case Transform commands could change text or marks inside an independently owned nested `contenteditable="true"` when the selection crossed two outer fields. The single-field controls already respected that boundary. The repair preserves the intended author transformation and leaves the nested owner intact; it does not restore the older destructive behavior.

- Parent: `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13`.
- Implementation and initial regression commit: `4daa1e68`.
- Final implementation, fixtures and runner: `94304cc1764ce0b18f0227add598f67da5cf7dcd`.
- Final tree: `9969344bff02e74edcd673e971a2821b15585ce4`.
- Runtime: Node `v24.22.1`, Chromium `156.0.8078.79`, Linux x64.

The full-index `implementation-and-fixtures.patch.gz` applies to the parent in an isolated Git index and reconstructs the exact final tree. This was verified with `git read-tree`, `git apply --cached` and `git write-tree`. The patch preserves the original source even when integration uses cherry-picked commits. It does not recreate commit metadata or assert that an integration tree containing other work is identical.

## Change

The existing inline-content utilities now provide one discovery operation for the actual editing hosts owned by a formatting traversal. It discovers legitimate fields through a non-editable plugin shell, stops at the first actual field, and excludes controls and widget owners. A selection explicitly inside a nested host still operates on that host.

`collectTextTargets` walks each discovered host separately and retains both the original traversal-root restriction and clipped range boundaries. Case Transform uses this same collector instead of its separate common-ancestor walk. Clear Formatting already uses the collector. Link and authored-text normalization use the same host discovery, removing their duplicated discovery code. Link still treats complete widgets and line breaks as atoms. No core selection walker, public API, history owner or widget lifecycle changes.

## Reproduced defect and controls

The initial browser regression on unchanged parent production has two passing single-field controls and two failing cross-block cases. Case Transform changes the nested `<b>Nested</b> label` to `<b>NESTED</b> LABEL`; Clear Formatting removes the nested bold wrapper. Both controls pass after repair.

The final registered fixture contains 14 cases:

- Four original single-field/cross-block ownership cases for the two commands.
- Two positive controls which explicitly target the nested host and preserve the outer field.
- Eight actual native editor cases: both commands, Text and Element endpoints, and forward and backward selections. These preserve mixed marks, unselected partial text, an authored link, real Color sidecars and the live widget nodes. A preceding trusted insertion and the formatting operation undo and redo as two independent keyboard actions. Logical endpoints and direction are checked after Apply, Undo and Redo.

An early version of the eight native controls stopped before formatting because its expected input omitted the existing sanitizer's mandatory `rel="noopener noreferrer"`. The fixture input and literal expectations were corrected according to `shared/sanitize/walker.js`. `native-controls.log.gz` retains that setup-only failure; it is not counted as a product RED, and production did not change to accommodate it.

## Exact-source comparison

The final runner serves every production module from its exact Git object without source rewriting. Its public selection adapter supplies the same fixed selection extent to each version. This direct comparison checks DOM mutation ownership; it does not test historical bookmark implementation, native caret or history behavior.

| Source | Cases | Observations | Failed observations | Incomplete cases | Runtime/page/server errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d` | 10 | 70 | 30 | 0 | 0 |
| Specification baseline `e981ff30` | 10 | 70 | 5 | 0 | 0 |
| Parent `b856d85e` | 10 | 70 | 5 | 0 | 0 |
| Final `94304cc1` | 10 | 70 | 0 | 0 | 0 |

The parent and final runs use the same runner bytes. Parent failures are the two reproduced cross-block defects and the resulting nested-node identity loss. The additional v1 failures include changes to locked/native labels, toolbar formatting and case-direction selection influenced by non-author labels. The repaired candidate preserves those owners. The raw command exits 1 whenever any historical observation fails; no classifier or candidate exception converts that outcome into an all-source PASS.

The unchanged Link runner was repeated on the final source: 13 cases / 113 observations per source, final zero failures, v1 33 failures and specification baseline 27 failures, all complete and error-free. This protects the existing atomic-widget, line-break, partial-link and nested-host behavior while sharing host discovery.

All 113 loaded production-module hash records across the three final/parent comparison outputs, dependency-file hashes and runner hashes were independently checked against their recorded sources. All 759 observation verdicts were recomputed from their retained actual and expected values. Compressed and decoded artifact hashes are in `artifact-hashes.json`.

## Verification and limits

On unchanged final source `94304cc1`, the 14 focused native cases, 28 relevant unit tests and both source typecheck projects pass. The earlier broad native-tools run passed all 121 cases, including the 107 preceding cases and all 14 new cases. Two test-only positive controls were added during that run's startup, so this broad result is retained as pre-freeze corroboration, not an immutable final integration gate. The parent integration must identify its own frozen source and full-suite outcome.

The independent renderer-agent review also executed seven real-browser controls covering cross-block clipping, explicit traversal-root clipping and a nested host's own formatting. All pass, with zero page errors and unchanged production hashes. Its separate probe and raw result are retained in the neighboring [Code language checkpoint](../code-language-highlighting/README.md).

This checkpoint repairs a bounded ownership defect. It does not accept the complete `TOOL_CLEARFORMATTING_ACTION` or `TOOL_CASETRANSFORM_ACTION` preservation rows, infer historical native history equivalence, claim another browser's behavior, or settle the remaining presentation/performance gates.

## Reproduction

Set `EDITOR_CHROME_PATH` to the installed Chromium executable and `EDITOR_PLAYWRIGHT_PATH` to the Playwright ESM entry when it is outside the checkout. Use the final source above and the repository's pinned dependencies.

```sh
EDITOR_NATIVE_PAGE=native-tools.html EDITOR_NATIVE_FILTER='owned tool' node tests/browser/physical-history.mjs
node --test inline-tools/*.test.js shared/textOffset.surrogate.test.js
npm run typecheck
node scripts/parity/formatting-host-ownership.mjs
EDITOR_CANDIDATE_SHA=b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13 node scripts/parity/formatting-host-ownership.mjs
node scripts/parity/link-owned-formatting.mjs
```

The last three commands retain exit code 1 for recorded historical contract failures. Inspect candidate verdicts, completion and errors independently; do not suppress or relabel the raw result.
