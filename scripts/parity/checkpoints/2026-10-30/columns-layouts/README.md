# Columns layouts and lossless reduction — 2026-10-30

## Recommendation and exact scope

The evidence supports accepting **`BLOCK_COLUMNS_LAYOUTS`** and **`BLOCK_COLUMNS_NO_LOSS_REDUCE`**, subject to the root integration gate. No production defect was found in this scope, so this work adds regression coverage and evidence without changing production code. It does not accept `BLOCK_COLUMNS_FIELDS` or claim complete v1 parity.

The final browser comparison ran on immutable candidate `b7ac66388e44999d794368cd00a99b4057d41083`, tree `b42df21e288c4bebfa7d5b1f4764814d215aa5a6`, from 17:22:48.758 to 17:23:22.863 UTC. Its production files are byte-identical to base `69c8425e0081fde69cf5176ccb73d032720c15fc`. Only the runner, shared fixture, native regression registration and one import differ from that base.

| Source | Executed cases | Unsupported cases | Observations | Raw failures |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 6 | 6 | 1,253 | 30 |
| specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 12 | 0 | 2,880 | 0 |
| candidate `b7ac66388e44999d794368cd00a99b4057d41083` | 12 | 0 | 2,880 | 0 |

All executed cases completed; all three sources had zero page errors and the source server had zero errors. The differential process exited **1**, preserving the historical failures. `candidatePass` is true. No exceptions or classifiers alter a raw verdict, and unsupported cases are not counted as passing observations.

## What was exercised

The six common scenarios use actual direct layout buttons. The same six scenarios also use the real v2 settings menu:

| Scenario | Initial layout | Native layout actions | Independent content expectation |
| --- | --- | --- | --- |
| Rich reduction to equal columns | `1-1-1` | `1-1`, then `1-1-1` | First stays intact; second receives `<br>` followed by the third; expansion creates an empty third |
| Rich reduction to wide right column | `1-1-1` | `1-2`, then `1-1-1` | Same exact content and widget order |
| Rich reduction to wide left column | `1-1-1` | `2-1`, then `1-1-1` | Same exact content and widget order |
| Expansion from two columns | `1-1` | `1-1-1` | Existing fields stay intact; the third is empty |
| Empty removed column | `1-1-1` | `1-2`, then `1-1-1` | No additional break or text is appended |
| Empty destination column | `1-1-1` | `2-1`, then `1-1-1` | Third-column content becomes the second without a leading break |

The authored fields are distinct bold Alpha, italic Bravo and struck-through Charlie, each with its own real Mention and Color widget. The oracle fixes six inline records and their exact tokens and order. Empty controls use the literal empty string; they do not claim coverage of every visually blank markup representation.

Every case starts with trusted native `X` input at the end of the first field. Each layout operation is then a separate completed action. The proof undoes every layout operation and the input individually, then redoes them individually. It checks exact canonical predecessor/final records, history availability and current transaction counts. It also checks immutable caller data and retained public snapshots.

At every saved phase, both editor and renderer must have the exact authored markup and widget records. All four track definitions and actual positive CSS widths must match the intended ratios within one CSS pixel. The surviving current IDs must remain `left` and `middle`; a newly expanded third column must have a fresh, nonempty, unique ID. Undo restores the original `right` ID, and Redo restores the same generated new ID. No v1 identities are invented: its data has only ordered column content.

The first field and its widgets stay mounted in current/spec after layout changes. Surviving field hosts, removed-host disconnection, block identity, sidecar records and provider silence are observed separately from the serialized text.

## Decisive control negatives and history bounds

After the complete positive replay, the menu negative retains an earlier menu node for a layout different from the final `1-1-1`. It enters read-only mode, returns to editable mode, confirms that the field is editable, and invokes that old node. The document, history and transaction count must remain unchanged. This cannot be satisfied merely by the read-only guard or an action that would already be a canonical no-op.

