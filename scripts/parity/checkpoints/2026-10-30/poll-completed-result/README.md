# Poll completed result labels — 2026-10-30

Final tested source: `ed4222f5b66a36aa9f5f88be62d4efeb369202e1`. This continues the ownership checkpoint at `64f53902c8ace8010716bb2987c50f961f522d5c`; the full upstream base remains `69c8425e0081fde69cf5176ccb73d032720c15fc`.

## Observed defect and bounded fix

A current Poll author field originally completed as `<b>Alpha</b>` was changed directly to `<b>Unaccepted author drift</b>` without native input or core completion. A real provider `onUpdate` correctly updated 80/20 percentages and left the author DOM, canonical data and history unchanged, but its auxiliary label incorrectly adopted the unaccepted text. The frozen RED source `133b9905` reproduced that exact final label mismatch. Its independently expected positive control used trusted native `insertText` to complete `<b>AlphaX</b>` and confirmed a later provider refresh retained that accepted value.

The existing option view now retains `completedHtml: string | null` instead of a boolean. The existing readable DOM traversal runs only inside `afterProjection`, sanitizes its HTML and replaces that scalar value after exact source-entry and owner-path checks. It captures and rechecks the exact result entry before immediate painting. Provider-only projection uses the cached value with the existing source/result ownership checks. Rebuilding/retiring the view clears it naturally through the existing optionViews lifecycle. No additional store, field descriptor, registry, lifecycle hook or public API was introduced.

## Exact-source evidence

| Run | Source | Observed result |
| --- | --- | --- |
| run-iSS2vy | 133b9905 | RED: unaccepted drift label fails; trusted native completion positive passes |
| run-NWrLV1 | ed4222f5 | GREEN: 15 actual Poll unit tests; type checks exit 0; 198 projection contracts; 20 Poll state contracts; 27 native Poll controls |

All executed gates report `sourceUnchanged: true`. The final native run uses the normal `native-plugin-controls.html` entry point filtered by `Poll`, covering all 13 new ownership/completion cases plus existing Poll controls. The ordinary projection gate is the full page, including inline label/mark, mode, retired/adopted-view and history controls. The real Poll unit files are `plugins/poll/shortcut-empty.test.js` and `shared/pollData.test.js`, checked to exist by the exact sequential supervisor before running.

The prior checkpoint's 206 passing Node tests were three core suites, not a Poll unit suite. Its command included an unmatched nonexistent Poll path that Node24 ignored. That earlier manifest and raw output are retained unchanged; its README and summary now explicitly state this coverage limit. This checkpoint supplies the missing real Poll unit coverage on its own frozen source.

## Review and artifacts

Root read and approved the full production/spec diff and both new test cases after the genuine RED. The sibling native completion agent independently reviewed the previous full ownership test diff and found no blocking issue in the assertions, public core controls or normal gate registration.

Original manifests are copied byte-for-byte; logs are deterministic gzip archives with stored and original hashes in `hash-index.json`. No raw result or source identity is rewritten. `source-final.patch.gz` contains every changed runtime/spec/doc/test file against the upstream base without embedding checkpoint material. `source-continuation.mbox.gz` preserves the intermediate evidence commit plus the new RED and GREEN source commits after 64f53902; combine with the prior checkpoint's source history to reconstruct the branch. `summary.json` records source-file hashes and exact counts. The index excludes itself.

These are scoped results. Combined full-library verification, heap checks and publication remain owned by root; this checkpoint does not claim overall v1 parity.
