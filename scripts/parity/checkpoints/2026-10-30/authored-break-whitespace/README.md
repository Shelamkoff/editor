# Authored-break whitespace regression

This checkpoint covers one shared native-input repair. It does not establish whole-library acceptance, new preservation-register approvals, or publication of the combined branch.

The base is `2afd45aaaab3f60574ed19cfb60bd37a55bda342`. The repaired source is `03d4407da664b2bf63aa7c9987bcf86d1ddb30ab`, tree `f09ba286ebb9f91086eb331c66d5b0f454a955bb`. `source.patch.gz` contains the complete six-file change between those revisions. `manifest.json` records individual source hashes, commands, observed outcomes, environment, and compressed/uncompressed artifact hashes. `artifact-hashes.json` checks the retained files without a self-referential hash.

## Defect and scope

Controlled typing immediately after an authored BR inserted plain spaces even when the target's CSS collapsed them. In Checklist, typing a space into `<b>A<br></b>tail` saved `<b>A<br> </b>tail`, but the inserted space occupied zero width. Paragraph's `pre-wrap` control preserved it.

The repair reads computed whitespace on the actual insertion wrapper. Collapsing modes (`normal`, `nowrap`, `pre-line`) protect leading/repeated spaces with alternating NBSP and SPACE; preserving modes (`pre`, `pre-wrap`, `break-spaces`) retain the supplied spaces. Existing owner, trust, composition and caret-padding guards, canonical synchronization, and history grouping are unchanged.

## Recorded checks

| Check | Result | Artifact |
| --- | --- | --- |
| Final native fixture with the original controller | 8 PASS / 8 FAIL; all failures identify an invisible first space | `native-red.log.gz` |
| Identical native fixture with the repaired controller | 16 PASS / 0 FAIL | `native-green.log.gz` |
| Focused controller, logical-selection and runtime units | 162 PASS / 0 FAIL | `unit.log.gz` |
| Both production typecheck configurations | Exit 0 | `typecheck.log.gz` |

The RED tree retained the candidate fixtures and restored only `core/NativeInputController.js` from the base. The GREEN production and registered fixture files match the candidate commit. Temporary unregistered exploratory pages were removed before committing. The typecheck ran against the same production files; both configurations exclude browser fixtures and tests.

The 16 native cases exercise Checklist and Paragraph, one/repeated/bulk spaces, subsequent text, all six whitespace modes, formatting, visible width of each space, caret offsets, saved data and one-step Undo/Redo. `native-authored-break.html` has one registration in the full physical runner, using its existing timeout. This archive records the focused run, not a new full-run result.

## Native oracle qualification

The reference is an ordinary browser `contenteditable` receiving actual trusted text input through the existing native driver. The editor retains the authored BR's formatting, an improvement over the reference path that can leave that wrapper. This changes native whitespace affinity: after two separate space keystrokes, the retained wrapper can contain NBSP+NBSP while the reference contains NBSP+SPACE.

For collapsing CSS only, the final comparison treats SPACE/NBSP as equivalent logical spaces. Every requested space must independently occupy nonzero width; formatting, caret positions and save/Undo/Redo remain asserted. Preserving modes require their original spaces. `diagnostic-strict-serialization.log.gz` retains the earlier overly strict byte-comparison failure. The corrected behavioral fixture was rerun on both original and repaired production code; the original defect still produces eight failures.

## Reproduce in an isolated checkout

Use the project's installed dependencies and a supported Chrome/Chromium executable. The exact executable and version used here are in the manifest.

```sh
git switch --detach 03d4407da664b2bf63aa7c9987bcf86d1ddb30ab
git show 2afd45aaaab3f60574ed19cfb60bd37a55bda342:core/NativeInputController.js > core/NativeInputController.js
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-authored-break.html node tests/browser/physical-history.mjs
# Expected RED: exit 1, eight invisible-space failures.
git restore --source=03d4407da664b2bf63aa7c9987bcf86d1ddb30ab -- core/NativeInputController.js
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-authored-break.html node tests/browser/physical-history.mjs
node --test --test-isolation=none --test-reporter=tap core/NativeInputController.authoredBreak.test.js core/NativeInputController.test.js core/LogicalSelection.test.js core/DocumentRuntime.test.js
npm run typecheck
```
