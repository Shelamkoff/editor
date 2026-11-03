# Rector v2 audit closeout — active work

Browser patch attribution is corrected from the original CDP logs: the
19-gate `a008b32f` run used `.79`; the 20/21-gate integrations and five later
scoped corpora used Chrome `156.0.8078.80`. Original data/hashes/outcomes are
unchanged. The [environment checkpoint](scripts/parity/checkpoints/2026-11-03/browser-environment/README.md)
preserves the full primary logs and manifests. This adds no accepted row.

## Public block structure acceptance — 2026-11-03

The current register is **104/209 accepted, 105 open**. `PUBLIC_STRUCTURE`
passes 58 cases / 1,192 observations, 1,250 independent checks and nine rejected
corruptions on `c45a2e39`. Insert/update/remove/move/default, nested Table rows,
owned inputs, semantic no-ops, one-action nested commands and caught-error
rollback pass. Explicit host commands retain their read-only contract. All five
frozen gates and all 52 ordinary pages pass; runtime remains byte identical to
separately integrated `efc619d2`. The [checkpoint](scripts/parity/checkpoints/2026-11-03/public-structure/README.md)
retains complete raw corpora, model, corruptions and source hashes. Other public
contracts and whole-library readiness remain open.

## Public block selection acceptance — 2026-11-03

At that checkpoint the register was **103/209 accepted, 106 open**. `PUBLIC_SELECTION`
passes 44 cases / 1,142 observations, 1,186 independent current checks and nine
rejected corruptions on `455d0488`. Live/stale IDs, removed/replaced roots,
same-ID replacement, document order, both modes and a matching-ID second editor
pass. Control calls preserve canonical data, focus, exact native range and seeded
Redo; real replay remains available after leaving read-only mode. All five frozen
gates and all 51 ordinary pages pass. Runtime remains byte identical to separately
integrated `efc619d2`. The [checkpoint](scripts/parity/checkpoints/2026-11-03/public-selection/README.md)
retains the complete corpus, model, corruptions and source bindings. Other public
contracts and whole-library readiness remain open.

## Public document lifecycle acceptance — 2026-11-03

At that checkpoint the register was **102/209 accepted, 107 open**. `PUBLIC_RENDER_CLEAR`
passes 34 cases / 944 observations, 978 independent current checks and nine
rejected corruptions on `10d14098`. Changed/equal/empty render and clear retain
versions, fresh default identities and exact replay; old instance/task rights
retire while fresh no-op tasks remain live. Strict validation rejects four
invalid inputs without damaging the existing document or rights. All five
frozen affected gates and all 50 ordinary pages pass. Runtime remains byte
identical to separately integrated `efc619d2`; no production change was needed.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/document-lifecycle/README.md)
retains complete logs, raw historical failures, model, corruptions and hashes.
Other public contracts and whole-library readiness remain open.

## Public snapshot acceptance — 2026-11-03

At that checkpoint the register was **101/209 accepted, 108 open**. `PUBLIC_SNAPSHOTS`
passes 26 cases / 333 observations, 359 independent current checks and nine
rejected corruptions on `efc619d2`. Two attributed regressions are repaired:
unknown-block mode transitions and old iterator payloads borrowing new status.
The mode source `efb62a4b` separately passes all 33 gates in `run-dcsNke`
(95.8/96 KiB gzip); the final iterator delta passes 13 affected gates in
`run-QNIWAU`, including all 49 ordinary pages, native tools, model, bundle,
heap, package and site. Per-source scopes and both original REDs remain intact.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/public-snapshots/README.md)
contains full logs, model, corruptions and source bindings. Other public
contracts and whole-library readiness remain open.

## Exact Bold range acceptance — 2026-11-03

At that checkpoint the register was **100/209 accepted, 109 open**. `DEFECT_ELEMENT_RANGE`
is accepted on `d39b0d8d`: 20 cases / 324 observations, 364 independent checks
and eight rejected evidence corruptions. Text/selectNodeContents endpoints
select the same lowercase alpha for trusted Bold apply/remove and exact native
replay in both directions. Foreign selection, read-only and destroyed-owner
denial retain live positive controls. All five frozen `run-VD5AD9` gates pass.
Production remains byte identical to separately integrated `e2053f58`; the
48-page ordinary run is reused only after proving its sources unchanged.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/element-range/README.md)
contains complete logs, the corpus, executed model, corruptions and source
bindings. Other tool rows and whole-library readiness remain open.

## Alignment action acceptance — 2026-11-03

At that checkpoint the register was **99/209 accepted, 110 open**. `TOOL_ALIGN_ACTION`
passes 80 cases / 2,520 observations and 2,680 independently rebuilt checks.
All four alignments, mixed state, range direction/boundaries, rich fields,
widgets, exact native history, no-op Redo and retired panel ports pass. Nine
evidence corruptions are rejected. The first run `run-rwO0s2` retains its
verifier-format failure and seven successful gates (types, all 48 ordinary
pages, four native groups and docs); the separate corrected three-gate proof
`run-QAfWYn` passes on `b18457a2`. Corpus source is `247b4a42`; runtime remains
byte identical to separately integrated `e2053f58` (28 gates, 95.6/96 KiB gzip).
The [checkpoint](scripts/parity/checkpoints/2026-11-03/alignment/README.md)
retains both source identities, full logs, failed and corrected verifiers,
corpus and hashes. Other tool rows and full readiness remain open.

