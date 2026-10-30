# Native page budget recovery

## Problem and diagnosis

The original full native run `run-yiPE1x` on `c6e537e5d7433f0d902749719c8af265c6ae8591` failed at the existing **120-second** deadline for `native-plugin-parity.html`. Its failure, source identity and original native log are preserved under `original-failure/`.

An external **diagnostic-only** observation, `run-8G2oM5`, retained the original assertions and observed beyond that deadline. At 120.035 seconds, 313 cases had passed and the next case was progressing normally. All 376 cases eventually passed at **130.307 seconds**. This extended observation is not acceptance evidence under the original deadline.

Diagnostic case timings were Code Copy ownership **12.286 s** for 10 cases, text block settings **17.399 s** for 21 cases and Columns layout **13.543 s** for 12 cases. Moving only Copy would have left about 118 seconds of page work. Moving both independent groups leaves about 87 seconds on the original page.

## Registration change

Commit `6c2a48d1ea4ebd0014bd2fb4573738db2c3593e6` adds `native-code-copy-ownership.html` and `native-plugin-settings.html`, removes their three existing module imports from the original page and registers both pages in the ordinary physical runner and its final JSON. All three regression modules, fixture assertions, real reset waits, harness code and the page deadline remain byte-identical. Each new HTML preserves all **24** original stylesheet links.

The default final JSON now has **43 native array groups and 46 top-level keys**, including the physical Enter/toolbox/history results. The exact group names are recorded in `verification.json`. Page selection uses the existing `EDITOR_NATIVE_PAGE` path, and case selection retains the existing `EDITOR_NATIVE_FILTER` behavior.

## Scoped acceptance on `6c2a48d1`

The ordinary `tests/browser/physical-history.mjs` runner passed all three pages with an empty case filter in C11 `run-uB8Pol`. No diagnostic runner or altered page deadline was used.

| Page | Passing cases | C11 command elapsed | Result |
|---|---:|---:|---|
| `native-code-copy-ownership.html` | 10 | 19.149 s | PASS |
| `native-plugin-settings.html` | 33 | 37.404 s | PASS |
| `native-plugin-parity.html` | 333 | 95.200 s | PASS |

The union is **376 cases: 333 + 10 + 33**. The exact multiset of case names equals the complete original diagnostic inventory, including multiplicities. Added cases: **0**; missing cases: **0**. This proves preserved registration without treating overlapping execution as additional coverage.

All three gates and the C11 aggregate passed with `sourceUnchanged: true`. Command elapsed values include Vite/Chrome startup and cleanup; they are distinct from the diagnostic page/case timings. `verification.json` records the unchanged deadline-function digest, module hashes, exact original and observed case-name lists, full summary-group inventory and all gate outcomes.

The detached supervisor ran persistently so an agent interruption would not stop the checks. Its source, launch metadata, raw logs and C11 manifest are archived. `hash-index.json` records stored and uncompressed hashes for every artifact except the index itself. This checkpoint contains scoped acceptance and coverage-preservation evidence; the separate full native run is owned by the integration gate.
