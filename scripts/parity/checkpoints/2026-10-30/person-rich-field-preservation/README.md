# Person sibling rich fields — 2026-10-30

Runtime/test source: `4a672decc413c17e895c129c095d14ba48c7c315`, based on
`103250966d4ca09723e10449e7640541674ddd24`.

Changing `role` or `bio` of the active profile used to replace its whole card.
That detached a focused name, discarded a backward range and remounted unrelated
Mention/Color widgets. Changing a name also replaced a focused URL input. The
adapter now retains the card when avatar and link data remain equal. Existing
core projection updates the changed rich fields individually. No public API,
history owner, inline payload parser or alternative model was added.

The old adapter-only unit assertion required the same field to be replaced and
immediately populated by `update`. It now verifies that the declared host stays
available to core. A real-browser replacement control verifies the actual new
name/role/bio HTML, derived label, two mode changes and Undo/Redo, so the revised
unit expectation does not excuse a missing external update. Separate real-DOM
controls still check avatar changes, actual URL value/icon changes and rejection
of input from a retired control.

## Observed verification

| Executed gate | Result |
| --- | --- |
| Native RED on the unchanged original production source | 3 new failures; 2 prior native controls pass |
| Person adapter/social resolver/renderer units | 18 passed, no failures/skips |
| Complete `projection-contracts.html` page | 151 passed, no failures |
| `native-plugin-parity.html`, `Person` filter | 19 passed, no failures |
| Both source typecheck projects | Passed |

The three native RED cases lose the existing name/URL control after an unrelated
rich field changes. `red-native/fixture.js` preserves the exact executed bytes;
its hash matches `red-native/source.json`. Later fixture changes only improve
assertion messages. The RED command and the exact production parent are recorded
in `summary.json`. Earlier exploratory unit/browser failures are not needed as
acceptance evidence and are not reconstructed here.

The final green run is `run-3sxAYB`; its original manifest and compressed complete
logs are in `green/`. Its source is the parent plus recorded tracked patch and
the hashed then-untracked native fixture. `checked-tracked.patch` has exactly the
recorded patch hash. The fixture hash and tracked patch were checked against the
committed source above. Every final gate records unchanged source. The unrelated
dependency symlink is explicitly present in the manifest, so the worktree was
not described as clean. Environment: Linux, Node `24.22.1`, Chrome
`156.0.8078.47`, shared installed dependencies, isolated Vite cache.

The native continuation tests exercise trusted text input before and after the
sibling change, preserve the URL selection, and verify separate author/history
actions. The rich-name controls retain the actual author Text node, backward
anchor/focus, inline occurrence identities and the exact changed-field
completion list. The full combined parent-branch acceptance remains separate.

## Open inactive-label gap

`inactive-label-probe.js` is an intentionally failing reproduction, separate from
the green suite. On the repaired production source, a never-opened profile name
still shows `Alpha {{mention}} {{swatch}} tail`; the independently expected label
is `Alpha @Ada #123456 tail`. Focusing that actual name field makes its label
correct without changing canonical data or history. Those positive controls pass
before the probe reports the initial-label failure.

The original `run-YnEFsk` manifest/log/failure JSON are in `inactive-label-open/`.
For that isolated run, the standard browser page HTML was temporarily replaced
with the exact `inactive-label-probe.html` and restored in `finally`. The manifest
records that test-only patch and the actual failed outcome. The production
source is unchanged. To reproduce in a disposable checkout, use that HTML at
`tests/browser/projection-contracts.html` and run:

```sh
EDITOR_BROWSER_PAGE=projection-contracts.html node tests/browser/run.mjs
```

Use an installed Chromium through `EDITOR_CHROME_PATH`; `EDITOR_VITE_PATH` may
select an isolated local Vite launcher. The HTML and probe also work directly
through a normal Vite server, without replacing a product source module.

The current block context exposes canonical block payload, not inline sidecars.
`afterProjection` only completes an actually mounted declared field. Deriving
this unopened label therefore cannot be repaired by reading an active field,
expanding particular Mention/Color payloads in Person, importing renderer parsing,
or issuing a no-op authoring transaction. Eagerly mounting additional hidden
widget fields would change observable runtime/provider acquisition and retirement;
that design needs its own contract and lifetime proof. No such contract change
is hidden in this focused caret repair. This gap and whole-library parity remain
open; no preservation-register row is newly accepted here.
