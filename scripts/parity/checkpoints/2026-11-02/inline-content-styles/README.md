# Explicit application styles for inline author content

Status: current-only C06 representation selected for integration; **B-STYLE and
whole-audit acceptance remain open**. The user selected explicit application
content styles and page-window viewport units. No new trust flag, class
allowlist, size cap, document representation or stylesheet manager is added.

Author class values retain ordinary canonical HTML spelling. Actual author
span/code DOM uses a namespaced class attribute, preventing activation of
ordinary host interface class rules. The application CSS is admitted by native
CSSOM, its class selectors adapted with native specificity, and its rules scoped
to actual rich fields and completed derived author views. Widget UI is a scope
limit. Flat native editable DOM and overflow remain; no glyph clipping wrapper.
Per-document CSS ownership reuses the existing style registry, with independent
automatic/manual leases and distinct identities across installed copies.

Initial observed evidence (not yet one frozen integration run):

- All 14 original Node failures were DOM adapter/literal-selector mismatches.
  Upgraded fragment semantics retain existing identity/focus assertions. The
  five focused suites pass 65 cases; the full Node replay passes 2192 tests
  with three platform skips.
- The existing browser projection suite finds a genuine backward-range/text
  identity regression in Poll after a sidecar-only update. Class namespace
  movement reordered attributes. Detached safe comparison now restores only
  class presentation identity/order, preserving validation of live styles,
  URLs and markup; the original range/identity tests pass unchanged.
- Derived Poll result labels initially lose application CSS. The managed setter
  now inherits the nearest existing content style owner after insertion. This
  is styling metadata, with no command rights or resource acquisition. A public
  RED/ GREEN case checks the result through runtime replacement and both modes.
- All 45 existing ordinary browser pages pass. Grammar/Poll fixture observations
  use namespace-aware attribute queries while preserving expected values.
- `native-inline-content-styles.html` passes 29 cases: real input/Undo/Redo,
  literal/owned widget collision, reachable trusted host action, sixteen
  independent native CSS selector comparisons, nesting/layer/scope conditions,
  variables, actual keyframe animation, loaded local font/glyph width and
  released font registration, automatic/manual leases, independent documents.
  A failed content-field admission initially left its output's style scope
  active while a manual lease remained. The creating document is now carried
  into failed-output disposal; the focused real CSS RED/GREEN case verifies
  retired output cannot keep application styling. Its first fixture incorrectly
  called `register` instead of the existing `registerRenderer`; that initial
  fixture error is retained separately from the actual product RED.
- The original nine FONT values and two benign class templates pass all eleven
  cases through saved records, rendered CSS, native neighboring input and one
  Undo/Redo. Application CSS preserves original selector specificity; no product
  priority or expected typography was relaxed.
- `scripts/parity/inline-content-glyph.mjs` uses actual public editor/renderer
  modules, no source transforms. Both 201px italic-glyph PNGs exactly match the
  independent bare native control. A hostile native control covers the real host
  button; both public product controls preserve its trusted activation.
- Trusted Types tests exercise actual template content, all four adjacent
  positions and native invalid-position/missing-parent errors. Narrow author
  style grammar and parent CSP remain unchanged.

Dated logs remain in ignored `test-results/audit-closeout-2026-11-01/`, named
`inline-classes-*`; glyph PNGs are in `test-results/inline-content-glyph/`.
The first selector corpus used an unsupported empty span, which the existing
sanitizer unwraps; that fixture was corrected to a meaningful classed wrapper.
The first typography migration supplied a weaker selector than the historical
host rule; equivalent `:scope code.article-accent` specificity restores the
fixed 30px/color oracle. Neither fixture failure is relabelled a product RED.

Frozen integration `test-results/run-lr3VWC/` completes with unchanged source:
eight of ten gates pass (build, Node, types, 45 browser pages, glyph, heap,
documentation contracts and installed package/22 CSS assets). Full native stops
at three ordinary `.oe-inline-literal` queries; their exact text/widget/count
expectations remain while observations migrate to the actual live namespace.
The site gate flags four untranslated Russian prose terms; those are corrected.
Neither failed gate is relabelled. Focused native-tools then passes, and the
expanded 29-case CSS page passes after the failed-output cleanup repair.

## Immutable candidate and further boundary repairs

Candidate `20cc1ab7d07e545836f9c41f13d29a27a0575e02` retains **528 observations
per source across all eleven FONT/class cases**. Native Git-byte replay has no
unexpected failures or page/server errors: v1 retains its 22 exact historical
neighbor remount differences; baseline and candidate have zero raw failures.
Loaded production modules: 145/160/166. Artifacts:
`inline-classes-presentation-immutable.json` in the ignored closeout directory.

Frozen `run-20ECtW` passes nine of ten gates, including installed package,
all 45 ordinary pages and the 127-page site/demo. Its native gate stops at one
ordinary class query in `inline-style-native-history.js`. Only the observation
is corrected; the native input, variables, priorities, records and history
expectations remain. Frozen follow-up `run-0pL3cL` passes the **complete native
matrix** and **72 native navigation comparisons** on unchanged source. The
native CSS page in that snapshot has 31 cases; the additional two test cases
are theme variables and append-then-throw stylesheet acquisition. Navigation
now includes both Paragraph surfaces alongside the four embedded surfaces.
These are separately attributed snapshots, not a relabelled ten-gate pass.

Additional independent probes then find three real gaps, kept as explicit RED:

- Tag-based content CSS also styles independent button/input UI inside a rich
  field. The native control is 13.3333px; both auxiliary controls become 200px.
  The CSS scope limit now follows the existing independent UI/editing-island
  and owner boundaries, without changing the scope root's author typography.
- Application default namespaces accidentally govern generated structural
  selectors, hiding a valid HTML-prefixed rule. Generated owner/field/limit
  selectors now use namespace-independent universals. The native comparison
  also covers collision with the compiler's preferred namespace prefix.
- Direct fragment insertion retains SVG `a`/`mark` nodes after their unsupported
  root is unwrapped. They have no visible geometry, unlike the old canonical
  HTML reparse. The narrow walker now converts admitted foreign local names to
  HTML after attribute/URL/style filtering, before live publication. Raw's
  separate SVG support is unchanged. Public replacement, adjacent insertion
  and a custom renderer using the supplied parser match the native HTML control.

The complete frozen native follow-up contains **50 result groups / 2755 cases**
plus its original physical editing scenarios. It predates the three later
runtime repairs above and is not attributed to them. Their focused checks pass
all 33 CSS cases, all 45 ordinary pages, both typechecks, 2192 Node tests with
three skips, all eleven FONT/class cases, and exact native glyph PNGs.

The first expanded wildcard-selector attempt accidentally concatenated two
universals and fails 32 cases; that attempt is retained. Corrected selectors
pass the complete **33-case** CSS page, including all previous positive cases.
The expanded Trusted Types page passes too. Standalone probe setup initially
assumed private helpers were plugin-kit exports; that fixture error is retained
separately from the actual invisible-DOM RED. No public alias was introduced.

The CSS font resource test now uses VitePress's locked, self-hosted
`inter-roman-latin.woff2` development asset and forces layout before awaiting
font readiness. It no longer depends on a Windows-installed font. The font
resource is used only by browser tests, not added to the Rector package.

Remaining: fresh frozen checks for these later runtime repairs,
exact Git-source differential replay, broader native authoring/clipboard and
extension integration, and the remaining audit obligations. No new preservation
row is accepted by this initial integration checkpoint.