Direct layout buttons remain live in the current implementation. Their separate negative invokes a freshly queried, different-layout button while the editor is read-only. It verifies the existing read-only boundary; it is not presented as retirement of a still-live control.

Every source deliberately focuses the first field at its end before the history sequence. That makes the same native Undo/Redo gesture available even after the old v1 layout rebuild strands focus on the body. The loss of focus is recorded before this setup. **Exact post-menu caret placement is outside this proof.** Native input caret and its Undo/Redo endpoints are checked independently.

## Historical differences and retained improvements

The six v1 direct cases each have five raw failures: the first field is rebuilt, both surviving hosts are rebuilt, first-field widgets are rebuilt, focus leaves the editor after the layout action, and Undo of the initial input does not restore its first-field caret. These account for all 30 failures. Current and specification baseline retain their improved host/widget ownership and native history behavior.

The v1 Columns plugin has no settings-menu layout actions. Its six menu entries are explicitly `UNSUPPORTED`; the adapter never substitutes direct buttons for that surface. The common direct cases still exercise every historical layout control. Factory names, the versioned wire shape and renderer registration spelling are the only translations.

## Focused integration checks

- Native `native-plugin-parity.html`, filter `Columns `: **21/21 PASS**, exit 0 on final source `b7ac6638`. This includes all 12 new cases plus nine existing neighboring Columns cases.
- `node --test plugins/columns/*.test.js renderer/renderers/columns/*.test.js`: **11/11 PASS**, no skips or cancellations, exit 0 on `81041ed8`. Between that run and the final source, only the browser fixture negative changed; production and these unit tests are byte-identical.
- `recheck.py`: **7,013 verdicts** recomputed; **285 phase states** reconstructed from the fixed authored content, sidecars, IDs, layouts and separate history sequence; **489 production module records**, **64 dependency files** and **8 dependency versions** verified. It also checks actual editor/renderer markup and widths and the exact historical failure set. The audit result is retained as `recheck.json`.

The recheck script was authored by the fixture owner. It reconstructs expectations independently of the JavaScript fixture, but is not represented as a review by another person or agent. The root may append its own independent acceptance review after integration.

Environment: Node `v24.22.1`, Chrome `156.0.8078.79`, Linux x64. The raw artifact records exact dependencies and every served source hash. Source is served from pinned Git objects, not an implicitly changing working tree.

## Retained artifacts and reproduction

`layouts-final-differential.json.gz` and its empty stderr are the final raw comparison. `native-columns.log.gz` and `unit-columns.log.gz` retain the focused gates. `manifest.json` records sources, commands, observed exits, counts and bounds. `artifact-hashes.json` records both compressed and decoded payload hashes and sizes.

`probes/` retains two earlier successful current-source probes. The first covered one rich direct reduction, with 229 current observations and four v1 historical failures; the expanded probe covered all 12 cases before the decisive menu negative was strengthened. Neither is a production RED, and their overlapping observations must not be added to final coverage.

The three full-index binary patches in `sources/` reconstruct each exact test-source tree from the reachable base `69c8425e`. This preserves the evidence identity if the integration squashes the test commits. `recheck.py` can reconstruct the final tree in a temporary Git index when its original commit is absent; it does not alter the checkout.

To recheck the retained final artifact from a checkout with the recorded dependencies:

```sh
python scripts/parity/checkpoints/2026-10-30/columns-layouts/recheck.py --repo .
```

To rerun the browser comparison from a clean checkout of the recorded source:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/columns-layout-parity.mjs > columns-layouts.json 2> columns-layouts.stderr
```

Historical differences cause exit 1; inspect the per-source results and `candidatePass` rather than rewriting that exit. The shared current regression is also available through the existing native harness:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Columns ' \
node tests/browser/physical-history.mjs
```

This scope does not establish full independent field editing, formatting, selection or conversion, broader `BLOCK_COLUMNS_FIELDS`, IME, other browser engines, other platforms or complete end-to-end v1 parity.
