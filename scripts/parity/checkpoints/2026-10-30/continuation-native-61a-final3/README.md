# Final integrated native and heap verification — 2026-10-30

## Actual source and outcome

Frozen source: `6c2a48d1ea4ebd0014bd2fb4573738db2c3593e6`; tree: `695c235bf92010b27f4c24cd85c3ba1754f5270a`.
The isolated persistent worktree ran C11 `run-MKgB9Y` with a clean source
snapshot. Both gates exited 0 and recorded `sourceUnchanged: true`; the manifest
finished with `outcome: passed`. The complete final JSON was validated before
writing this archive. This evidence commit changes no production or test source.

Commands, in this exact sequential order:

1. `node tests/browser/physical-history.mjs`
2. `node tests/browser/heap-gate.mjs`

All inherited `EDITOR_*PAGE` and `EDITOR_*FILTER` variables were removed, together
with Vite/browser-root/results overrides. The run did not use diagnostic harness
interception or an extended page deadline. The existing 120-second page deadline
and all per-case timeouts and assertions remain unchanged.

## Why native test registration changed

The earlier source `c6e537e5d7433f0d902749719c8af265c6ae8591` accumulated 376 cases on one native plugin
parity page. The full acceptance attempt `run-yiPE1x` reached that page and failed
at its original 120-second deadline. Heap then passed independently: 23 sentinels,
zero retained resources and all three history phases. That failed native result
is preserved, not relabeled as a pass.

A separate, explicitly nonacceptance diagnostic `run-8G2oM5` served an externally
instrumented harness with progress reporting and observed the same assertions
beyond the original deadline. At 120,035 ms, 313 cases had passed and the next
case was still advancing. All 376 original cases finished successfully at
130,307 ms. Code Copy's ten cases consumed 12,286 ms, the 21 text settings cases
17,399.4 ms and the twelve Columns layout cases 13,542.9 ms. This measured a page
budget problem. The diagnostic's extended observation deadline is not acceptance
evidence and was not committed to the native runner.

Registration now separates those existing cases into three normal native pages:

| Final native group | Cases |
|---|---:|
| `nativePluginParity` | 333 |
| `nativeCodeCopyOwnership` | 10 |
| `nativePluginSettings` | 33 |

The full final run above passed all three under the original deadline. Their
combined case-name multiset equals all 376 original diagnostic cases exactly,
including multiplicities. The three regression modules, input driver/helpers,
shared harness and environment module are byte-identical to the earlier source.
The remaining parity module changed only by removing the three relocated imports.
The existing system-clipboard Copy integration case remains in the parity page.

## Native results

- **2481 passing cases across 43 native groups.**
- **2 physical scenario groups**: Enter/formatting history and toolbox/structural
  history, with their before/after DOM states retained.
- **14 history-matrix scenarios**, reported separately
  rather than added to the native case count.

The final JSON contains exactly the native groups declared by the frozen runner.
Every native case reports `PASS`. Partial progress lines were not used to infer
completion.

| Native group | Passing cases |
|---|---:|
| `nativeTextInput` | 52 |
| `nativeTools` | 169 |
| `nativeClipboard` | 25 |
| `nativeIme` | 16 |
| `nativeConversion` | 7 |
| `nativeBlockMenus` | 110 |
| `nativeConversionGrouping` | 88 |
| `nativeConversionPreservation` | 53 |
| `nativeInteractionSequences` | 39 |
| `nativeRetainedTools` | 64 |
| `nativeConversionContinuations` | 65 |
| `nativeFontCancel` | 58 |
| `nativeBackgroundCancel` | 36 |
| `nativeLinkCancel` | 36 |
| `nativePanelKeyboard` | 36 |
| `nativeSourceIndentation` | 54 |
| `nativeSourceModes` | 62 |
| `nativeConfigSnapshot` | 30 |
| `nativePollRuntime` | 26 |
| `nativeLibraryBoundaries` | 48 |
| `nativeInstanceMethods` | 8 |
| `nativeColorPopup` | 8 |
| `nativeColorPopupTrusted` | 8 |
| `nativeMentionPopup` | 64 |
| `nativeAuditEdges` | 21 |
| `nativeAuditPoll` | 4 |
| `nativeAuditHiddenFields` | 4 |
| `nativeAuditRecheck` | 49 |
| `nativeStructural` | 21 |
| `nativeCrossSelection` | 42 |
| `nativeCoreBehavior` | 67 |
| `nativePluginParity` | 333 |
| `nativeCodeCopyOwnership` | 10 |
| `nativePluginSettings` | 33 |
| `nativeRoundtripPreservation` | 65 |
| `nativePresentationRecovery` | 14 |
| `nativePluginControls` | 169 |
| `nativePluginRanges` | 116 |
| `nativePluginLocalRanges` | 76 |
| `nativePluginClipboard` | 48 |
| `nativePluginFieldClipboard` | 68 |
| `nativePluginMedia` | 95 |
| `nativePluginDesign` | 84 |