## Script panel acceptance — 2026-11-03

At that checkpoint the register was **98/209 accepted, 111 open**. Two Script/panel rows
are accepted on clean unchanged `2c6fd5f4`: 128 native cases / 6,400 passing
observations and 5,148 independent semantic checks. Nine corruptions are rejected;
all four frozen proof gates pass in `run-IVwEy6`. Runtime and native fixtures
are byte identical to `e2053f58`, whose separate **28-gate integration passes**
in `run-vCAX7O`, including all 48 ordinary pages, 265 old native tool cases,
all 128 Script cases, recent C12 groups and earlier HTML/resource/package gates.
Actual enforced fullPreset size is **95.6 KiB gzip / 96 KiB**.

The [checkpoint](scripts/parity/checkpoints/2026-11-03/script-tools/README.md)
retains two immutable REDs and both complete integrations. Script mode now
uses selected author text and stays inside its field; outer application sup/sub
cannot suppress an authored action. Panel focus, exact native history/ranges,
widgets, no-op Redo and retired UI remain protected. The successful earlier
27-gate source retains its own 95.4 KiB result. Raw comparison exit 1 and manual
review exit 0 remain distinct. Verification is by the author with an independent
model. Remote was fetched again: still `3fcfa866`, no incoming changes or push.
Other tools and remaining functional rows follow; B-HTML and full readiness
remain open.

## Standalone presentation acceptance — 2026-11-03

At this checkpoint the register became **96/209 accepted, 113 open**. Two field-local rows are
accepted on clean unchanged `4501d0cd`: 20 public and 14 native cases / 295
manual expectations, genuine IME/pending trusted input, backward/foreign ranges
and healthy tasks. All six gates in `run-ajbeH2` pass, including all 48 ordinary
pages, the separate native driver, both Git comparisons and seven rejected
evidence corruptions. All 63 original owner controls keep their assertions.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/presentation-authority/README.md)
preserves original corpora, raw exits 1 versus review exit 0, manifests, verifier
and hashes. Runtime remains byte identical to separately integrated `f2070510`;
real legacy native controls execute without emulating v2 ports. Script/panel
and other remaining rows follow; B-HTML and full readiness remain open.

## Decoder/unknown-inline acceptance — 2026-11-03

At this checkpoint the register became **94/209 accepted, 115 open**. Two decoder/unknown-inline
contracts are accepted on clean unchanged `d7eecafd`: 24 cases / 215 manual
expectations, seven owner records and twelve primitive-cause records. All five
gates in `run-zTaAYr` pass, including all 47 ordinary pages and seven rejected
evidence corruptions. The
[checkpoint](scripts/parity/checkpoints/2026-11-03/decode-authority/README.md)
retains raw exit 1 versus review exit 0, original manifests, primary browser
environment, exact verifier and hashes. Three actual v1 opaque-data losses
remain FAIL; improved current preservation stays. Candidate runtime and Chrome
product/revision match separately integrated `f2070510`; no production change
was needed. The blank-page object-transport diagnostic and JSON-string repair
are recorded as a test issue. Standalone presentation is next; B-HTML and full
readiness remain open.

## Optional inline/native-caret acceptance — 2026-11-03

At this checkpoint the register became **92/209 accepted, 117 open**. Seven optional-instance
contracts are accepted on clean unchanged `baa0ffc5`: 30 ordinary and eight
trusted native cases / 406 manual expectations. All six gates in `run-mFAfGI`
pass, including all 46 ordinary pages, the separate repository native driver,
two Git comparisons plus manual model and six rejected evidence corruptions.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/optional-inline/README.md)
retains both corpora, both original manifests, verifier bytes and the failed
first fixture setup run. Runtime paths remain byte identical to separately
integrated `f2070510`; no production behavior changed. v1's actual native
Paragraph control is executed without emulating current instance/task ports.
Decoder/unknown-extension and standalone presentation obligations are next;
B-HTML and full readiness remain open.

## Continuation/history acceptance — 2026-11-03

At this checkpoint the register became **85/209 accepted, 124 open**. Three named
continuation/history contracts are accepted on clean unchanged `442c8825`:
22 cases / 230 independent manual expectations, 275 verified production
modules and all five affected gates in `run-zzJNsr`, including **all 46 ordinary
browser pages**. Five corruptions are rejected. The
[checkpoint](scripts/parity/checkpoints/2026-11-03/continuation-authority/README.md)
retains both original manifests, complete raw results and verifier bytes.
Runtime paths are byte identical to separately integrated `f2070510`.
v1's actual diagnostic callback and later public render are explicitly executed;
current deferred delivery and instance task/history improvements remain.
Comparison exit 1 and review exit 0 remain distinct. Remote was fetched again:
still `3fcfa866`, no incoming commits, push or publication. Optional inline
update/projection obligations follow above; full readiness remains open.

## Public mode-recovery acceptance — 2026-11-03

