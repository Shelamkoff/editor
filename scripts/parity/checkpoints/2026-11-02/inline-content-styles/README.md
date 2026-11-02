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

Remaining: fresh frozen build/types/Node/browser/native/resource/package/docs gates,
exact Git-source differential replay, broader native authoring/clipboard and
extension integration, and the remaining audit obligations. No new preservation
row is accepted by this initial integration checkpoint.
