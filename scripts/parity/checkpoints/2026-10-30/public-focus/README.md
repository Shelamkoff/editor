# Public focus coordinates and first-request completion

This checkpoint supports the seven explicit current-API obligations `FOCUS_VALUES_OFFSET_1` through `FOCUS_VALUES_OFFSET_6` and `DEFECT_FIRST_FOCUS`. It records the original exact-source run and a fresh run after integrating the continuation. It makes no production change and does not accept `PUBLIC_SELECTION` as a whole.

## Sources and outcomes

The original candidate is `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13`, tree `baf06b081131d14f80501fd930f0a55ff02293df`. Its raw output is `initial/result.json.gz`.

The fresh integrated candidate is `a7dc4172198dea9c641f5de41d4331e5a94a17b4`, tree `500d124440261953986dac14afa51d444f35ac5c`. Its raw output is `integrated/result.json.gz`; the command's original source/exit/hash metadata is retained in `integrated/scoped-manifest.json.gz`. That supervisor confirms unchanged source. Each focus run has the same outcomes below; overlapping counts are not added.

| Source | Executed cases | Observations | Raw failures | Unsupported obligations |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 1 real public-focus/native-navigation control | 20 | 1 | 7 keyed/numeric API rows |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 7 | 147 | 8 | 0 |
| Candidate, each recorded source | 7 | 147 | **0** | 0 |

All executed cases complete focus, native input, keyboard Undo, keyboard Redo and destruction. Neither run has a page or server error; both stderr files are empty. The raw command exits **1** because historical failures remain failures. No classifier, candidate exception or unsupported-as-pass conversion changes the raw results.

Environment: Node `v24.22.1`, Chromium `156.0.8078.79`, Linux. These are functional observations, not a performance measurement or wider platform acceptance.

## Verified behavior

The six already-focused Paragraph cases use `Alpha` and request the following offsets through the real public `editor.blocks.focus` API:

| Requested value | Expected logical offset | Obligation |
| --- | ---: | --- |
| `2` | 2 | `FOCUS_VALUES_OFFSET_1` |
| `2.9` | 2 | `FOCUS_VALUES_OFFSET_2` |
| `-2` | 0 | `FOCUS_VALUES_OFFSET_3` |
| `1000` | 5 | `FOCUS_VALUES_OFFSET_4` |
| `start` | 0 | `FOCUS_VALUES_OFFSET_5` |
| `end` | 5 | `FOCUS_VALUES_OFFSET_6` |

`DEFECT_FIRST_FOCUS` begins in block `a`, then requests block `b`'s `Bravo` field at offset 2 once. The call must return true, publish `b` as current only with its settled selection, and leave the collapsed caret at the requested boundary. A trusted typed `X` must produce `BrXavo`. One keyboard Undo restores `Bravo` and offset 2; one Redo restores `BrXavo` and offset 3.

All seven current cases verify the real result, current block, owned anchor/focus offsets, collapsed selection, event timing, unchanged author records/history during focus, and immutable caller input. Subsequent native input and its single Undo/Redo prove that the requested position is usable for editing, rather than merely reported as an offset.

## v1 capability boundary and retained improvements

v1 exposes `editor.blocks.getBlockById(id).focus()`. Its public `Block.focus()` takes no target or numeric offset, focuses the first editable/focusable element, and returns no boolean acknowledgment. It does not expose the newer keyed/numeric `editor.blocks.focus` command. The runner verifies that absence and marks the seven newer API obligations **UNSUPPORTED** for v1. It never supplies an adapter that implements the missing command or invents its return value.

The separate v1 control uses its actual public block focus, then real `Home`, `ArrowRight`, `ArrowRight`, native typing and keyboard Undo/Redo. It completes all 20 observations. Its only failure is the known loss of the field-owned caret after Undo; the data and history observations pass.

The specification baseline implements the newer API and passes all six coordinate cases. Its eight failures occur only in the first request to another block: it returns false, publishes offset 0, types `XBravo`, and replays offsets 0/1 instead of 2/3. The candidate completes that first request correctly. These old defects are preserved as evidence; the improved behavior remains the intended result.

The acceptance recommendation therefore concerns seven specified **new/current API contracts and repairs**, with the v1 capability limit explicit. It is not a claim of seven direct API matches with v1. Preserving useful improvements is compatible with functional preservation; reproducing the older caret defects is unnecessary.

## Independent review and reproduction

`review.py` reconstructs all expected records, insertion positions, selections, event states and history values from fixed `Alpha`/`Bravo` fixtures independently of the JavaScript runner. It verifies every actual value against either the intended behavior or the exact recorded historical defect. It leaves all original verdicts intact. Each saved review confirms:

- **314** independently reconstructed expectations and recomputed verdicts, with no mismatch.
- **271** production-module hash records checked against the pinned Git objects.
- **14** loaded dependency-file hashes and **8** dependency versions checked.
- Complete expected case/phase coverage, including all seven explicit v1 unsupported entries.

The runner was recorded separately by SHA-256 for the original production source; it was later published as `scripts/parity/public-focus.mjs` in `132b59923de9bc6b1f3b3f73ba48c6d1f040826a`. Its bytes exactly match both raw runs and `runner.mjs.gz`:

```text
c8e5936367c8e1fe9b548857c9418595de718076958ad37d48a73e82a50dda96
```

Reproduce the non-browser review from this checkpoint directory:

```sh
python review.py --repo /path/to/editor
python review.py --repo /path/to/editor \
  --raw integrated/result.json.gz \
  --candidate a7dc4172198dea9c641f5de41d4331e5a94a17b4
```

To rerun the browser comparison, use a clean checkout at the recorded integrated candidate and select that source explicitly:

```sh
EDITOR_CANDIDATE_SHA=a7dc4172198dea9c641f5de41d4331e5a94a17b4 \
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/public-focus.mjs
```

The repository must contain the pinned Git objects and normal installed dependencies. `artifact-hashes.json` covers the archived raw outputs, original runner, supervisor manifest, review script and both review reports, including decoded hashes for gzip payloads. General selection, rich/atomic fields, hidden fields, IME, other browsers and the remaining preservation obligations retain their separate proof requirements. Combined integration validation is recorded by the parent continuation checkpoint.