At this checkpoint the register became **82/209 accepted, 127 open**. Four named mode/disposal
contracts are accepted on clean unchanged `4c23285d`: 58 public block/inline
cases / 762 manual expectations, 275 verified production modules and all six
affected gates in `run-Rwj0PO`. Both ordinary browser pages pass, including
the earlier 34 task cases. Five evidence corruptions are rejected. The
[checkpoint](scripts/parity/checkpoints/2026-11-03/mode-recovery/README.md)
retains original results and both manifests; runtime paths are byte identical
to the separately integrated `f2070510`. v1's real public mode round trip
retains native editability/text and its two reconstructions; current useful
instance preservation remains. Historical comparison exit 1 and independent
review exit 0 remain distinct. Callback continuation and completion history
follow above; full readiness remains open.

## Public task/read acceptance — 2026-11-03

At this checkpoint the register became **78/209 accepted, 131 open**. Nine named public
task/read/disposal contracts are accepted on clean unchanged `61ec543e`:
34 cases / 333 independent manual expectations, 275 verified production
modules and all five affected gates in `run-jV7549`. The plain browser page
passes without the observation wrapper; all five corruptions are rejected.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/task-authority/README.md)
retains source identities, full data, checker bytes and reproduction. Runtime
paths are byte identical to separately integrated `f2070510`, whose original
21-gate manifest is preserved. Historical raw comparison exit 1 is retained;
candidate/model review is 0. No production behavior was changed. Other C07/C12
obligations and full readiness remained open; mode recovery follows above.

## Inline Code/Marker acceptance — 2026-11-03

At this checkpoint the register became **69/209 accepted, 140 open**. Only `TOOL_CODE_ACTION`
and `TOOL_MARKER_ACTION` are newly accepted on `d4f026f8`: 64 complete cases /
2996 observations across both tools, independent manual/source review and six
unchanged-source affected gates in `run-02FJXq`. The original 96 basic-mark
native cases also pass. All production paths and loaded modules are byte
identical to the separately integrated `13b79cc6`; no tool behavior was changed.
The [checkpoint](scripts/parity/checkpoints/2026-11-03/code-marker-tools/README.md)
retains exact observations, manifests and three rejected evidence corruptions.
Legacy/specification-baseline failures retain raw exit 1; current improvements
remain intact. Full audit readiness is not claimed.

The next confirmed HTML defect is an opened native popover styled by the
application with `position:absolute`. On exact `d4f026f8` the native control
passes, while all four public surfaces clip the box. Its source-attributed
RED is `test-results/audit-closeout-2026-11-01/html-absolute-popover-red.json`.
The repair retains the application's absolute positioning. Clean, unchanged
`f2070510d2bbe22b2d6244f273c890f070de16de` passes **all 21 integration gates**
in `run-xxJbdd` (2026-11-03, 01:01:14–01:15:05 UTC), including all 65
native/public layer cases and the separate 64 native Code/Marker cases. The
actual enforced fullPreset result is **95.4 KiB gzip / 96 KiB**. The original
manifest SHA-256 is `38a9a5540d05ae594f6fae67fbe7c6d4f884ab1ab807c2084f9d3271e2a30f09`.
Context-menu/fullscreen UI remains unverified
after the computer-use URL-detection stop.

## Resource follow-up — 2026-11-03 local date

Remote was fetched again and remains `3fcfa866`; no incoming commits, push or
release. Before Code/Marker acceptance, the register was **67/209 accepted,
142 open**. This follow-up
repairs font-resource churn, restrictive author referrer policy and a real
Person FileReader-construction retirement defect. The
[HTML checkpoint](scripts/parity/checkpoints/2026-11-02/html-boundary-integration/README.md)
records actual native controls, immutable preceding-source failures and scope.

`run-HKjDx0` on unchanged `5c73e176` passes fifteen of sixteen gates; its site
gate fails on unquoted technical terms in the Russian review. The prose is
corrected. That run remains failed. Current pre-commit checks pass all 45 browser
pages, both typechecks, the expanded 52-case loading probe, 24 real HTTP/CSS
comparisons and 24 viewport-token tests. The enforced fullPreset budget now
passes at **95.5 KiB gzip / 96 KiB**, with byte-identical shared SVG artwork.
The fresh combined run `run-A9Taxq` passes **all 19 gates** on clean, unchanged
`a008b32ff6ac10b05234c4d60876a88d3501c6d3` (23:07:25–23:19:08 UTC on
2026-11-02; 2026-11-03 local date). This run uses Node **24.22.2**, independently
of preceding Node 24.9.0 evidence. Its actual enforced bundle result is
**95.6 KiB gzip / 96 KiB**. All 2198 Node tests pass, with three platform skips;
all 45 ordinary browser pages and the five selected native groups pass.
B-HTML and full readiness are not claimed. A subsequent native probe reproduces
clipped fixed elements and opened popovers in all four HTML surfaces. The repair
on `13b79cc6` passes **all 20 frozen integration gates** in `run-DLyD1O`, including
all 60 public/native layer cases. Exact preceding `a008b32f` fails 28 of them
while all twelve native controls pass. The final actual bundle is **95.5 KiB
gzip / 96 KiB**. Native context-menu/fullscreen UI remains unverified because
computer-use stopped when it could not confidently identify the current URL.
The completed separate Code/Marker proof is recorded above.
Earlier source-specific acceptance remains in force.

