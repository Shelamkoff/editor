# Projection recovery: retained keyboard ownership

This checkpoint records a native keyboard regression after a rejected block
projection and its narrow recovery fix. It preserves the original failed runs,
the successful controls, source identities, and reconstructable negative cases.
No browser, test, or timing run was performed while assembling this archive.

## Source and contract

| Source | Commit | Tree |
| --- | --- | --- |
| Baseline | `02bde2e93756bc9fdfe87c66f6f0b8ce9c372c3c` | `16717c1e69d3632c195c63242bfe61bb33391134` |
| Initial repair | `4b16f15a7936a86c126328470668578cfdaa59bc` | `ec3f6cdd6de2915d2198cd0d6b1a2046189b03d1` |
| Final repair, including owning-document guard | `adfff7fc1458274c287d16aa596b14777563ba6c` | `8529d49c971b5b72700988c4d0c272f5c0a321c1` |

The existing boundary is C07 in
`RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md` §11.2: recover or discard a
pre-commit failure and restore valid prior selection without new history or
events. This change does not introduce an exact restoration guarantee for a
previous Carousel slide, auxiliary control, or other transient plugin UI.

The baseline case types `X` into the real Carousel caption, invokes its native
source action, delegates to the real `Carousel.update`, and then throws a
controlled error. Accepted data and history survive the canonical recovery;
the damaged instance is remounted and its old scope is revoked. However, focus
falls to `BODY`. A trusted Ctrl+Z then targets `BODY`, leaving `AlphaX` unchanged.

`LogicalSelection.capture()` correctly has no text bookmark for this focused
auxiliary button. It remains unchanged. `BlockReconciler` now retains a narrowly
scoped keyboard-owner continuation for updated, accepted fielded instances.
After recovery it can focus the exact recovered shell only when the old node
and scope are retired, the accepted record/map/lifetime still match, the owning
document still has focus, and no newer live focus has superseded the operation.
The owning-document check and cancellation flags are evaluated after the other
DOM reads, including on the recheck after setting `tabIndex`.

Inputs, textareas, selects, contenteditable hosts, inline widgets, and fieldless
blocks retain their existing restoration owners. Fieldless blocks already have
a logical bookmark; running a second fallback would override a newer focus.
The fix does not create a canonical action, conceal the original error, or add a
new registry or bookmark API.

## Preserved negative controls

| Run | Source | Observed failure |
| --- | --- | --- |
| `run-Y3MN1G` | Baseline plus native fixture | Recovered focus and trusted Ctrl+Z target `BODY`; caption remains `AlphaX`. |
| `run-CEbFFH` | First local repair, before excluding fieldless owners | Duplicate restoration overrides a foreign input focused by the first restoration. |
| `run-eAmIv5` | Initial committed repair plus iframe control | Parent input is focused during rejected projection, but fallback returns focus into the iframe. |

The latter two cases are review-found problems in intermediate versions of this
repair, not two additional baseline defects. The iframe case also checks parent
focus acquired before the rejected command. That before-control already passed
on the initial repair; the reproduced failure occurred during projection.
Chrome did not retain the old frame `activeElement` in the before-control, so
that unsupported observation was removed from the fixture.

Five setup or observation mistakes are retained and explicitly classified in
`evidence.json`: an invalid warning observation port, a missing test definition
icon, an invalid label shape, a public update containing forbidden `id`/`type`
keys, and the unsupported iframe `activeElement` assumption. They are not counted
as product REDs or passing controls.

## Verification and exact limits

| Accepted source | Check | Result | Run |
| --- | --- | --- | --- |
| Final repair | Focused native recovery controls | 7/7 | `run-KNAeTW` |
| Final repair | Affected core units | 324/324 | `run-KqrRob` |
| Final repair | Both typecheck projects | PASS | `run-xe9STq` |
| Initial repair | Focused native recovery controls | 6/6 | `run-7Fo1Cl` |
| Initial repair | Full native core page | 67/67 | `run-opcT1s` |
| Initial repair | Native Carousel filter | 15/15 | `run-j0nSVV` |
| Initial repair | Affected core units | 324/324 | `run-tyXFXa` |
| Initial repair | Both typecheck projects | PASS | `run-ubO8XY` |

The final seven native cases cover keyboard Undo/Redo after the real source
failure; another editor's focus/history; newer foreign focus during projection;
newer neighboring focus from retired-owner cleanup; existing backward keyed
selection/history restoration; a single fieldless restoration with a foreign
successor; and parent-document focus before/during an iframe rejection. They
also check original error delivery, accepted canonical data and history, and
actual failure/remount entry where applicable.

Affected unit files are the `BlockReconciler`, `TransactionEngine`,
`LogicalSelection`, `InteractionState`, `EditorViewModel`, and `InstanceScope`
test families. Typecheck covers `jsconfig.json` and `jsconfig.runtime.json`.

All 21 recorded runs have unchanged before/after source identities, including
failed attempts. The accepted initial runs match the exact committed initial
repair through their tracked patch and the then-untracked regression module.
The accepted final runs match the exact committed final patch applied to the
initial repair, with no untracked source. `evidence.json` records this binding
and the changed source file hashes and Git blob identities.

The 67-case native core page and 15-case Carousel filter were not repeated after
the iframe guard. The Carousel filter includes the primary recovery case, and
intermediate runs repeat controls, so counts must not be added together. This
is Chromium functional evidence for this recovery boundary; it does not claim
full editor parity, performance improvement, or memory behavior. The root's
broader integrated-source acceptance is a separate run and is not certified by
this archive.

## Artifact integrity and reproduction

`runs/` contains each original verification manifest and its exact gate stdout
as deterministic gzip (level 9, timestamp 0, empty filename). `evidence.json`
lists the compressed and decompressed byte sizes and SHA-256 values for all 47
archives. Every archive was decompressed and checked before this commit.

`sources/` contains the tracked patches and, where needed, the untracked test
fixtures for the three negative controls. These bytes were reconstructed from
retained source after the runs. Their SHA-256 values match the original recorded
`sourceBefore.patchSha256` and untracked-file hashes exactly. This is exact
reconstruction, not a rerun or a claim that a separate historical source archive
was captured during execution.

To reproduce a negative control, use an isolated checkout of its `base` commit
from `evidence.json`, decompress and apply its `trackedPatch`, and copy its
`untrackedFixture`, if present, to
`tests/browser/regressions/projection-recovery-focus-native.js`. Then invoke
`node tests/browser/physical-history.mjs` with `EDITOR_NATIVE_PAGE` set to
`native-plugin-parity.html` and the filter recorded in that run's manifest.
The three filters start with `Projection recovery keeps native keyboard history`,
`Projection recovery fieldless`, and `Projection recovery in an iframe`.

The manifests preserve the exact command, Node/npm environment, Chrome path,
and browser-only Vite wrapper path used here. Those external dependencies must
be made available separately; the wrapper is not a unit/typecheck environment
setting. The recorded manifests and gate stdout remain available here
independently of the temporary run directories.
