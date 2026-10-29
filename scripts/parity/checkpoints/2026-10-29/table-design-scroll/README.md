# Table scroll viewport oracle and integrated verification checkpoint

The restored v1 Table default is a 3×3 grid. Its stylesheet is byte-identical at
v1 `5e5c7f8`, the specification baseline `e981ff3`, and the tested current source.
The wrapper has `overflow-x: auto`; cells have an 80 px minimum content width and
24 px horizontal padding. At a 288 px authoring width the table content is
316 px wide and scrolls by 28 px. The block itself remains 288 px wide.

## The observed failure and bounded correction

The original unfiltered Chrome 156 run reached the final native design page.
That page returned 82 PASS and two FAIL: Table at 288 px in light and dark themes.
The former generic field rectangle assertion required every column to be
simultaneously inside the block. `checkVisibility()` did not identify content
clipped by the table's scroll viewport.

The test-only correction preserves the strict outer block overflow assertion and
all non-Table field checks. Each actual Table cell must belong to the current
wrapper, whose horizontal overflow is `auto` and whose bounds remain inside the
block. The fixture scrolls that cell into view, applies the original field bounds
assertion, and verifies a center-point hit on the cell. The two existing narrow
Table cases additionally type `X` through trusted native input in the last cell,
then verify exactly one Undo/Redo, canonical data/IDs, caret offsets 1→0→1 and all
nine cell host identities. The page still declares exactly 84 cases.

No Table default, stylesheet, editor runtime, history semantics or runner timeout
was changed by this correction.

## Actual evidence

| Run | Source/result | Scope |
| --- | --- | --- |
| `run-60Px2b` | clean `cb12753c`; failed | Both checkJs, installed-package/build, all 1,967 unit tests including seven declaration consumers, and docs/source smoke passed. The built-docs gate rejected two untranslated Russian prose terms. Later gates were not run. |
| `run-a7le5n` | clean `c6536976`; failed | After the exact two-line documentation correction, built docs passed (127 pages, zero broken links/assets) and all 36 ordinary pages passed. Full native reached its last page, which returned Table 2 FAIL/82 PASS. Heap remained not-run in this run. |
| `run-8ufAZs` | clean `c6536976`; passed | Existing heap gate: 23 destroyed-instance sentinels, zero retained. The live history eviction proof preserves cases 11/12 and frees evicted cases after releasing the public snapshot control. |
| `run-wlLqUM` | clean `c6536976`; passed | Sixteen geometry/state controls at 640/288 px and both themes; eight use trusted last-cell input plus exact Undo/Redo and caret/host preservation. |
| `run-pkkDyg` | clean `c6536976`; passed | Four clipping controls: at x=313 beyond block right=308, normal clipping hits BODY. With deliberate overflow-visible, the same point hits the exact third-column TD and outer scrollWidth grows to316. |
| `run-hUtuME` | `c6536976` plus the recorded one-file test patch; passed | Complete native design page84/84, source unchanged throughout. The source was truthfully recorded as dirty with a fixed patch hash, then committed without changing bytes. |

`run-zBCkKZ` is excluded from product evidence: the scratch probe incorrectly
sent Alt+Ctrl for Redo. The corrected Shift+Ctrl probe is the accepted proof.
`run-IoCKso` is supplemental: an unrelated visual grid left a scrollbar, producing
actual widths625/273. Its16 controls passed, but the final run hides that grid and
measures the intended640/288 widths.

## Full-native and reporting limits

The failed unfiltered run printed34 completed native helper pages with1,776 PASS
results before the final design page. Six earlier native arrays and the initial
physical/history scenarios had completed, but the runner does not emit its final
aggregate JSON after a failed page. Therefore this checkpoint does **not** claim
a complete native case count or full-native PASS. The failed trace remains failed;
a targeted84 PASS and an independent heap PASS do not relabel it.

The original temporary report parser also mishandled ordinary string summaries.
Its output is preserved unchanged. The corrected parser was run offline against
copies of the same logs; no gates were rerun for that report correction. The
computed summaries still report `accepted: false` for both failed runs. Historical
native parser controls demonstrate format validation only, not current runtime
acceptance.

## Reproduction and provenance

`manifest.json` lists the tested commits/trees, every archived file and both its
stored and raw SHA-256. Raw C11 logs are losslessly gzip-compressed. The actual C11
commands, environment and before/after source identities remain in their original
manifests. `docs-only-continuation.patch` is the exact two-line source difference
between the first two integrated runs. The test patch contains only
`tests/browser/native-plugin-design.js`.

The frozen diagnostic scripts retain the exact absolute checkout path used by the
recorded execution: `/tmp/rector-completion-integration-20261029`. Restore the named
source at that path (or explicitly record an adapted diagnostic copy), set
`EDITOR_CHROME_PATH` to a real Chrome156 executable, and run the corresponding
script. The standard targeted gate uses `EDITOR_NATIVE_PAGE=native-plugin-design.html`
with `node tests/browser/physical-history.mjs`. No filter is set. The actual
unfiltered runner command is recorded in `run-a7le5n/manifest.json`.

This checkpoint covers the integrated completion/geometry source and the bounded
Table test correction. Later Person, Gallery and rich Image parity work is outside
these source identities.