Complete case names and outcomes are in `c11/native.log.gz` and the parsed
`c11/native-result.json.gz`. The history matrix is also in `verification.json`.

## Heap results

The lifecycle page completed before heap collection. The final report contains
**23 sentinels and 0 retained resources**.
The history proof authored 12 actions with
32768-byte payloads. It checked eviction under
a one-byte history budget, proved the intentionally retained control remained
visible, released that control and verified remaining Undo/Redo replay.

| History phase | Payload-object counts by case index |
|---|---|
| `before-eviction` | `[0,1,3,0,0,0,0,0,0,0,0,0,0]` |
| `after-eviction-with-retained-control` | `[0,0,1,0,0,0,0,0,0,0,0,1,2]` |
| `after-releasing-control` | `[0,0,0,0,0,0,0,0,0,0,0,1,2]` |

These are object counts from Chrome heap snapshots. Heap sizes are diagnostics;
the oracle is the required presence or absence of marked payloads and sentinels.

## Prior attempts remain distinct

- `run-2n1RIx`: interrupted/incomplete. Its supervisor and runner no longer existed,
  and native had no exit code or complete final result. Heap had not started.
  No product failure or cancellation cause was inferred. Only its positively
  identified orphan Vite and Chrome resources were stopped before the next run.
- `run-yiPE1x`: a completed failed acceptance run; native exited 1 on the page
  deadline, heap exited 0. The source stayed clean and unchanged.
- `run-8G2oM5`: diagnostic-only, with an external extended observation window;
  it provides timing and case inventory, not an acceptance pass.
- `run-MKgB9Y`: the complete final acceptance run on the actual new source,
  with the original runner deadline and unchanged case assertions.

The original manifests, raw logs, supervision files and diagnostic scripts are
retained under `prior/`. All 37 previously indexed evidence
payloads were verified byte-for-byte unchanged before this archive was created.
The broad host-process listing remains outside the repository; matched test
process facts are retained in the interruption metadata.

## Source, dependencies and evidence integrity

`source-and-partition-equivalence.json` records the exact production paths compared
with `1c933545c6f05701741031997945c64b1ab5ba9d`: their diff is empty. From the earlier c6 source to
that documentation successor, only two Russian Embed README prose occurrences
changed. The final source intentionally differs in native page registration and
also contains later documentation/evidence and standalone comparison-runner guard
changes. It is recorded by its actual SHA, never relabeled as c6 or 1c.

- Node `v24.22.1` and `Google Chrome for Testing 156.0.8078.47`.
- Chrome executable SHA256: `230f0db8c5086182f46c59c867c0d461eb525d6552dfad226ea6b4d9ec249db2`.
- Physically independent dependencies copied from the main installation, excluding
  Vite caches. All 51 Carousel files matched the source
  installation and had distinct inodes. Carousel resolves to
  `git+ssh://git@github.com/Shelamkoff/carousel.git#f7f6485886a1d77f9213d9079eb70000efeff499`.
- Carousel file hashes and the installed lock were rechecked after both gates.

`verification.json` contains the complete source identity, original commit object,
runner hashes, outcomes, counts and SHA256 hashes of every archived payload.
Gzip payloads use `mtime=0` and decompress byte-for-byte to the originals.
This proof covers Chrome/Linux and these registered scenarios. It does not claim
all-platform/IME parity or close unrelated preservation obligations.