## Accepted integration — 2026-11-02

`run-PC0mTs` passes all **17 gates** on clean, unchanged
`e3cbb0d5306c58b9860d07345e341901dc5f536b`, 20:13:42–20:43:20 UTC.
This accepts `RENDERER_ERRORS`: **67/209 accepted, 142 open**. The complete
348-case comparison and independent review repeat 6918 observations per source,
with zero current/specification/parent failures and all 3636 v1 differences
retained. C09/T15 measured structural proof is also accepted in this environment;
it adds no register row. The isolated core comparison, source/trace/GC review
and four fresh canonical corruption controls pass. Slower sub-metrics remain
documented in the checkpoint.

All 2192 Node tests pass with three platform skips; both typechecks, 45 ordinary
pages, the complete native matrix, glyphs, navigation, deferred loading,
responsive content, enforced bundle, heap/history, docs, installed package and
site/demo pass. FullPreset reports **95.9 KiB gzip / 96 KiB**; the core target
stays informational. Every command records unchanged source. Earlier failed
integrations remain failed and are not relabelled.

The next B-HTML probe demonstrates a distinct resource leak when the actual
public owner retires inside browser resource construction/observation. A
prepared repair passes 60 public-surface regressions, including falsy partial
failures, real resource release and fresh valid output. It still requires
production integration and affected checks; B-HTML remains open. No push/release.

## Prior implementation checkpoint — 2026-11-02, before final integration

Latest implementation is `906e3dbf`; `68b7c913` changes only two HTML-ready
observations. Remote was fetched again and remains `3fcfa866` (no incoming
commits). Register acceptance is still **66/209, 143 open** pending final
integration; no push or release.

The enforced fullPreset budget now passes at 96.0 KiB gzip, preserving the
96 KiB limit and immediate application upload callbacks. The first deferred
Gallery upload introduced a real cold-drop regression; `8761946d` repairs it
without weakening either original drop assertion. All 37 loading/retirement
controls and 11 uploader checks pass.

Isolated C09/T15 evidence compares `8761946d` with `906e3dbf`: identical 184-module
graphs except `InlineProjectionRuntime`. It passes 74 controls, 56 timing and 56
attribution groups, 14 memory observations and independent source/trace/profile
review. The [checkpoint](scripts/parity/checkpoints/2026-11-02/core-prepared-fields/README.md)
retains slower sub-metrics as well as the large-structure improvements.
The [renderer error matrix](scripts/parity/checkpoints/2026-11-02/renderer-errors/README.md)
passes 348 cases / 6918 observations per source on current/specification/parent,
with all v1 differences retained. It adds no acceptance before integration.

