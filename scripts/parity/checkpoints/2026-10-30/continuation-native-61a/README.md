# Full native and heap verification — 2026-10-30 continuation

## Source and outcome

Frozen source: `eae1b93ee6bc39a32230de1b46c67f27b39c8015`; tree: `b4eb26ffc1f9c04c14c60a09031a8affe5a7cdb8`.
The isolated persistent worktree ran C11 `run-ODin2d` with a clean source
snapshot. Both gates exited 0 and recorded `sourceUnchanged: true`; the manifest
finished with `outcome: passed`. This archive is added only after both gates and
the complete-result checks finished. It changes no production or test source.

Commands, in this exact sequential order:

1. `node tests/browser/physical-history.mjs`
2. `node tests/browser/heap-gate.mjs`

All inherited `EDITOR_*PAGE` and `EDITOR_*FILTER` variables were removed, together
with Vite/browser-root/results overrides. The full native runner emitted one
complete final result containing exactly its 41 declared
native groups. Every native case reported `PASS`. Both physical scenario groups
and the complete history matrix are also present. Partial progress lines were
not used to infer completion.

## Native results

- **2389 passing cases across 41 native groups.**
- **2 physical scenario groups**: Enter/formatting history and toolbox/structural
  history. Their captured before/after DOM states are preserved in the final JSON.
- **14 history-matrix scenarios** are reported separately;
  they are not added to the native case count.

| Native group | Passing cases |
|---|---:|
| `nativeTextInput` | 52 |
| `nativeTools` | 121 |
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
| `nativeSourceModes` | 61 |
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
| `nativeRoundtripPreservation` | 65 |
| `nativePresentationRecovery` | 14 |
| `nativePluginControls` | 169 |
| `nativePluginRanges` | 116 |
| `nativePluginLocalRanges` | 76 |
| `nativePluginClipboard` | 48 |
| `nativePluginFieldClipboard` | 68 |
| `nativePluginMedia` | 95 |
| `nativePluginDesign` | 84 |

The complete case names and outcomes are in `c11/native.log.gz` and the parsed
copy `c11/native-result.json.gz`. The history matrix scenarios are in
`verification.json` and that same final native result.

## Heap results

The lifecycle page completed successfully before heap collection. The final
report contains **23 sentinels and 0 retained resources**.
The live history proof authored 12 actions
with 32768-byte payloads. It checked eviction
under a one-byte history budget, proved its intentionally retained control was
visible before release, released that control, and verified the remaining
Undo/Redo replay. All three original phase reports are retained below and in
`c11/heap.log.gz` / `c11/heap-result.json`.

| History phase | Payload-object counts by case index |
|---|---|
| `before-eviction` | `[0,1,3,0,0,0,0,0,0,0,0,0,0]` |
| `after-eviction-with-retained-control` | `[0,0,1,0,0,0,0,0,0,0,0,1,2]` |
| `after-releasing-control` | `[0,0,0,0,0,0,0,0,0,0,0,1,2]` |

These are measured object counts from Chrome heap snapshots. Heap-size numbers
are diagnostics; the pass/fail oracle is the required presence or absence of
the marked payload objects and the lifecycle sentinels.

## Environment and dependency identity

- Node `v24.22.1`.
- `Google Chrome for Testing 156.0.8078.47`; executable SHA256
  `230f0db8c5086182f46c59c867c0d461eb525d6552dfad226ea6b4d9ec249db2`.
- A physically independent `node_modules` copy from the main installation.
  Vite caches were excluded. All 51 installed Carousel
  file hashes matched the source installation, and each copied file had a
  different inode. The installed lock resolves Carousel to
  `git+ssh://git@github.com/Shelamkoff/carousel.git#f7f6485886a1d77f9213d9079eb70000efeff499`.
- The Carousel hashes and installed lock were rechecked after both gates.
- The current Playwright entry path was supplied in the environment; these two
  existing browser runners drive Chrome directly through CDP.

The first two default-sandbox initialization attempts stopped before creating
any C11 manifest or starting a gate. The direct retry reported `spawnSync git
EPERM`. They are preserved in `supervisor/environment-not-run.json` as
**environment-only not-run**, not product RED. The existing clean checkout and
dependencies were rechecked and the supervisor resumed through the tool's
approved `require_escalated` execution. No harness or tested-source workaround
was introduced.

## Evidence integrity

`verification.json` records the complete source identity, original commit object,
runner hashes, outcomes, counts, and SHA256 hashes of every archived payload.
The original C11 manifest and every raw log are preserved. Gzip payloads use
`mtime=0` and decompress byte-for-byte to the captured originals. The supervisor,
resume launcher, archive script, complete status/preflight metadata and setup
logs are included. Gate results are scoped to the frozen source above; this
archive does not assert outcomes for later code changes.
