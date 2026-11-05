# Gallery, Carousel and Person completion — 2026-11-05

Runtime: `e88992ee55b17e635be38a7ef715c076f6a8ac64`. Four exact-Git comparisons
retain v1 `5e5c7f8d`, the specification baseline `e981ff30`, the preceding
candidate `e7fb76e9`, and this candidate. Both ordinary and enforcing Trusted
Types current executions complete: **90 executions / 1557 observations**.
The independent model verifies 1685 served module identities and rejects
29 evidence corruptions, including consistently changed actual/expected values.

The twelve detailed rows listed in `manifest.json` use the following evidence
together with their earlier rich-field/native checkpoints. The common 65-case
roundtrip alone is insufficient to accept these rows.

* `media-sources`: actual local file, uploader and action triggers, batch order,
  a failed middle member, cancellation, one-action Undo/Redo, and caller-data
  preservation. Local WebM bytes survive replay and its managed URL is revoked
  on destruction. Person's ordinary cropper Apply/Cancel and actual remote
  WebP upload work; foreign/Trusted Types fallback uploads the original PNG
  filename, MIME and exact bytes. No permissive default policy is installed.
* `carousel-controls`: navigation/bounds/loop, pagination, thumbnails, aspect
  ratio and saved controls in editor/output. Real decoded 16×16 video receives
  a trusted Space key and actually plays. Output autoplay advances and stops
  on disposal. Under the restrictive policy the supported static output keeps
  every readable slide and native media controls; it is not relabeled as an
  interactive carousel. Existing native media/control/parity pages also cover
  active add/remove/reorder, HTML, source retirement and exact history.
* `person-links`: actual custom social-resolver input and icon classification,
  two complete profiles, roles, biographies, links and Undo/Redo. The responsive
  output's real Next control exposes the second card; a trusted link click opens
  the controlled destination with the independently expected URL/title/heading.
  Earlier `2026-10-30/person-cards-native` covers rich profile removal/reorder.
* `gallery-layouts`: all 21 layouts at actual viewport/container widths 320 and
  600, nonzero geometry of every cell, exact source/caption order, same-item
  detach/reinsert, update, disposal and unchanged input. The preceding runtime
  and both historical references retain six genuine zero-width failures at the
  narrow viewport. The repair removes the user-agent figure margin only from
  Gallery output items; it preserves all layouts and improves old behavior.

The registered Gallery layout pages pass 21 ordinary and 22 Trusted Types cases.
The complete current native plugin parity page passes all **345** cases. Its
initial full run had one Person URL history failure; the first full follow-up
passed that case and failed one generic Embed field grouping assertion. Those
fixtures assumed separately scheduled CDP actions always fit the default typing
window. The test-only `2e2d61e4` input revision delivers the URL as one trusted
beforeinput/input action and explicitly configures a 60-second window in the
generic two-character field-preservation cases. Default history timing tests are
unchanged. The final full 345-case output, both original failures, test-module
hashes/load records and zero production difference are retained. No case or
functional expectation was removed.
The actual headed Gallery viewer pages pass 7 and 8 cases, including a bare
native fullscreen positive control, loop/navigation/captions/zoom/thumbnails,
fullscreen, autoplay interval, rotation/flips/download and owner-scoped cleanup.
The ordinary main-document viewer stays under its existing Expose owner.
The same ordinary seven-case page also passes headless after the driver's
explicit page/focus activation; headed-only success is not assumed to certify CI.
The 65-case HTML layer corpus checks actual native controls on all four
scriptless Raw/Carousel surfaces. The settled application-owned contentStyles
and containing page-window viewport contract are retained.

All ten integration gates pass on the clean immutable runtime: 2247 Node tests,
ordinary browser pages, both typechecks, build/declarations, exact locked package
consumer, heap/history controls, docs/source/locales, site and strict 95.9/96 KiB
fullPreset bundle. Complete native/differential convergence is recorded by the
separate whole-audit checkpoint, not inferred from these media comparisons.

Original v1 foreign Person constructors remain explicitly unsupported/unexecuted,
and historical Gallery failures remain raw FAIL. Earlier copied runner headings
incorrectly named Attaches; their original artifacts are retained as
`initial-scope*`, followed by corrected-scope full executions. The media-source
rerun initially missed one native target during stylesheet loading; its failure
and original fixture remain in `before-style-ready*`. The final fixture waits
for styles/fonts and two animation frames before measuring the actual target.
No functional assertion was removed. The initial independent review's incorrect
event-shape assumption also remains separately recorded.

Reproduction requires Node 24, Chromium and Playwright. Each retained runner
records its exact paths, fixture hash, dependency versions, source graph and
policy. Adapt only local checkout/fixture paths to reproduce in another workspace.
Run the independent checks from the repository root:

```sh
node scripts/parity/checkpoints/2026-11-05/media-completion/review.mjs
node scripts/parity/checkpoints/2026-11-05/media-completion/controls.mjs
```

This is Chromium 155.0.8059.79 / Linux evidence. Other browser engines were not
executed. Compressed artifacts retain their decoded identities in the manifest.
