# Native vertical selection — 2026-10-30

This checkpoint addresses the failing vertical keyboard slice recorded after the
`894dfc09` GitHub run. It does not accept the complete selection preservation row,
whole-library release gates or all v1 functional parity.

## Confirmed behavior and change

The previous keyboard assertion derived its x-coordinate from `pointAt`, an
integral mouse-event helper. Keyboard movement preserves the actual collapsed
Range column. The two coordinates can hit different character boundaries with a
fractional indent. The assertion also accepted a foreign hit on the floating
inline toolbar as though it belonged to the destination paragraph.

The revised expectation is computed before the native key with an independent
plain contenteditable reference. It retains the destination's actual font,
letter spacing, indent and x-coordinate. The reference text metrics must match,
and adding/removing it must preserve author focus and both native endpoints.
The real editor and its toolbar are not moved or hidden to compute the oracle.
Four fixed 1.5px destination-indent cases at 0/.25/.5/.75px cover the coordinate
seam. The integral native pointer helper is unchanged.

This exposed a production ArrowUp defect: the original directed selection
expected destination offset 2, but the visible toolbar caused offset 5. The
existing KeyboardRouter now dismisses its own toolbar before vertical extension.
The SelectionController continues to own native movement and range restoration.
No new public API, selection manager or document mutation path is introduced.

Dismissing an extension action panel is a synchronous callback boundary. Before
continuing the same key, the router checks document generation/revision/mode,
active focus, exact native anchor/focus, logical selection and mounted endpoints.
An invalidated key neither extends the old selection nor prevents the new native
interaction. Home/End and a missing optional toolbar retain their prior routes.

## TDD and verification

| Check | Result | Evidence |
| --- | --- | --- |
| Initial router dismissal regression | 42 pass, 2 expected fail | `router-dismissal-red.log` |
| Minimal dismissal change | 44 pass | `router-dismissal-green.log` |
| Native ArrowUp before production change | expected 2, actual 5 | `native-up-red-chrome156.log` |
| Native ArrowUp after production change | 1 pass | `native-up-green-chrome156.log` |
| New lifetime guards before implementation | 49 pass, 6 expected fail | `router-retirement-red.log` |
| Router with lifetime guards | 55 pass | `router-retirement-green.log` |
| Public custom-element action-panel controls | 2 pass | `native-panel-green-chrome156.log` |
| Same controls in isolated copy without post-dismissal guards | 2 expected fail | `native-no-guard-negative-control.log` |
| Complete native cross-selection fixture, Chrome 142 | 42 pass | `native-final-chrome142.log` |
| Complete native cross-selection fixture, Chrome 156 | 42 pass | `native-final-chrome156.log` |
| Router, SelectionController and both LogicalSelection unit files | 138 pass | `selection-units-green.log` |
| Both TypeScript projects | pass | `typecheck-green.log` |

The native panel controls use a public inline tool's `renderActions` and a real
custom element's `disconnectedCallback`. One callback focuses a foreign text
control; another commits an unrelated block revision. Both must run inside the
trusted key handler. The tests inspect state before browser default handling,
reject stale event consumption, and retain the callback's content/history and
newer directed native selection. The isolated negative control removes only the
post-dismissal guard, leaving the real native events and expectations intact.

## Reproduction

```sh
node --test --test-isolation=none core/KeyboardRouter.test.js core/SelectionController.test.js core/LogicalSelection.test.js core/LogicalSelection.ownership.test.js
npm run typecheck
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-cross-selection.html node tests/browser/physical-history.mjs
```

Node process-isolated tests and local listening are restricted by the default
execution sandbox. Unit logs use Node's in-process test isolation mode; the
browser runs received approval to start their local Vite/Chrome processes. No
network application is exercised by this fixture. Both complete native runs
exit with code 0. SHA-256 source/log identities are in `manifest.json`.
