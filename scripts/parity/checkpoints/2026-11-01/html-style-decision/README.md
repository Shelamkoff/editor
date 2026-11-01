# HTML boundary decision — 2026-11-01

The user selected explicit application-owned content styles and viewport lengths
from the containing page. C05 is amended with one current-only contract before
production integration. **No production surface imports these experiments.**
B-HTML, inline B-STYLE and the four-surface preservation rows remain open.

The scriptless frame has only `allow-same-origin`; no script, form, popup,
download or top-navigation sandbox grants are added. Its owner sanitizes HTML,
supplies explicit CSS, measures natural height and validates exact frame,
container, child Document and trusted active input before parent delegation.
Canonical HTML is unchanged. No page stylesheet is automatically copied.

Current native decision fixture: **13 PASS** in
`test-results/audit-closeout-2026-11-01/html-decision-complete-current.log`:

- Explicit theme and long flow, reachable tail, responsive width and trusted
  native checkbox.
- Page-window viewport dimensions, root percentages without feedback, nested
  application media rules, all nine required computed font sizes.
- Exact local fragments, including absent targets; completed Blob download with
  literal filename/bytes; browser-native video playback from trusted Space.
- Host-class/fixed overlay and native popover confinement; no synthetic or
  retired delegation; moved-frame cleanup preserving foreign DOM; rejection of
  navigation-driven child replacement.

`scripts/parity/html-navigation-decision.mjs` separately compares **12 cases**
against independent bare anchors in the same owner-frame hierarchy and CSP.
All pass in `html-navigation-complete.json`: `_self`, `_blank`, `_parent`,
`_top`, `articlePreview`, existing named window, Ctrl/Shift/middle click,
relative URL, and two fragment-new-tab actions. Actual requests, owner/top/popup
URLs, opener nullness and referrers must match the independent browser control.
The runner records source hashes, exact HEAD, environment, timestamps and
unchanged source. It does not assume that noopener permits named-window reuse.

Corrections retain their original failing output: Windows policy collision and
Blob prefiltering (separately repaired in production `1226c8fa`); modifier loss;
synthetic auxiliary click with no native default; root percentage feedback;
nested media evaluated in the small child viewport; and absent fragment made
inert. Cross-document resize notification failures are retained. Ownership
observation now disconnects resources when the frame moves, rather than merely
skipping later callbacks. Measurement is coalesced outside observer delivery.
The isolated move and replacement cases and the complete current fixture pass.
Original 2026-10-29 prototypes remain unchanged, including their rejected loop
and clipped inline glyph. No cap, stopped resize or blanket paint containment
is adopted.

```powershell
$env:EDITOR_NATIVE_PAGE='native-html-boundary-decision.html'
node tests/browser/physical-history.mjs
# Clear EDITOR_NATIVE_PAGE before the eventual full native matrix.
node --test tests/browser/experiments/html-viewport-units.test.js
node scripts/parity/html-navigation-decision.mjs
```

Set `EDITOR_PLAYWRIGHT_PATH` to an available installed module; the local isolated
copy is under ignored `test-results/audit-tooling/`. Chrome is resolved through
the existing browser environment helper. Platform: Windows x64, Node 24.9.0,
Chrome 156.0.8078.79, isolated Playwright 1.64.1. No product dependency change.

Fresh frozen-source replay `test-results/run-YtAbFp/manifest.json` passes all
three gates (17 token tests, 13 native cases and 12 native-link comparisons),
each with exit 0 and unchanged source. HEAD is `1226c8fa`; the manifest captures
the exact specification patch and every untracked experiment's byte hash.
This is a separate execution after the earlier named diagnostic attempts,
not a relabelling of those results. The notes added after this freeze do not
change the tested implementation or browser fixtures.

Remaining work includes a fresh production implementation with the existing
editor/output/style owners, configuration/type/documentation contracts, actual
four-surface and mixed-media history/lifetime proof, wider CSS/layout/resource
cases and final integrated validation. Headless input does not claim native
context-menu UI, all devices/engines or complete accessibility behavior. Inline
editing is not moved into frames; the separate inline class/style trust policy
still needs a presentation-preserving demonstration before amending C06.
