# Checklist empty-item exit — 2026-10-30

## Scope and result

`BLOCK_CHECKLIST_EMPTY_EXIT`: Enter on an empty, BR-only or formatting-only sole/last item; a visible-markup and a real Mention/Color positive control; rich checked surviving items and adjacent paragraphs; one preceding native text edit; two distinct keyboard Undo and two Redo. The current implementation passes all eight cases without production changes.

The native regressions are `tests/browser/regressions/checklist-empty-exit-native.js`. The source-frozen `run-X2E06e` passed 8/8 on the `ebf128b1` production tree with the exact added test files recorded in `native-manifest.json`; the unchanged fixture was committed as `d70b318420afd105d311912110dd1caa44444d2c`. The final integration runs the committed tests again.

The three-source probe uses pinned Git bytes for every fetched source, fixed author records and native browser keys. Only version envelopes and historical item IDs differ between input adapters. It does not flatten rich text or widgets and never restores focus between history commands. Chromium 156.0.8078.47, Node 24.22.1, Linux x64.

| Source | Cases | Observations | Raw differences | Unreviewed differences |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 8 | 217 | 5 | 0 |
| Spec baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 8 | 222 | 35 | 0 |
| Candidate `d70b318420afd105d311912110dd1caa44444d2c` | 8 | 222 | 0 | 0 |

All sources finish all planned phases, with zero page/server errors and verified unchanged source files. The raw probe exits **1**, retaining every historical difference. Its raw outcome is not a passing all-source gate. `review.py` separately recognizes only the exact historical values below, recomputes every observation status, binds source labels and case metadata to pinned inputs, and reconstructs the original and edited author records independently of the raw result. It rejects changed historical observations and candidate mutations both with and without a changed status, and grants zero candidate exemptions.

## Historical differences

In v1, the three trailing-empty exits fail to restore the empty item caret on Undo; the two visible-content controls fail to restore the new item caret on Redo. Their complete canonical records and both keyboard history steps pass. These are historical defects, not limitations of the fixtures or behavior to reproduce.

The spec baseline does not perform the three trailing-empty exits (nine consequent observations each), and fails to split a widget-only item (eight consequent observations). The initial records and native text edit are independently checked against fixed author data. All 35 mismatches remain in the raw result; the review requires their exact phases, properties, actual values and expected values. It does not suppress errors by count alone.

## Reproduction and limits

`fixture.js` and `probe.mjs` are the exact bytes hashed by the raw result. The runner takes `EDITOR_CANDIDATE_ROOT`, `EDITOR_V1_ROOT`, `EDITOR_SPEC_BASELINE_ROOT`, `EDITOR_DEPENDENCIES_ROOT`, `EDITOR_CHROME_PATH` and `EDITOR_PLAYWRIGHT_PATH`. The candidate root must be at the recorded commit to reproduce this immutable checkpoint. Run `python review.py` here to verify the archived result and its negative controls.

This proves the named empty-exit row for these Chromium fixtures. It does not accept the separate Checklist item CRUD/merge/export rows, arbitrary cross-item selections, other engines, IME or read-only composition behavior. No production code was changed or speculative behavior added to achieve the result.

The review originally trusted PASS labels on otherwise passing observations. A negative control changed one candidate actual value to null while retaining PASS and was accepted. The checker now independently recomputes equality for every actual/expected pair, including absent JSON properties. Both candidate controls and both historical controls are rejected; the underlying browser observations and production source are unchanged.

A subsequent independent review found that a consistent change to the retained author's text throughout one baseline case still passed: historical expectations were derived from that case's raw `initialRecords.expected`. The new control first failed with `Review accepted an altered observation: spec-baseline-consistent-author-change`. The checker now constructs fixed original records from the pinned source label and case ID, checks `position`, `text`, `guard` and the legacy envelope, and validates both sides of the load/edit observations against those records. Historical edited/retained expectations derive only from that fixed input. All eight negative controls now reject, including the consistent author change with correct PASS statuses and three independent case-metadata mutations. The original 5/35 historical differences and zero candidate differences remain unchanged; no browser or production code was rerun or changed for this checker repair.
