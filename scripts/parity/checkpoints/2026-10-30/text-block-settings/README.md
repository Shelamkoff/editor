# Heading levels and List styles

This checkpoint supports the two detailed preservation rows `BLOCK_HEADING_LEVELS` and `BLOCK_LIST_STYLES`. It adds no production change. The final exact-source comparison uses `d483be745b0bc00f40a89b823a12f993f1ae21f8`, whose tree is identical to published `220d4553b6d72396fddaeb15aa426a2f779c1744`. The implementation remains the one at `69c8425e0081fde69cf5176ccb73d032720c15fc`.

## Final evidence

The completed JSON was recorded on 2026-10-30, 17:20:39–17:21:25 UTC, with Node 24.22.1 and Chrome 156.0.8078.79 on Linux x64. It contains all 21 case records without a filter.

| Source | Executed cases | Unsupported | Observations | Raw FAIL | Page-error events | Incomplete |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d` | 17 | 4 | 1,691 | 29 | 0 | 0 |
| Spec baseline `e981ff30` | 21 | 0 | 2,323 | 185 | 10 | 0 |
| Candidate `d483be74` | 21 | 0 | 2,323 | 0 | 0 | 0 |

There are no server errors. Candidate completion and `candidatePass: true` are present in the complete raw JSON. **The final shell exit was not retained:** the wait collecting the process outcome was interrupted. The committed runner requires exit 1 for these historical failures/page errors, so the manifest records `runnerExpectedExitCode: 1` and `actualShellExitCode: null`. This archive does not turn that expected code into an observed process result.

The 10 spec-baseline page errors appear both globally and with case/phase attribution. The audit verifies that these are the **same 10 events**, not 20. They are Heading settings/inline failures with the message “Inline widget root left its projection boundary before hydration.” The rejected operation causes later history/output assertions to fail too; 185 failed observations do not mean 185 independent defects. No exception or classifier changes those raw verdicts.

v1's 29 failures comprise 11 native-caret observations, eight selected-range observations, and **10 retired-control observations**: five `readOnlyUnchanged` plus five `canonicalUnchanged`. The latter concern its retained H2 toolbox item and the four List cases. These defects do not define behavior to restore.

Four v1 cases are explicitly unsupported because its real toolbox exposes a single default H2 item. No adapter fabricates direct H3–H6 toolbox choices. Its settings and inline controls genuinely execute all H2–H6 levels.

## Executed scope

Heading covers every H2–H6 target through settings, inline level controls and toolbox creation, plus same-level no-ops through settings and inline controls. List covers both populated ordered/unordered transitions and both same-style no-ops. Fixed author records contain bold/italic text, an entity, real Mention and Color occurrences, exact sidecars, a fixed block ID and current stable List item IDs.

Each supported case types a native `X`, then clicks the actual visible controls. Expected documents and markup are derived from fixed author input and the named operation. The checks cover canonical text/marks/settings, sidecars and identity/order, editor and renderer tags/fields, unique new toolbox IDs, caller input immutability and zero Mention-provider calls. Native input and control clicks are also observed as trusted events hitting their intended targets.

Changed settings or toolbox creation produce one action separate from the preceding input. Two native Undo and two Redo gestures restore the exact typed, initial and final records. Same-setting no-ops add no action and require only the input Undo/Redo. Inline controls retain forward/backward selected ranges, and new toolbox headings receive a collapsed caret at their start.

The fixture records the post-menu caret and then **explicitly refocuses the first field before keyboard history**. It accepts focus within the editor after settings, not an exact settings-menu return caret. Changed settings place the caret at zero in both v1 and candidate; current no-ops improve on v1 by preserving the existing caret. Exact general selection or menu lifetime acceptance is not inferred from these rows.

After positive replay, retained settings/inline buttons choose the opposite setting, making an unauthorized write observable. Retained toolbox controls would add another block. The fixture invokes them during read-only and again after returning to editable, requiring unchanged canonical data/history and no completed action. These synthetic negative invocations are distinct from the trusted positive user gestures.

## Earlier runs and source preservation

`early/differential-99157b4d.json.gz` belongs to the earlier committed fixture `99157b4d`: candidate 2,302 observations / zero failures; v1 1,674 / 20 failures; spec 2,302 / 185 failures with 10 global page errors. Its retired-control choices were not consistently decisive and page-error attribution was only global. It is superseded and is not added to final acceptance totals. The earlier process exit 1 was reported in the retained task transcript; it is not embedded in the JSON.

`early/native-unversioned.log.gz` reports 21 PASS but predates the final fixture and has no immutable source metadata. It is retained as a diagnostic only, with no assigned SHA. It does **not** prove the final registered CDP wrapper. The later integrated focused result is recorded separately in [sixth-integration](../sixth-integration/README.md); its source and outcome do not replace this comparison's attribution.

| Original commit | Published equivalent | Shared tree |
| --- | --- | --- |
| `99157b4dbf450b3ad25639bd570b02995aa960c7` | `e5829ca7635b2f1bce61ced0e1f7bdb2e55552ee` | `c6f8fecefc610cf23a79a844e191dd34d43e5e71` |
| `d483be745b0bc00f40a89b823a12f993f1ae21f8` | `220d4553b6d72396fddaeb15aa426a2f779c1744` | `0d1eb6ee624e8b943cec91c33a50b893d3839b25` |

`sources/` preserves both original raw commit objects, full-index binary patches from the implementation base, and the verified publication map. The GitHub commit API assigned different commit metadata; messages, trees and mapped parent relationships are preserved. The audit validates the raw object SHA-1 and published tree/message/parent equivalence. It can verify source file hashes through the reachable equivalent trees even if the original local commit objects are absent.

To restore the two original commit objects in a checkout that contains the published history, run from this checkpoint directory:

```sh
gzip -dc sources/99157b4d.commit.gz | git hash-object -t commit -w --stdin
gzip -dc sources/d483be74.commit.gz | git hash-object -t commit -w --stdin
```

## Reproducible audit

`artifact-hashes.json` records compressed/decoded byte lengths and SHA-256 for all 10 gzip payloads. Plain documentation, manifest, audit source and result are pinned by their archival Git commit.

The read-only [audit.py](audit.py) independently recomputes all **6,337 final verdicts** with zero mismatch, checks all case inventories and completed phases, and compares 5,449 fixture expected values against fixed author-data/operation oracles. It reconstructs all **139 candidate phase documents** independently. It verifies 499 source-file hash records, 64 loaded dependency-file hashes, committed fixture/runner hashes, native gestures and unsupported/incomplete/error accounting.

The superseded run receives the same integrity checks separately: 6,278 verdicts, 389 recorded phase snapshots, 139 independently reconstructed candidate documents, 499 source-file hash records and 64 dependency-file hashes. Counts across the two runs overlap and are not separate capability coverage. Audit success means the records and interpretation agree; historical failures remain failures.

Run from the repository root with the recorded dependencies installed:

```sh
python scripts/parity/checkpoints/2026-10-30/text-block-settings/audit.py
```

The script accepts `--repo /path/to/checkout --dependency-root /path/to/node_modules` for an isolated checkout. It writes its result to stdout and does not alter Git objects, sources or evidence. [audit-result.json](audit-result.json) is the retained successful execution.

Re-run the native comparison from a checkout of the final original source or its published identical tree:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/text-block-settings.mjs
```

The new run records its own source and environment; historical failures still require a nonzero differential outcome. The pinned v1/spec Git objects and public ESM dependency entries must be available.

## Acceptance boundary

This proof supports only the two named rows in the recorded environment, alongside the separately documented integration verification. It does not accept Heading rich paste or split/conversion, List item editing or partial conversion, general resource/selection lifetime, other engines/platforms or whole-library parity. No `B-HTML`, `B-STYLE` or complete structural `C09`/`T15` decision changes.