`run-hjYzYh` remains failed (13/14 gates, Gallery's first remote drop).
`run-qoqb4j` remains failed (15/16 gates, three Carousel common cases observing
the private empty iframe document before author projection). Raw's independent
replay exposes the same observation race once. The test-only readiness correction
waits for actual benign author nodes while retaining explicit empty Raw cases
and every prior expected value. Four Carousel cases pass; Raw completes all
21 cases / 1421 current observations with zero differences, versus the unchanged
226/30 historical failures. A new common run is required; neither failed run
is relabelled.

The selected C06 style boundary is now accepted on immutable `7a77b7aa`:
`run-uxve4N` passes all eleven gates with unchanged source, including 2757
native cases / 50 groups, 33 style cases, 72 navigation comparisons, heap,
installed package and site. Git-byte FONT replay has no unexpected differences;
review verifies 1584 observations and 471 module records, plus two rejected
evidence corruptions. **B-STYLE closes only for this selected contract/scope.**
Register acceptance remains **66/209, 143 open**. B-HTML and full C09/T15 remain
open. The initial bundle report measured fullPreset at 98.8 KiB gzip versus its
96 KiB enforced budget; the later repair is recorded above. The informational
core target remains unmet. No push/release.

The user asked to continue after the requested stop below. Remote is fetched
again and remains `3fcfa866`. The saved inline CSS experiment is restored; its
stash and exact backup remain intact. C06 selects the explicit application CSS
and isolated live author-class representation for integration. The focused
native FONT/class corpus, actual glyph comparison, CSS/native ownership cases
and ordinary browser suite pass. Broader immutable integration/differential
proof remains to be completed; acceptance stays **66/209, 143 open**.

## Requested stop — 2026-11-02

The user requested finishing the current checkpoint, reporting readiness and
stopping. Work is paused, not complete: **66/209 accepted, 143 open**.
See `RECTOR_V2_READINESS_2026-11-02.md` for the current status and restart data.

Clean candidate `2c10547213ab4973a656ac93a52f1986931be605` passes all eight
scoped final gates in `test-results/run-LWJSnt/`: build, 2191 passing Node tests
with three skips, both typechecks, all 45 ordinary browser pages, 28 native HTML
cases, 62 native source-mode cases, heap/history (23 sentinels, zero retained)
and documentation contracts. The source identity is unchanged throughout.
This is not a full native, package/site or whole-audit acceptance run.

Unaccepted inline CSS implementation is preserved outside the working tree in
stash `bd26ff6e7ac59db70ce76534405f21ab459613ca`. All 14 original file hashes
also match the separate copies in
`test-results/audit-closeout-2026-11-01/paused-inline-css/`. Its 14 Node failures
and earlier two-case native pass remain experimental evidence; no C06 adoption
or B-STYLE closure is claimed. No push or release has been performed.
Do not resume audit work without a new user instruction.

## Earlier execution log

User instruction: continue until the complete current audit is closed; preserve
improved v2 behavior rather than reproducing inferior v1 behavior.

Normative target: `RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`.
Single preservation register: `docs/architecture/rector-v2/PRESERVATION.md`.
Current recorded acceptance: **209 unique IDs, 66 accepted / 143 open**.
The open count is a proof-obligation count, not a confirmed-bug count.

Latest local immutable production checkpoint: `1226c8fa` (Raw Blob URL and
Trusted Types parser ownership), following `28b83e13` (Code acceptance),
`40bab78d` (native clipboard reference), `2833feb7` (Git-byte comparison),
`1dd4d0a1` (archive fixes) and `282d3077` (Windows checks). No push/release.
Five frozen-patch gates in `run-1Xc9oI` pass; all 44 ordinary browser pages pass
separately on the same runtime bytes. These are not a full native rerun.

C05 now selects the demonstrated scriptless-frame/explicit-contentStyles
contract before production work. The decision checkpoint is
`scripts/parity/checkpoints/2026-11-01/html-style-decision/README.md`.
Decision-only fixtures pass 13 native cases plus 12 independent native-link
comparisons. Production integration, all four surfaces and C06 remain open.

## In-flight implementation after `9913eb1e` (do not call accepted)

`9913eb1e` commits the C05 selection and isolated evidence. The current dirty
patch introduces `contentStyles` snapshots/types and passes them through the
existing ExtensionRegistry/renderer contexts. `shared/embeddedHtml.js` is now
used by Raw editor/renderer and Carousel editor/renderer. Carousel output's
existing resource map co-owns frames; its view controller retires editor HTML.
Canonical data is unchanged. The old experiment's token module temporarily
re-exports `shared/rebaseContentViewport.js`; both are tracked by Git/diff.

`tests/browser/content-styles.html` is registered as ordinary page 45. Nine
public cases pass in `html-initial-admission-green.log`: validation, immutable
one-read styles, all output routes/realms, all four surfaces, Raw update/replay,
actual first-mount adoption and rejection of initial-document substitution.
The tenth case (`html-vertical-viewport-red.log`) originally failed correctly:
logical viewport units must use the consuming element's writing mode, not the
root's previous/default mode. The later affine correction below supersedes that
implementation; do not substitute a second root-style pass for consumer semantics.

Initial admission now requires the exact static srcdoc and `about:srcdoc`,
then binds to the actual first mounting Document. Only that admitted child is
accepted thereafter. Original source adoption from a detached render into a
different Window must continue to work. The nine-case pass proves this.

The first 45-page run stopped at security's old blanket iframe ban. Security
and Trusted Types tests now admit only the exact owned frame and inspect every
author child node/attribute in its actual Document. Both focused pages pass.
Both srcset pages also pass after observing decoded images inside all four
frames, with exact currentSrc/metadata and canonical/history assertions.
These fixture migrations do not whitelist author iframes or skip sanitization.
Later broad checks are recorded below; full native/package/docs proof remains pending.

New `native-html-content.html` / `regressions/html-content-native.js` is now
registered in the full native aggregate (not yet executed in full). `Input.wheel` was added to the
existing physical driver's narrow bridge. Original wheel attempts with an
unsupported method (and an early source shadowing correction) are harness
failures. The valid RED `html-short-wheel-valid-red.log` shows all four surfaces
scrolling readable short HTML into 250px of artificial blank root overflow.
Production now gives root `overflow-y:hidden`, retains the original 100px
minimum preview height and uses setAttribute for sandbox. Its first replay
could no longer deliver wheel to the non-scrollable child: Chrome can chain it
to the parent. The fixture now requires a trusted move inside the child plus a
trusted wheel in child/parent, and unchanged child scroll/content positions.
The corrected telemetry subsequently passes alongside the intentional scroller.

Four further native tests correctly fail in `html-body-scroller-red.log` because
measure uses an intentionally scrollable body's internal scrollHeight as outer
height. Respect body overflow: the body border-box determines outer flow when
it owns scrolling/clipping; visible overflow still contributes natural extent.
The production measure now makes that distinction; actual trusted wheel keeps
that body scroller usable on all four surfaces.

Important CSS research before further implementation: W3C CSS Values 4
https://www.w3.org/TR/css-values-4/#viewport-relative-lengths says logical vi/vb
resolve using the element's computed writing mode, with initial mode for media
queries. Raw/custom-property/animation consumers can have different modes.
Rewriting all logical tokens to one root-dependent px value is incorrect.
One viable direction to test is affine native-unit rebasing: for native frame
viewport Wn/Hn and selected parent Wp/Hp, a=(Wp-Hp)/(Wn-Hn), b=(Hp-a*Hn)/100.
Replace n*vi/vb with calc(n*(a*vi/vb + b*px)); native vi/vb retain per-element and
custom-property semantics. Recompute coefficients atomically after frame height
changes so body meaning remains independent of that height. Resolve original
media conditions via parent.matchMedia before token conversion. A square native
viewport needs an explicit numerical/geometry treatment (one extra pixel of
unclipped flow is a candidate, not an accepted cap or glyph-clipping fix).
Prove this against an independent full-page native CSS control, including
opposite element writing modes, inherited custom properties and near-square
dimensions before adopting it. Parent unit bases should eventually come from
native CSS measurements, including small/large/dynamic families, not an assumed
single innerHeight for every family.

An alternative reciprocal iframe/root-transform experiment is preserved only
in ignored `html-viewport-transform-decision.mjs`, its JSON and PNGs. It uses a
fixed page-sized native viewport and compensating transforms to show natural
flow. Geometry and visible text are present; screenshots were inspected.
Compared with an ordinary iframe it changes LCD/grayscale antialiasing. No
production adoption or failure conclusion is made. Top-layer/native control
effects and numerical/paint quality remain unverified. Do not silently replace
the current boundary with this experiment or ship two geometry modes.

Fixture corrections retained in logs include renderTo argument order, the
blocks.update record-to-patch shape, and volatile save.time exclusion. They are
not product defects or valid RED evidence. Broader native/differential fixtures
still observing literal preview.srcdoc or same-document HTML descendants need
semantic migration to actual child content. Known files: raw-source-parity,
block-roundtrip-fixture, native-plugin-parity, native-plugin-media and
regressions/raw-readonly-selection-native. Keep historical FAIL raw and serve
immutable version sources when rerunning comparisons.

### Latest implementation checks (continuation 2026-11-02)

Affine logical-unit rebasing is implemented in `shared/rebaseContentViewport.js`.
It retains native vi/vb terms until consumption, including inherited custom
properties and dynamic per-element writing modes. An independent native CSS
reference at 1400x800 matches all 96 field comparisons across six native frame
heights in ignored `html-logical-affine-decision.json`. Natural square-axis
results receive one unclipped CSS pixel of additional flow; coefficients update
after height changes. The eleventh public test verifies actual square flow,
both consumer modes and a later mode change without reprojection. All 11 public
tests pass (`html-square-consumer-green.log`). The reciprocal-transform design
is not adopted; production retains one ordinary frame geometry.

Build passes with 288 declarations/zero source diagnostics; full Node passes
2,191 tests with three platform skips; all 45 ordinary browser pages pass;
both typecheck projects pass. These are separate WIP runs, before the final
activation-lifetime correction and paired documentation changes below, not a
new combined immutable acceptance (`html-wip-*.log`, `html-affine-types.log`).

Four native parent-observer retirement cases then reproduced stale navigation:
even a passive parent click listener could destroy the frame, after which its
delegated anchor still navigated. The corrected RED is
`html-activation-retirement-corrected-red.log`. Destroy now strips the exact
pending owned anchor's href before default activation and removes it only from
its original parent. This works in passive observers without stopping event
fan-out. An intermediate null-guard mistake remains a failed implementation
attempt; it was corrected before the final replay. The final native page passes
all **16** cases: four short-scroll controls, four intentional scrollers, four
retired activations and four live requested-parent destinations. Evidence:
`html-native-live-retired-final.log`. Native input trust is observed at child
Window capture, before disposal can discard target-phase callbacks.

Paired EN/RU Raw/Carousel/renderer/style/config guides now document explicit
contentStyles and migration, and correct the inherited false claim that empty
Raw drafts fail persistence. Readonly-array public type consumers are added.
Next: finish current combined gates, update the implementation checkpoint,
commit the tested source for immutable comparison; migrate remaining native
and differential fixture DOM assumptions; verify actual links/download/media,
mixed/fixed-ratio Carousel, failure/realm/resource lifetime; complete C06 and
the other open rows. No additional preservation row is accepted yet.

### 2026-11-02 integration follow-up

Frozen runs `run-97d5ef` and `run-YUkVdZ` retain failed overall results and
unchanged source identities. The first passes build/types/45 browser pages/
16 native HTML/heap/package, but Node/docs/site reject incomplete new docs.
The second passes actual logical CSS (96 dimensions/48 modes), but rejects
untranslated viewport prose and a stale built README. Translation/config docs
are corrected; the next build refreshes package docs before validation.

Native tests reproduced the needless 100px floor in reader/Carousel HTML. Only
Raw editor preview now retains that affordance. The final 20-case native page
passes; a 20px font/20px line-height intermediate fixture exposed legitimate
one-pixel ink overflow and is retained separately from the final 16px font
reference. No glyph clipping or blanket containment was introduced.

New actual-product responsive CSS comparison reproduced 16/20 mismatches:
logical lengths inside media conditions were rebased against child geometry,
and preference changes without resize stayed stale. Original media queries
now resolve in the parent before rebasing declarations; their change listeners
belong to the existing abortable view. All 20 native-CSS comparisons pass on
all four public surfaces. Real navigation also passes all 48 comparisons
against independent bare anchors (12 target/modifier routes per surface).
Eleven public style cases, five Raw source/history/control native cases and
the native Carousel HTML source/history case pass on the new runtime bytes.

Remaining source/native/differential fixtures now observe admitted author
Documents. Fixed benign historical opaque previews explicitly retain literal
srcdoc observation; unmounted output defers only unavailable author-content
checks until first mount while retaining structure checks. Those comparative
edits need immutable execution. No new row accepted: still 66/209, 143 open.
Next run the complete frozen integration matrix, commit tested source, replay
adapted comparisons, finish C05 resources/media/failure/CSS-family/accessibility
proof and the separately unresolved C06 inline boundary.

### Frozen run and disposal follow-up, 2026-11-02

`run-HfVO99` completes with unchanged source and **failed** overall status:
eleven of twelve gates pass, including 2,191 Node/three skips, 45 browser pages,
all CSS/navigation corpora, heap23/zero, package and 127-page site/demo. Full
native execution times out on `native-retained-tools.html`; isolated replay
passes its64 cases. The native harness now records active/completed/total case
progress on timeout, without changing deadlines or assertions. A diagnostic
copy with a longer external deadline also passes64, but is not an acceptance
runner. Do not report the full native matrix as passed.

Controlled observer-disconnect failure then reproduces active media-query
subscriptions after disposal on all four surfaces. Four permanent public tests
fail first, then all15 content-style cases pass after best-effort independent
cleanup and local automatic-retirement failure reporting. Explicit disposal
preserves its first thrown value; abort listener failures do not escape globally.
The next frozen run must cover these later runtime bytes. Raw immutable fixture
checkout verification now permits only CRLF/LF; served Git bytes are unchanged.
Publication review's top current count is fixed to66/143, matching its existing
Code acceptance. No new row is accepted.

Ignored C06 decision scripts `inline-class-public-decision.mjs` and the three
raw outputs (original selector-observation failure, corrected observer, glyph
comparison) retain their own distinction. A public Paragraph editor/renderer
with proposed server-only namespace transforms preserves native input/Undo/Redo,
canonical source/sidecar and one true mention alongside a colliding literal.
The hostile native class control blocks a real host click; the namespaced
proposal restores it. Its201px italic glyph PNG equals the benign control byte
for byte. Production inline files remain unchanged; do not call this C06 proof.
`canonicalizeRichTextSubtree` runs on a detached serializer clone, so its class
namespace loss there is not by itself a live-DOM failure. Core's separate
template replacement path does need presentation namespacing before insertion.

Next: complete current packet verification and commit; replay Raw and Raw/
Carousel ROUNDTRIP immutable comparisons; finish actual media/download/control,
resources/CSS-family/accessibility proof; implement and verify the separately
selected inline class mechanism only after its complete CSS/lifetime decision.

### Production checkpoint and immutable replay

Production HTML integration, including observer-failure cleanup, is committed
locally as `0bedf9a4c1f8ffb85ce508229c2299a0d174408e`. A fresh origin fetch
still finds `3fcfa866`; no remote changes, push or release. Raw source/preview
executes all21 cases/source: v1 226 raw failures, baseline30, candidate0;
all complete. Raw ROUNDTRIP completes both current cases/346 observations with
no unexpected differences. Windows archive path containment and Git byte
serving are corrected in the separate test-runner continuation.

Carousel's first replay finds39 differences, all attributable to newly required
rel protection omitted by the old expected markup. Retain the improvement.
The independent oracle now requires noopener/noreferrer; only exact historical
missing-rel combinations receive a repaired classification. Four current cases/
718 observations pass completely; historical failures and two incomplete
baseline widget cases remain explicit. Old/fresh classifier sensitivity runs
pass with123/181 classified failures, rejecting candidate exceptions and altered
data/identity/mode/phase/expected values. No new preservation row is accepted.

All28 native HTML cases pass: previous20 plus four actual completed Blob
downloads and four actual native video playback/disposal controls. Independent
bare downloads and video decoding prove caller-owned Blob URLs remain live.
The first fixture's Blob fetch was disallowed by existing connect-src policy,
and a video center click was not its native play control; those are fixture
failures, not product RED. Final tests retain the original CSP and use trusted
Space plus independent browser controls. Source/history/caller data stay exact.

Next freeze and complete the integration matrix on the committed packet,
including the full native matrix with new progress diagnostics. Then finish
C05 fixed-ratio/mixed controls, resources/credentials, CSS-family/realm/failure/
accessibility proof and C06 selector/style-lifetime integration. Still66/209
accepted and143 open; the complete audit goal remains active.

### 99beda44 integration: actual failures and continuation

`run-MH9A9I` retains failed overall status and unchanged source. Build, types,
45 browser pages, logical/responsive CSS, heap, docs, package and site pass.
Node accidentally discovers tests in the newly extracted historical archives;
the archives are now inside the same ignored immutable directory's node_modules,
with no production source change. Repeat current Node independently.

Windows System events confirm sleep at02:47:56 (Kernel-Power42) and resume
at11:14:29 (Power-Troubleshooter1). The native run, begun before sleep, loses
CDP after the following completed named groups: Attaches downloads13, HTML28,
conversion grouping88, conversion preservation53, interaction39, retained tools64,
conversion continuations65, font58, background36, link36, panel36, source
indentation54. Other manually recorded earlier pages are in that run's own
output/runner; do not invent their counts or call the full matrix passed.

An independent post-resume Source Modes execution has62 cases,35PASS/27FAIL.
All27 failures are old exact empty-sandbox expectations, before continuation
checks can execute. Source Modes and Raw design fixtures are now migrated to
the selected exact scriptless boundary and actual child text, retaining all
caret/range/input/history and canvas checks. The next focused replay is pending.

The navigation gate also records one failed Raw-editor self destination: its
fixed250ms observation saw no request. The new oracle waits up to5s for the
actual requested native destination/topology and requires a positive settled
state for the independent bare control. Comparison remains exact; this is
functional waiting, not accepting a missing transition. Fresh replay pending.
No production change, new accepted row or full integration pass is claimed.

Ignored inline research now includes a16-case selector-token prototype and a
native CSSOM comparison script prepared but not yet run. The actual public
201px glyph/input/mention decision remains separate from a complete compiler
or adopted inline policy. Reuse the selected explicit contentStyles input;
do not invent a trust flag, classname allowlist, paint clipping or wire alias.

Post-resume frozen follow-up `run-a0RspD` passes all four gates with unchanged
source:2191 Node/three skips, all62 Source Modes cases, four Raw design cases
(16 state/theme/width combinations), all48 native navigation comparisons.
The selector-token prototype's native CSSOM decision replay also passes16/16,
with zero page errors and no production inline change. All past failed runs
retain their own results. Full native and whole-audit acceptance remain open.

## Accepted user decision

On 2026-11-01 the user selected **explicit application-owned content styles and
viewport units referenced to the containing page window** to settle the
outstanding HTML/style contract. This decision authorizes that contract choice;
it does not prove an implementation or adopt a previously rejected prototype.
Do not ask the same choice again. Test a coherent confined boundary, amend
C05/C06 after evidence, then integrate all four Raw/HTML Carousel surfaces.

## Active execution

1. Complete E-HTML/E-STYLE research against the selected contract: scriptless
   owned frame, actual permitted navigation/downloads/media, explicit content
   styles, stable parent-window viewport lengths, containment and lifetime.
   Prior prototypes under `scripts/parity/checkpoints/2026-10-29/html-style/`
   remain immutable historical evidence. Their resize feedback loop and clipped
   italic glyph are rejected approaches, not production fallbacks.
2. Complete the two Attaches rows with immutable historical/current comparison,
   quotas, pending upload/read/export failure and exact resource ownership.
   Existing local fixes and 13 real-download cases are useful but not full-row
   acceptance.
3. Review existing complete comparison corpora first (Code controls, renderer
   lifetimes, owned formatting, Embed preview, Gallery viewer); rerun on an
   attributed immutable candidate and close only obligations fully covered.
4. Add missing semantic comparison cases for the remaining block/tool/inline,
   public API, input/clipboard, extension and recovery rows. Expected values
   must be independent; repaired historical defects and genuinely unavailable
   historical APIs stay explicit. Do not turn historical FAIL into PASS.
5. Complete structural C09/T15 performance proof and architecture-to-target
   review. Reduced traversal without comparative end-to-end benefit is not full
   performance acceptance.
6. Run the complete browser/native/resource/package/docs/typing suite plus all
   differential corpora on one final immutable identity. Complete audit means
   no material unresolved findings, not merely a green smoke run.

## Current source and completed local work

Base branch `refactor/rector-v2-architecture`, HEAD
`3fcfa86647a081b6485287ae7b888be0a44f95c7`. Previous changes are local and must
be preserved. They repair ZIP replacement/destroy reentry, pending stream
cancellation and reader release, portable filename clipping/collisions, plus
Windows verification issues. Their two checkpoints are:

- `scripts/parity/checkpoints/2026-11-01/attaches-archive-ownership/README.md`
- `scripts/parity/checkpoints/2026-11-01/attaches-streams-and-downloads/README.md`

Combined run `test-results/run-cLXIAC/manifest.json` passes all ten gates on its
unchanged local patch: 2,173 Node tests (three Windows platform skips), both
typechecks, build, 42 ordinary browser pages, 13 download and 169 existing native
control cases, heap/history (23 sentinels/zero retained), docs contracts,
installed package/22 CSS assets and 127-page site/demo. This is historical
evidence for that patch, not acceptance of later edits or the full native matrix.

The existing physical runner now waits for Chrome's download completion on a
dedicated browser CDP connection, then reads the GUID file from its own profile.
`Download.take` returns `{name,bytes}`; pages cannot provide filesystem paths.
New tests should reuse existing runners and owners, without another runtime
manager, fallback mode, public compatibility alias or reduced acceptance bar.

The verified Windows fixes are locally committed as `282d3077`; the archive
fixes, tests and their checkpoints are captured in the following local commit.
Earlier checkpoint notes saying "without commit" describe their original
verification time. Each subsequent comparison records its actual immutable
candidate SHA. No push or release has been performed. Keep new generated
output in ignored `test-results/`; preserve failed/partial attempts.
