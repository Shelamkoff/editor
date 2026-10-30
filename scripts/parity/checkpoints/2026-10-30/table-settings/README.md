# Table row, column and heading controls

This checkpoint supplies the detailed proof for `BLOCK_TABLE_ROWS_COLUMNS` and `BLOCK_TABLE_HEADINGS`. The production Table implementation is unchanged from `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13`. The changes add an exact-source differential fixture and register the same 14 cases with the existing native browser suite.

## Source and results

The completed runs use `5e3bdd7cd5b73c8652a819d07c6b51cf2335f8df`, tree `879703e368085f2483d80dd4a9a34045a91b0baa`. Production modules are served directly from immutable Git objects. The fixture and runner are independently hashed; the runner rejects a fixture that differs from its committed source or a tracked source change during execution.

| Source | Cases | Observations | Raw failures | Incomplete cases | Page errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 14 | 1,210 | 38 | 0 | 0 |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 14 | 1,346 | 0 | 0 | 0 |
| Candidate `5e3bdd7cd5b73c8652a819d07c6b51cf2335f8df` | 14 | 1,346 | 0 | 0 | 0 |

There are no server errors. The raw differential exits **1**, retaining the historical failures. `candidatePass` is true; no classifier or candidate exception changes any verdict. The native `Table ` filter passes **41 cases**, including the 14 new cases and their existing neighboring Table controls. The four Table unit files pass **15 tests**, with no failure or skip. These overlapping suites are reported separately.

Environment: Linux x64, Node `v24.22.1`, Chromium `156.0.8078.79`. This is functional evidence, not a performance benchmark or a claim about other browser engines.

## Executed contract

The first ten cases execute every existing Table settings action on a fixed populated 2×2 table, starting both with and without a heading row: Toggle header, Add row, Delete row, Add column and Delete column. The original cells include bold, italic, strikethrough, an entity, and real Mention/Color widgets with fixed sidecar records. Each case types a trusted `X` before clicking the actual settings controls. The expected cell grid is derived from the specified operation and fixed author data; it is not copied from the observed result.

Each populated action checks canonical text and formatting, the heading flag, exact sidecars, block identity, editor TH/TD tags, and renderer THEAD/TBODY structure and cell content. The current API additionally checks stable surviving row/cell IDs, nonempty unique added IDs and completed transaction counts. Unaffected surviving hosts remain connected, and operations that do not replace TD/TH hosts retain their existing widget roots. Header conversion changes the first row's tag while preserving its authored identity and content.

Two cases attempt to delete the sole row or sole column of a headed 1×1 table. The current disabled menu item deliberately uses `pointer-events: none`; the fixture sends a real mouse click at its visible location and verifies the allowed menu hit, without pretending the disabled element received the event. The document and history remain unchanged. The older enabled-looking control is exercised through its own real native hit and must produce the same no-op. The improved disabled UI is retained.

Two further cases delete a row or column whose last cell contains additional real Mention/Color occurrences. Their now-unreferenced sidecars are removed, the surviving occurrences stay intact, and Undo restores the exact removed text, marks, references and payloads. Redo removes them again. These controls cover both the visible cell data and the associated canonical records.

Every real setting action remains separate from the preceding native input. Two trusted keyboard Undo gestures restore first the typed table, then the original table, leaving no further undoable action. Two Redo gestures reproduce the exact typed and final records, including the generated structural identities. The minimum-grid no-ops have only the native input action, so they require one Undo and one Redo. Exact caret position is checked after input, input Undo and input Redo. Caller-owned input remains unchanged; the Mention search provider is never invoked.

The post-menu check requires focus to remain within the editor, or within its still-open menu for a disabled no-op. The fixture then focuses the first field's end identically for all sources before the history sequence, so historical focus loss does not prevent the independent history proof. It does **not** claim an exact post-menu return-to-field caret contract. The actual field/caret snapshots are retained in every phase.

A retained menu item is invoked after the completed positive replay. It must not change canonical data or history; the minimum-grid item is also invoked after read-only revokes its menu. Running this negative last prevents a historical stale-control defect from corrupting the positive operation/history observations.

## Historical differences and retained improvements

All 38 final v1 differences have exact, narrow meanings:

- Fourteen `settings.focusInsideEditor` observations are false after the old menu action. The current and specification-baseline results are true.
- Twelve `undo-input.nativeCaret` observations have no focused Table field or owned endpoints. The expected collapsed caret is at logical offset 14.
- Twelve `redo-input.nativeCaret` observations have the same missing focus/endpoints. The expected collapsed caret is at logical offset 15.

Every final v1 data, formatting, sidecar, structure, rendering and positive history observation passes. Its two 1×1 no-op input replay cases preserve the caret and therefore add no caret failure. There is no requirement to reintroduce the old focus defects. v1's table format has no row/cell IDs; the test-only adapter translates `content: string[][]` to the same cell meaning while the new identity contract is checked on sources that actually expose it.

An earlier isolated header experiment also proves that v1's retained item can run immediately after its menu closes. That raw failure is preserved in `attempts/header-probe.json.gz`. It originally contaminated the later positive history sequence, so the final proof moves the negative after the complete replay. The current source passed that earlier immediate-retirement control as well. The final acceptance uses the unconfounded final run and does not combine counts across experiments.

## Evidence and reproduction

`manifest.json` identifies the source, run results, scope and excluded attempts. `artifact-hashes.json` records compressed and decoded SHA-256 values and byte lengths for every archived payload. Review recomputed all **3,902** final verdicts with zero mismatch and verified **485** production-module hashes plus **64** loaded dependency-file hashes.

The separately executed `independent-review.json.gz` and its original `independent-review.py.gz` also reconstruct **282 phase states** from fixed grids, heading values, known and generated identities, sidecars, history counts and renderer structure. The reviewer recommends accepting only the two named rows after integration. Its successful audit means the raw evidence and its interpretation agree; the 38 v1 failures remain failures. The original review script retains the review checkout path as an explicit local input.

`sources/` contains full-index binary patches from the reachable implementation base for all five isolated fixture revisions. Each was applied to a fresh temporary index, and its reconstructed tree exactly matched its recorded Git tree. These patches retain the initial experiments even if their isolated commits are not reachable after integration. They change only test/runner files; no production patch is hidden in the comparison.

Reproduce from a checkout containing the final fixture:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/table-settings-parity.mjs

EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Table ' \
node tests/browser/physical-history.mjs

node --test plugins/table/*.test.js
```

The first command records its own candidate HEAD and returns the raw historical exit code described above. The immutable v1 and specification-baseline objects must be available in the repository. Installed dependencies must expose their normal public ESM entries. Optional `EDITOR_TABLE_SETTINGS_FILTER` is for investigation; the final proof has no filter.

The initial experiment incorrectly expected an unsupported `<u>` element and missed stopped click propagation; it is a fixture error, not product RED. A later experiment treated a deliberately disabled item as a directly hittable target; its two incomplete minimum cases are retained explicitly. Neither experiment weakens the final valid-input oracle.

## Acceptance boundary

This evidence supports acceptance of the two named detailed Table rows for the executed supported controls and recorded environment, subject to combined integration verification. It does not accept `BLOCK_TABLE_CELLS`, `BLOCK_TABLE_KEYBOARD`, `BLOCK_TABLE_PASTE_CONVERT`, general toolbar lifetime, every external structural update, wider platform behavior or whole-library parity. The earlier common Table roundtrip proof remains separate. No `B-HTML`, `B-STYLE` or complete `C09`/`T15` decision is changed.
