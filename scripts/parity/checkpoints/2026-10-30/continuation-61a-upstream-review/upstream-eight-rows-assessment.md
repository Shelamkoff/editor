# Independent bounded review of upstream acceptance

Reviewed upstream source: `414c6af17e9ec8bab4bde6ac0026e653bb1ed9ab`.
Previous fetched source: `0cceb84eceeb6299f2338ac4798ff40e9aa36ec8`.
This is a read-only review of committed fixtures and retained evidence, not another browser execution.

## Conclusion

The eight newly accepted preservation rows match the executed fixed corpora and their recorded limits. No missing observable required by those eight bounded rows was found. The register retains 209 unique IDs, with exactly eight changes from open to accepted: **54 accepted / 155 open**. This does not accept neighboring detailed rows or establish whole-library parity.

| Rows | Directly inspected proof | Boundaries that remain outside acceptance |
| --- | --- | --- |
| `BLOCK_HEADING_LEVELS`, `BLOCK_LIST_STYLES` | `tests/browser/text-block-settings-parity-fixture.js`: all H2–H6 through settings/inline/toolbox, both list styles and no-ops, fixed rich text and real Mention/Color records, IDs/order, editor/renderer tags and markup, a separate trusted input followed by one settings action and exact native history; decisive alternative retained controls. | Exact post-settings-menu caret is recorded but not generally asserted; first-field refocus before history is explicit. Four v1 higher-level toolbox entries are unsupported. Heading paste/split/conversion and List item editing/partial conversion are separate. |
| `BLOCK_COLUMNS_LAYOUTS`, `BLOCK_COLUMNS_NO_LOSS_REDUCE` | `tests/browser/columns-layout-parity-fixture.js`: four direct/menu layouts, actual positive width ratios in editor/renderer, three→two→three with fixed rich fields and six real sidecars, correct BR/no-BR empty controls, stable surviving and replayed generated IDs, separate actions, exact replay and decisive inactive menu controls. | Six v1 settings-menu cases are unsupported. Exact post-menu caret and independent field editing/formatting/selection/conversion are not accepted. |
| `BLOCK_RAW_SOURCE`, `BLOCK_RAW_PREVIEW` | `tests/browser/raw-source-parity-fixture.js`: 12 literal source indentation and 9 preview/mode cases; native forward/backward selections, line boundaries, tabs/spaces/no-op, separate input/indentation history, mouse/keyboard toggle, initial and round-trip read-only, automatic preview, usable source focus/caret and no view/mode authoring. | Preview markup/frame checks do not establish navigation, media/layout/confinement or B-HTML/B-STYLE. Their corresponding rows remain open. |
| `TOOL_CASETRANSFORM_ACTION`, `TOOL_CLEARFORMATTING_ACTION` | `tests/browser/tool-actions-parity-fixture.js`: the full shared TOOL template with Text/Element boundaries in both directions, partial mixed marks, single field/cross-block/Quote fields, atomic-only controls, Unicode case width/context changes, canonical and live DOM/widget checks, separate native input/action history, canonical no-ops retaining Redo, and a retained destroyed button beside a valid editable successor with producer counters. | Valid DOM selection construction is explicit; it is not physical-drag evidence. Four v1 atomic-only toolbar actions and v2 transaction observations are unavailable in v1. Other tools and broader protected-widget-ancestor policies are not accepted. |

## Evidence integrity independently checked

`audit-upstream-eight-rows.py` completed with exit 0 and wrote `upstream-eight-rows-audit.json`:

- All **85 indexed archive payloads** match the committed compressed/plain and decoded SHA-256 values and sizes.
- All **23,382 saved verdicts** across the four three-source final comparisons were recomputed from their recorded actual and expected values; no contradiction was found.
- All **1,619 loaded production-file records** match the exact v1/spec source objects or the unchanged upstream production tree for the candidate.
- Each upstream fixture hash matches the corresponding original final raw report.
- The candidate corpora contain **102 cases / 8,696 observations**, zero failures, errors or unsupported cases; available planned-phase sequences match the completed sequences.
- The preservation ID set is unchanged, and exactly the eight named rows became accepted.

This integrity pass does not independently repeat the external browser process, recompute dependency readiness, or convert a historical failing assertion into a pass. The fixtures and their expected behavior were read directly for the semantic mapping above.

## Outcomes and limits retained

The final Heading/List JSON contains complete candidate results but no retained actual shell exit; the upstream archive correctly records that exit as unknown. Its specification-baseline report retains ten page-error events and 185 failed observations. The raw Columns, Raw and Tools processes retain exit 1 for historical failures and unsupported/unavailable historical UI; candidate success is reported separately.

The sixth integration archive attributes its focused **208 native cases** and both typechecks to source `24cc569c` / published identical tree `0cceb84e`, not to a fresh complete library run. Those cases overlap the comparisons and must not be added as independent feature coverage. The four later runner admission fixes reject empty/incomplete candidate evidence without rewriting the earlier raw reports. Wider browsers/platforms, IME, B-HTML, B-STYLE, complete structural C09/T15 and the remaining 155 obligations remain outside this acceptance.

Primary committed references inspected: `docs/architecture/rector-v2/PRESERVATION.md`, the sixth scoped section of `PUBLICATION_REVIEW.md`, and the `text-block-settings`, `columns-layouts`, `raw-source-preview`, `tool-actions`, and `sixth-integration` checkpoint directories at the exact upstream source above.
