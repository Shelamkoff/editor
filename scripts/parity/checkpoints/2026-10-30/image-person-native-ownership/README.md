# Image/Person native derived presentation ownership — 2026-10-30

Image caption and Person name used direct `input` listeners to refresh image alternative text or the active profile tab. Their local element relationships stayed valid when the entire plugin view moved outside the original editor. Trusted input in that foreign view therefore still changed auxiliary presentation.

The fix removes those listeners. Existing `afterProjection` callbacks now receive ordinary native source completion from the accepted core field-projection path, with no extra document/history action or plugin-specific native router.

## Executed proof

- `native-owner-red.log.gz`: the original listener implementation passes the two ordinary input/history controls and fails both whole-view foreign-owner controls. Each failing control observes one trusted browser input, a changed foreign author host, unchanged original canonical data/history, and an incorrectly overwritten foreign sentinel.
- `removed-listeners-without-core.log.gz`: removing the listeners alone passes the foreign-owner controls but fails both ordinary presentation controls. This establishes why the shared source-completion repair is necessary.
- `native-provisional-core-green.log.gz`: four controls passed during development with the provisional shared core. This is development evidence, not the final source acceptance.
- `native-final-chrome142.log.gz` and `chrome142-manifest.json`: **4/4 PASS** with the final reviewed core, Chrome 142.0.7444.175 and Node 24.22.1. The C11 recorder confirms unchanged source identity across the run. Ordinary input retains the author host, commits exactly once, and restores canonical data and auxiliary text with one native Undo/Redo. Whole-view foreign input preserves the auxiliary sentinel and creates no original-editor history.

`source-and-evidence.json` binds the tested production files, fixture and importer to their exact SHA-256 values. The C11 manifest also records the full combined uncommitted integration source identity at this point. The parent integration commit supplies the complete final combined source and runs the full Chrome 156 suite separately.

Two older Person unit checks in `person-old-unit-oracles.log.gz` still expected the removed private input listener or its listener count. Those are implementation-coupled unit expectations, not new production failures. Their adaptation uses the public field-completion callback for current-tab projection and the remaining URL controls for body-listener lifetime. The existing browser case `Person sibling update keeps the author caret and updates the current tab after native input` independently covers the real sibling-update/input behavior. The adapted Person unit file passes **13/13**, and that existing trusted native sibling case passes **1/1 in Chrome 142**; the corresponding red/green logs and final unit-test hash are included.

The initial development attempts with an incorrect style-wait argument or an unclickably small pixel fixture are not counted as production RED. The final fixture uses the existing real native helpers, normal plugin styles and a visible image width. These controls do not accept the entire Person ROUNDTRIP register row, all Image behaviors, or complete v1 parity.

## Reproduction

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-media.html \
EDITOR_NATIVE_FILTER='derived owner' \
node tests/browser/physical-history.mjs
```

Use a fresh C11 run to bind any replay to its actual source. No native input helper or event-trust oracle was changed.
