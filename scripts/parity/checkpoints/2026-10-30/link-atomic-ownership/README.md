# Link atomic content and editing-host ownership — 2026-10-30

This checkpoint follows independent review of `bd9fa8a5`. It extends the
earlier `link-owned-formatting` evidence; the earlier six-case comparison and
eight-case focused fixture did not cover the defects described here.

Implementation commits:

- `4d1f666962aca917045cca76863b9950de42a222`: complete atomic occurrences and
  nested editing-host line breaks.
- `9fe66c88d1fcf6517e1308550bfb454c392548f8`: cross-block nested-host Text in
  detection, Unlink and Apply.

The main integration cherry-picks these as `318531dc` and `6f5f4ff5`.
The isolated source trees are retained through the reconstruction artifacts
documented in `../fourth-integration/isolated-sources/README.md`. The final
integrated gate is separate from this bounded checkpoint.

## Findings and correction

The first review found two distinct defects. Scanning every descendant `BR`
treated a nested editing host's link as outer author formatting. Conversely,
the Text-plus-BR candidate discovery introduced by `bd9fa8a5` missed an authored
link containing only a complete inline widget. The protected-descendant
unlinking path also retained the widget's outer authored link when ordinary
text shared that wrapper or the selection touched only part of that text.

The correction recognizes a complete widget between eligible external
boundaries as one atom. It removes the surrounding authored link while
preserving the exact widget root, internal anchor and descendant Text nodes.
The existing whole-link behavior for partial authored selections remains.
Locked descendants and native controls retain their own shared hyperlink.

Further review confirmed the same editing-host ownership defect for Text in
cross-block ranges: the common editor-root Text walker included a nested true
host. It could activate Unlink from a nested link, remove that link, or add
links to a nested host's previously unlinked text. Link now discovers actual
top-level editing fields and collects clipped Text targets separately within
each one. Detection, whole-link removal and Apply share that local collector;
atom traversal follows the same boundaries. The shared Text walker, editor
core, lifecycle contract and preservation register are unchanged.

## RED and GREEN evidence

| Stage | Observed result |
| --- | --- |
| Initial ownership review RED on `aba12c41` production | Five intended failures; the previous eight cases pass |
| Atomic and nested-BR correction | 13/13 focused cases pass |
| Cross-host public-tool RED on `4d1f6669` production | Two intended failures; the previous thirteen cases pass |
| Final focused fixture | 15/15 pass: twelve direct public-tool DOM cases and three genuine native editor cases |
| Existing inline-tool unit cases | 18/18 pass; no failures or skips |
| Both JavaScript source typecheck configurations | PASS |

The three native editor cases are a genuine Color occurrence's authored outer
link removal and two backward cross-block selections that Apply or remove
authored links beside plugin-owned controls. They exercise actual toolbar
actions and native keyboard Undo/Redo. The Color case retains its canonical
sidecar and mounted widget identity. The cross-block cases retain control
targets and directed selection. The two added cross-host Text tests use the
public tool and panel contracts with a controlled selection port/context;
they make no claim about native input, history, or admissibility of arbitrary
nested-host plugin lifecycles.

The final focused GREEN and typecheck runs used the production and fixture
bytes subsequently committed unchanged as `9fe66c88`. The final historical
comparison below serves committed sources directly. A complete native-tools
or full browser gate on the integrated tree is not asserted by these logs.

### Excluded fixture attempts

Two proposed native nested-host setups were invalid and remain separately
archived under `setup-attempts/`. Inserting nested controls in Paragraph's
initial field lost them during core rich-text projection. Inserting them in
`afterProjection` correctly raised `Field completion changed author content`.
Those attempts are setup/contract failures and are excluded from product RED,
GREEN and acceptance counts. No core requirement was relaxed to admit them.
The final cross-host RED uses two valid direct public-tool cases and fails for
the actual false-active/Unlink and nested-text Apply defects.

## Exact-source comparison

`scripts/parity/link-owned-formatting.mjs` serves every production module from
its exact Git object without transformation. The public test adapter supports
v1's `restoreSelection` callback and v2's current Range/mutation port. The raw
result records all loaded module hashes, shared dependency hashes, runner
hash, and stable HEAD/runner checks. There is no failure exemption classifier.

| Source | Cases | Observations | Raw failures | Execution/page/server errors |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 13 | 113 | 33 | 0 |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 13 | 113 | 27 | 0 |
| Candidate `9fe66c88` | 13 | 113 | 0 | 0 |

All cases complete. The raw runner exits **1** because historical failures
remain failures. Both historical sources remove the authored outer widget
wrapper, so retaining it was a candidate regression. v1 also removes inner
widget-owned anchors on complete selections; its six additional failures
record that historical ownership defect. Both historical sources fail the
nested editing-host BR and cross-block Text ownership controls. These defects
are corrected rather than preserved as desired behavior.

The intermediate eleven-case comparison at `4d1f6669` is also retained:
99 observations per source, candidate zero raw failures, v1 27 and
specification baseline 21. It predates the confirmed cross-host Text cases
and is not treated as evidence for those cases.

This evidence supports the listed DOM ownership and native actions. It does
not establish every Link action, platform or selection shape, execute a
historical native editor, or accept the entire `TOOL_LINK_ACTION` preservation
row.

## Reproduction

Use installed package dependencies, a supported Node version and Chromium.
The paths below are specific to this workspace.

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-link-owned-formatting.html \
node tests/browser/physical-history.mjs

npm run typecheck
node --test inline-tools/*.test.js

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
EDITOR_CANDIDATE_SHA=9fe66c88d1fcf6517e1308550bfb454c392548f8 \
node scripts/parity/link-owned-formatting.mjs
```

The focused fixture is imported by `native-tools.html`. Raw logs and JSON are
gzip-compressed; `manifest.json` records compressed/decoded SHA-256 hashes and
decoded byte counts. Browser: Chrome `156.0.8078.79`; Node `v24.22.1`.
