# Embed ROUNDTRIP evidence — 2026-10-29

This checkpoint preserves the completed four-case Embed slice and its final
42-case shared regression gates. It does not accept provider playback, URL
configuration, settings actions, all Image behavior, or full library parity.

## Source and integration identities

The executed frozen source is `4da6735f7e13f7456aba6f167dde714ad645010d`,
based on published `9ad09132584a2cedc26b6a3630a5b829d9b5ea49`.
The three exact runner, fixture and README files were subsequently integrated
as `6b80631fbbb46e973e1f8273b354ad1791d51c60`, over
`c2b084bd49b1d5a40528c114eaade15a839d7427`. This integration changes no
production file. The recorded gates ran on the frozen source, not on that
later integration commit with independent Gallery/CI changes.

`source.patch` reconstructs the executed runner/fixture bytes from the pinned
base. `manifest.json` records the exact file hashes, all three source identities,
loaded-file counts, Node/Chrome versions, commands, times and review scope.

## Actual final results

| Gate | Result |
| --- | --- |
| Three-source shared ROUNDTRIP | Exit 0; 42 cases per source; 102.573 seconds. |
| Current candidate | 7007/7007 observations; no failures, exceptions or page errors. |
| Native current ROUNDTRIP | Exit 0; 42/42 cases; 36.680 seconds. |
| Source integrity | Differential source and identity checks pass; native HEAD and all 1794 tracked files remain unchanged. |

The four Embed cases are actual default construction, a literal caption,
formatted Mention/Color widgets, and the corresponding unwrapped widget
control. Populated cases use a fixed Vimeo identity and a locally decoded
one-pixel cover with `resolvePreview:false`; no provider request or player
activation supplies the oracle. The empty default has a URL configuration
control but no declared caption field, so its edit/Undo/Redo phases are
explicitly not applicable. Populated cases execute real trusted input and
one native Undo/Redo, fixed canonical records/sidecars/neighbors, actual widgets,
renderer output, native selection, disposal and style cleanup.

### Reference results remain visible

The full v1 run retains 484 raw failures: 418 repaired historical observations
and 66 unsupported-reference observations. All 66 unsupported observations
belong to the two precise v1 Embed widget controls. The specification baseline
retains 24 raw failures and one global Redo error observed in both the window
and Playwright channels. Eleven baseline cases remain incomplete; incomplete
phases are not relabeled as passes. There are no unexpected failures/errors.

Within the four Embed cases, the current candidate passes 682/682 observations.
The v1 run has 104 raw failures: **66 unsupported widget-capability observations
and 38 repaired mode/history/focus observations**. The specification baseline
has one incomplete formatted-widget case and 11 exact unwrapped-Redo
differences. Its default and literal cases complete without exceptions.

Pinned v1 generic widget support does not imply Embed widget support: v1 Embed declares no `mapTextFields` hook, sets `inlineTools=false`,
and its public inline-insertion/load gates require that hook. Its documented
capabilities cover video/preview/settings. The two rich-widget inputs are
therefore retained current-capability controls, not evidence that v1 persistent
caption widgets passed or that all 104 v1 observations were repaired defects.
No adapter removes their sidecars.

The exact pageerror classification requires the pinned source, unwrapped Embed
case, Redo phase, error name/message, all ten stack frames, one report in each
raw channel, 11 unique exact failure vectors, all seven phases, full canonical
records, native owner and all three history observations. Classification runs
after the pages close; raw reports remain unchanged. Candidate errors,
duplicates, orphan reports and every other signature stay fatal. The recorded
offline checks include one positive and 21 rejecting mutations for this path,
plus all 116 captured Embed failure vectors with eight rejecting mutation
families for the ordinary classifier.

## Earlier attempts are not erased

- Two interrupted animation waits produced no completed result and receive no
  RED/PASS credit.
- The bounded animation diagnostic rejected after three seconds and captured
  a running decorative `oe-embed-pulse` with infinite iterations/end time in
  all three sources. The neighboring finite transition had finished. The
  harness now waits for finite animations; no timeout becomes PASS.
- The first finite raw run had 649/652 current observations. Its three failures
  were an invalid unconditional caption-host identity expectation. Existing
  Embed update semantics allow a genuinely changed caption occurrence to be
  replaced. The corrected oracle requires a stable wrapper, strict load/mode/
  native-edit identity, and exact retired-host inertness during changed-caption
  history. Canonical content, widgets, history and native selection stay strict.
- The corrected raw run passed 682/682 current observations before any Embed
  reference classification was added.
- The original full42 run remains **FAILED**, despite its current 7007/7007
  result, because the baseline global Redo error was then unclassified.
- The attribution-only raw run also remains FAILED: it captures the exact
  window/Playwright pair without suppressing the event. Only the reviewed
  signature and negative controls justify the later final successful gate.
- The original native42 proof on `d055dca1` is retained separately from the
  final native42 proof on `4da6735f`, after optional phase attribution changed
  the fixture.

## Stored evidence and replay

The six `.json.gz` files contain the original JSON bytes, compressed with a
fixed gzip timestamp. Their compressed and uncompressed hashes are recorded in
`manifest.json`. They include the successful full result, the original failed
full result, both focused raw attempts, the animation diagnostic and the
pageerror attribution. Native reports/log and offline classifier checks are
stored without transformation. The archived helper scripts retain their
original local paths; they are records of the executed checks.

For an exact source reconstruction, create an isolated checkout at
`9ad09132584a2cedc26b6a3630a5b829d9b5ea49`, apply `source.patch`, and commit
those three files locally. A reconstructed commit has a new SHA; record that
replay identity instead of claiming that it is the original run. Check the
three file hashes against the manifest before running. Provide separate clean
checkouts of v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and baseline
`e981ff308000c1d92d7e820df95113c1e19bcee8`, plus the recorded dependency
versions, Playwright and Chromium executable.

```sh
EDITOR_V1_ROOT=/path/to/pinned-v1 \
EDITOR_SPEC_BASELINE_ROOT=/path/to/pinned-baseline \
EDITOR_DEPENDENCIES_ROOT=/path/to/node_modules \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_ROUNDTRIP_FILTER= \
node scripts/parity/block-roundtrip.mjs
```

The separate native gate uses that same reconstructed source and its normal
local test dependencies:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html \
EDITOR_NATIVE_FILTER= \
node tests/browser/physical-history.mjs
```

The actual native integrity wrapper and its report additionally preserve the
all-tracked-file before/after check. A new replay must record its own source,
environment, results and limitations; the timings here are observations, not
performance guarantees.
