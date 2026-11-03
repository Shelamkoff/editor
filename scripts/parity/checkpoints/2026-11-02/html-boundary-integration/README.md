# HTML boundary integration — active 2026-11-02

This implements the user-selected C05 contract in all four Raw/HTML Carousel
editor and renderer surfaces. **B-HTML remains open; the separately recorded
C06 scope closes B-STYLE. No new register row is accepted by this HTML
implementation checkpoint.** The 2026-11-01 decision
checkpoint retains its own immutable source and experiment results.

Application `contentStyles` is a one-read immutable snapshot of CSS text,
passed through existing editor extension and renderer contexts. The frame owns
only `allow-same-origin`; no scripts, forms, popup, download or top-navigation
sandbox grants are added. Sanitization happens in the admitted child realm.
Original author records remain unchanged. Explicit styles work with manual UI
styles and no page stylesheet is copied. EN/RU guides document that migration.

`shared/embeddedHtml.js` belongs to existing instance/output lifetimes. Raw
retires its preview handle; Carousel editor uses its existing view signal;
Carousel output's existing resource map co-owns HTML projections and attempts
independent disposal. The first mount can adopt a detached result into another
explicit Document before acquiring child resources. Only the exact original
static srcdoc and one admitted child Document can acquire authority. Subsequent
load, displacement, signal cancellation and disposal retire it.

Natural flow respects explicit body scrolling/clipping instead of treating an
inner scroll extent as extra outer height. An independent percentage-height
reference cannot add wheel-scrollable blank root content. The prior 100px
minimum preview affordance is retained only in the Raw editor. Short reader
and Carousel content occupies its natural height; tall content has no cap or
resize freeze.

Logical viewport units retain native terms in an affine expression, preserving
the consuming element's writing mode, inherited custom properties and dynamic
mode changes. This follows [CSS Values 4 viewport-unit semantics](https://www.w3.org/TR/css-values-4/#viewport-relative-lengths).
For native Wn/Hn and parent Wp/Hp, a=(Wp-Hp)/(Wn-Hn), b=(Hp-a*Hn)/100; n*vi/vb
becomes calc(n*(a*vi/vb+b*px)). Coefficients refresh after frame height changes.
A square natural result receives one unclipped CSS pixel of additional flow,
keeping both native axes distinguishable. A separate bare 1400x800 native CSS
control matches 96 fields across six candidate heights, including variables
and mode changes. The reciprocal-transform design was explored but not adopted.

An actual stale-navigation regression was found before integration acceptance:
a passive parent click listener could destroy the view while its delegated
anchor still had a pending default action. Destruction now strips the exact
owned pending anchor's href before browser activation. Cleanup preserves a
foreign reparented node and event fan-out; it does not rely on preventDefault
inside a passive observer. Live requested-parent navigation remains functional.

Observed checks before the final frozen combined run:

- Eleven public browser cases pass: input validation, one-read snapshots,
  output routes/realms, four surfaces, Raw history, first-mount adoption,
  initial-document substitution, vertical and square/dynamic logical units.
- Sixteen native cases pass across all four surfaces: short-content wheel,
  intentional native body scrolling, retired activation and live parent target.
- Earlier build (288 declarations/zero diagnostics), full Node (2,191 PASS,
  three platform skips), both typechecks and all 45 ordinary browser pages pass
  on their recorded pre-activation-fix WIP source. They are not relabelled as
  final combined validation.

Security and Trusted Types tests now inspect actual author child Documents and
admit only exact known-owned frames. Srcset tests decode and compare currentSrc
inside all four surfaces and still check caller data, disposal and history.
The fixture updates retain malicious-tag/URL/attribute assertions. Original
failures and fixture corrections remain in ignored
`test-results/audit-closeout-2026-11-01/`; invalid fixture attempts are not product
RED evidence. Source/time/exit identity of combined gates will be appended after
completion.

Remaining acceptance includes immutable comparisons with adapted semantic
observation, native source/caret history, all target/download/media routes,
mixed and fixed-ratio Carousel controls, resource/credential/failure cases,
complete native/heap/package/docs integration and the separate inline C06 trust
boundary. Parent small/large/dynamic viewport families and media-condition
semantics need a wider native CSS corpus; a root-mode-only conversion or a
passing attribute check is not their proof.

## Integration follow-up

The first frozen nine-gate run (`test-results/run-97d5ef/manifest.json`) passes
build, both typechecks, all 45 ordinary browser pages, 16 native HTML cases,
heap (23 sentinels/zero retained) and installed package/22 CSS assets. Node and
documentation fail on the missing new renderer configuration documentation;
the site fails on untranslated prose. Source remains unchanged. These failures
are retained, not presented as a green combined run.

The next four-gate run (`test-results/run-YUkVdZ/manifest.json`) passes the real
product logical-unit corpus (96 dimensions and 48 writing modes against native
CSS). Node/docs/site still fail on new untranslated `viewport` prose and a stale
built README after the translation edit. Those documentation defects are now
corrected and require fresh build/docs gates; this run also remains failed.

Additional public-boundary observations before the next frozen run:

- A focused native RED reproduced an unnecessary 100px floor on all three
  non-Raw-preview surfaces. The floor now belongs only to Raw's editor preview.
  An initial exact-height fixture exposed real glyph ink overflow by one pixel;
  its final 16px font/20px line-height reference accommodates the glyphs. All
  20 native HTML cases pass (`html-natural-minimum-native-final.log`).
- `scripts/parity/html-responsive-content.mjs` compares all four public
  surfaces with independent bare parent CSS at three viewport sizes and
  light/dark preference changes. RED: 16/20 mismatches, including logical media
  conditions and preferences changed without resize. Original media queries
  now resolve in the parent before declaration rebasing; instance-owned
  MediaQueryList listeners refresh preferences and abort with the view.
  GREEN: 20/20 comparisons, zero page errors, unchanged recorded source.
- `scripts/parity/html-content-navigation.mjs` compares 12 actual destination
  and modifier cases per surface with a bare anchor in the same owner hierarchy
  and CSP. All 48 comparisons pass, including named/existing named, self,
  parent/top/blank, Ctrl/Shift/middle click, relative URLs and fragment tabs.
- The 11 public style cases, five Raw native source/control/history cases and
  the native Carousel HTML source/history case pass after these changes.

Native and differential fixtures now observe actual child author Documents.
Comparative opaque historical previews retain a clearly bounded literal-source
observation for their fixed benign corpus. Unmounted output retains structural
checks, then checks all authored content after its first mount. No historical
failure is rewritten and no security conclusion is based on benign srcdoc text.
The adapted differential fixtures still require immutable source execution.

The complete twelve-gate run `test-results/run-HfVO99/manifest.json`, identity
`116d8f7c0146c6e6e223ff66d5b95aaee2fd5487f106ed6650ac7775df1ed80d`,
retains **failed** overall status with unchanged source. Eleven gates pass:
build, 2,191 Node tests/three skips, both typechecks, 45 ordinary browser pages,
logical/responsive CSS, 48 real link comparisons, heap (23/zero), docs, package
and the 127-page site/demo. Full native execution times out at retained tools;
all 64 cases of that page then pass in a separate unchanged-source replay.
This is neither a full native pass nor acceptance of other unexecuted pages.

A following controlled ResizeObserver disconnect failure proves a real resource
defect: all four public surfaces leave their parent media subscription active.
Four permanent tests first fail with that signal still live (and editor abort
callbacks also report uncaught errors). Disposal now revokes lifetime first,
attempts every independent cleanup, settles readiness and preserves the first
explicit disposal failure even when falsy. Automatic abort/load/displacement
reports a local frame error after cleanup, without an uncaught abort-listener
exception. All 15 public style cases pass after repair. The next integration
run must attribute this later source, not reuse the preceding eleven gates.

The native harness now exposes active/completed/total case progress in timeout
diagnostics; its deadlines and assertions are unchanged. The Raw immutable
comparator serves literal Git fixture bytes and permits only CRLF/LF working
checkout equivalence, retaining exact unchanged-file checks. The publication
review's current heading is reconciled to its already accepted 66/143 count;
no row is added.

Separate ignored inline decision experiments apply proposed namespace byte
transforms only in their own Vite server. Actual public Paragraph input,
Undo/Redo, one owned mention plus a colliding literal, and renderer output
retain canonical data. The namespaced author class cannot activate the host's
full-screen rule; a native host button remains usable, and the 201px italic
glyph PNG exactly matches the benign native control. This is promising C06
research, with no production inline policy or B-STYLE acceptance. The CSS
selector compiler, scope/lifetime integration and broader formatting/selection
proof remain to be done.

## Immutable preservation replay and native media

The remote branch was fetched again after local production commit
`0bedf9a4c1f8ffb85ce508229c2299a0d174408e`; it remains at `3fcfa866`.
Nothing is pushed or released. Raw source/preview replay on that immutable
production completes all 21 cases per source: v1 has 226 raw failures, baseline
30, current zero; all cases complete and caller/source identities remain intact.
Raw ROUNDTRIP then completes both cases on each source, with 346 current
observations and zero unexpected differences. Historical differences stay raw.

The Windows ROUNDTRIP server initially rejected all source paths because its
containment check hardcoded `/`. It now uses the platform path separator and
serves exact Git module bytes after verifying each selected archive/checkout;
only JS/MJS/CSS checkout CRLF/LF conversion is permitted. End checks still
compare every working file byte for byte with its captured original.

The first Carousel replay correctly flags 39 current differences: the existing
oracle omitted the newly required `noopener noreferrer`. The protection is
retained. Expected embedded markup now independently requires both rel tokens.
Only exact observed historical missing-rel combinations receive a repaired
difference classification; candidate failures never do. The four-case replay
passes with all 718 current observations and no incomplete current phases.
Historical v1 raw failure counts are 4/28/58/58; baseline 0/19/7/7 retains both
incomplete rich-widget cases. Existing and fresh classifier sensitivity runs
pass (123 and 181 classified historical failures respectively), including
candidate-source, altered data/expectation/phase/identity/mode and unrelated
error rejection. The original failing replay is retained.

The production native HTML page now passes **28** cases. Four real Blob
downloads preserve exact filenames/bytes; a second independent bare native
download proves each caller-owned URL survived disposal. Four actual native
Space actions play video inside scriptless content; disposing the surface
pauses it, and independent native video decoding proves the caller's URL was
not revoked. Saved author data is checked unchanged for every surface.
The first added fixture incorrectly tried fetching Blob URLs under a CSP
without `connect-src blob:` and assumed a video center click was its play
control. Those are retained fixture failures, not product RED. Final native
controls use the original CSP and browser-owned downloads/video decoding;
no fetch permission or sandbox grant is added.

Raw replay artifacts: `raw-source-preview-0bedf9a4.json` and
`raw-roundtrip-portable-runner.json`. Carousel replay:
`carousel-roundtrip-protected-links.json`, with both sensitivity logs. Native:
`html-native-downloads-video-controls.log`. They live in the ignored dated
closeout directory and retain their actual runner/fixture/runtime identities.
The following integration run must include these new fixture/oracle bytes.
No additional preservation row or B-HTML/B-STYLE closure is claimed.

The next frozen `99beda44` run (`run-MH9A9I`) also remains failed. Node discovers
tests in the just-extracted historical archives; those archives are now under
the same ignored immutable directory's `node_modules`, outside current test
discovery. Windows System events confirm sleep at 02:47:56 and resume at
11:14:29; native execution loses CDP after the completed source-indentation
group. Retained tools does pass its 64 cases in this run. Navigation has one
missed first self destination at its former fixed 250ms observation. No failed
gate is relabelled and no full native pass is claimed.

The post-resume Source Modes replay exposes 27 old empty-sandbox expectations
among 62 cases. Source Modes and Raw design now inspect the exact selected
boundary and actual child text while retaining native source/range/history and
readable-canvas checks. Navigation now waits for the actual requested native
destination/topology, bounded at five seconds, and requires a positive settled
bare control. Frozen follow-up `run-a0RspD` passes all four gates with unchanged
source: **2,191 Node/three skips**, **62 source-mode cases**, **four Raw design
cases across 16 states**, and **48 navigation comparisons**. These remain scoped
follow-up results rather than an invented successful twelve-gate run.


## Staged resource acquisition follow-up

A public-surface probe found that retirement inside ResizeObserver construction
left a child observer and parent resize listener alive on all four surfaces.
The same publication gap affected a child AbortController, stylesheet setup and
partial MutationObserver/ResizeObserver observation. Construction/observation
can return after the existing owner has retired, including after a falsy throw.

The repair keeps each returned observer/controller provisional until its owner
is revalidated, disconnects/aborts an unaccepted resource, and preserves the
initiating observation failure while attempting independent cleanup. Setup,
stylesheet publication and measurement stop after retirement. Parent resize
also uses the existing content AbortSignal. No new owner, manager or public API
is introduced. The unused sanitizer import is removed from pure Carousel data
normalizers; real sanitization remains in HTML publication.

The permanent public-API fixture is
`tests/browser/embedded-html-acquisition-fixture.js`, registered in the existing
CSP/Trusted Types content-style page. Its 60 cases cover four actual surfaces,
constructor/observe cancellation, stylesheet/media acquisition, retirement
before native observe returns, falsy partial failure, successful acquisition,
resource release, unchanged canonical data and a fresh valid successor output.
The unchanged predecessor runtime fails 44 of these cases for the intended
late-acquisition/resource effects; all 60 pass with the repair. Earlier exploratory
fixture mistakes (saving after terminal destroy and identifying a removed frame
by its current parent) remain failed diagnostics, not product RED evidence.

Pre-commit production checks pass all 75 content-style cases and both typecheck
configurations. Immutable affected-path integration is the next step. All earlier
full integrations retain their own source identity, including the successful
17-gate `run-PC0mTs` before this repair. This follow-up does not close B-HTML,
resource/credential, mixed Carousel, native context-menu or broader platform proof.

The actual package budget initially fails after the resource repair, despite a
passing preliminary virtual-source estimate. Those failed measurements remain
separate. Optional Image local-file code now follows the existing Gallery loading
boundary: the public uploader class retains its original direct behavior, while
the plugin imports it only for local I/O. Application uploads stay synchronous
up to their first existing await through the shared original remote algorithm;
the same task signal owns cancellation and late completion. Module delivery
failure leaves the image unchanged and releases the loading/task state. No
source-editor preloading, language menu or upload capability is removed.

The expanded real-browser loading probe passes all 46 cases, including nine
Image file/Paste, retirement, module-failure and immediate-provider cases in
addition to the original 37 HTML/Gallery cases. Existing Image uploader tests
pass without changed expectations. The actual enforced package build reports
95.9 KiB gzip against the unchanged 96 KiB fullPreset limit. The earlier failed
budget runs are not converted to passes.

## Resource effects and shared local reads — 2026-11-03 local date

The unchanged-source follow-up on `5c73e176` is `run-HKjDx0`: fifteen of sixteen
gates pass, including all four selected native pages, Node/types, 45 ordinary
pages, navigation, deferred loading, responsive content, enforced budget, heap
and installed package. The site build fails solely on unquoted technical terms
in the new Russian review. Those prose defects are corrected; the failed run is
retained and is not described as a complete passing integration.

Further real HTTP observation found repeated font requests (up to nineteen in
the short controlled observation) and lost author `no-referrer` on every HTML
surface. Unchanged native rules and constructed sheets now survive measurement
and resize; only changed CSS declarations/rules are updated. Original feature
query tokens in `@supports` remain feature tests, while declarations still use
the selected page viewport. This also avoids replacing a nested font definition
when only viewport-dependent geometry changes. No alternative CSS renderer,
source rewrite, height cap or second style owner is introduced.

Sanitization preserves the restrictive `referrerpolicy="no-referrer"` value.
Other author policies remain removed, so author HTML cannot increase referrer
exposure. The input HTML itself remains unchanged.

`scripts/parity/html-resource-effects.mjs` runs 24 cases: four public surfaces,
bare native and native CSSOM controls, same/cross-origin HTTP resources and
plain/nested supports/media styles, before/after actual viewport resize. It
compares real requests, controlled HttpOnly cookies, CORS font credentials,
referrers, selected srcset, decoded images/video, typography and animation.
`no-store` fonts must load once; forbidden/fallback/retina resources must not be
requested. An attempted author `unsafe-url` policy must retain the native
default. Native keyframe mutation independently demonstrates Chrome's replacement
of FontFace objects without another request; object observations remain raw,
and loaded state, traffic and animation continuity remain required. The earlier
unconditional FontFace-identity assumption is retained as a failed diagnostic.

An optional commit argument (or `EDITOR_RESOURCE_REF=EXACT_COMMIT`) serves all loaded production
modules from their exact Git objects through ordinary Vite compilation. Runner,
assets, dependency/lock and loaded-module bytes are checked unchanged. The
immutable `5c73e176` replay completes all 24 cases with 174 production modules:
all eight native controls pass and all sixteen product cases fail. Current
pre-commit cases pass without changing expected resource effects. Earlier
exploratory/native-fixture failures retain their own source and meaning.

Person's local avatar path now reuses the existing Image reader through an
optional module. This fixes actual native FileReader construction retiring the
editor: the old source starts one late read and retains its handlers; current
source starts none and clears them. Six new loading cases cover actual picker,
success, module failure, retirement, constructor retirement and immediate remote
uploads. The 52-case loading probe passes. Image's original reader tests keep
their expectations; the redundant private upload forwarder is removed. Tasks
remain owned by their existing plugin instances. Cropper and the full detailed
Person avatar row retain separate acceptance obligations.

Six identical Image/Gallery action SVG constants share one source. All eleven
Image and ten Gallery exports, including layout thumbnails, compare byte exact
with `5c73e176`. No artwork, source-editor preloading or functionality is removed.
The actual enforced fullPreset build reports **95.5 KiB gzip / 96 KiB**; earlier
failed budget probes remain failed. The fresh immutable integration is recorded
below. B-HTML and whole-audit acceptance remain open;
the register stays **67/209 accepted, 142 open**.

### Completed resource integration

`test-results/run-A9Taxq/manifest.json` passes all **19 gates** on clean unchanged
`a008b32ff6ac10b05234c4d60876a88d3501c6d3`, tree
`eba7d86c8bca1f7ff450b91571681ac3791bbffe`, identity
`61e34913fec594ffd4e2d5487bbd32e236547b5b45aee9bc03147e049ab80c93`.
Started 2026-11-02T23:07:25.686Z; finished 2026-11-02T23:19:08.099Z (November 3
local date). The manifest SHA-256 is
`bee8de5ab8986390660877d7a9db3f591e5dee31ee390b2eaac3d4daa14fd6c6`.
Every gate records unchanged source and Node **24.22.2**; earlier runs retain
their original Node versions. Gates cover build, 2198 passing Node tests / three
platform skips, both typechecks, 45 ordinary pages, five selected native groups,
navigation, deferred loading, responsive content, real resource effects, glyphs,
enforced bundle budget, heap, docs, installed package and site. The final actual
fullPreset measurement is **95.6 KiB gzip / 96 KiB**, without relaxing the limit.
The preceding sixteen-gate site failure remains failed. No additional scenario
row is accepted by this resource integration.

## Confined native layers — 2026-11-03

The body-flow measurement omitted viewport-fixed authored boxes and the native
popover top layer. Pure fixed content collapsed to zero height in renderer and
Carousel output; Raw editor retained only its 100px preview affordance. Opened
native popovers and their lower controls were similarly clipped. Focus- and
hover-revealed layers required owned post-default measurement as well.

An active visible viewport-fixed box now has at least the containing page's
viewport height available for native layout. Taller ordinary flow still grows
the frame. Native `offsetParent` distinguishes a local fixed containing block
from the viewport, following the [CSSOM View algorithm](https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetparent).
The root body is included; invisible boxes and closed popovers add no blank
viewport. All content stays in the existing frame. Positioning, canonical HTML,
sandbox flags and application styles retain their original owners. Toggle,
pointer and focus transitions request the existing coalesced measurement and
retire through its existing AbortSignal.

`scripts/parity/html-native-layers.mjs [EXACT_COMMIT]` executes **60 cases**:
twelve native controls and four public surfaces for fixed top/bottom/center,
root body, popover, hover/focus revelation, hidden fixed boxes, local containing
blocks, ordinary/body-scrolling flow and tall content. It uses trusted pointer,
wheel and keyboard input under CSP/Trusted Types. Actual lower actions, native
popover close and Escape, parent UI access, source preservation and removal of
inactive-layer space are required before and after viewport resize. All 174
loaded production modules are fingerprinted and rechecked; an optional commit
serves exact Git bytes through ordinary Vite compilation.

The final preceding-source replay
`html-native-layers-complete-final-baseline.json` has **28 product failures**
on exact `a008b32f`, with all twelve native controls passing. The final working
repair `html-native-layers-complete-final-working.json` passes all **60** cases
with unchanged source. Both are retained in ignored audit output. Earlier
readiness-null errors, native wrapper-margin interference and child-only
scrollIntoView failures remain fixture diagnostics, rather than product RED or
successful final results. A temporary invisible-box sizing regression is also
retained and is covered by the final negative control.

The resource baseline was rerun with the final privacy fixture:
`html-resource-effects-final-fixture-baseline-red.json` serves exact `5c73e176`
with 174 modules, all eight native controls passing and sixteen product cases
failing. Its preceding-source failures retain their original meaning.

Native Windows UI inspection was stopped by computer-use because it could not
confidently determine the current browser URL. Context-menu UI and actual
native fullscreen UI therefore remain unverified. No preservation count or
whole B-HTML acceptance changes. Frozen combined integration follows this
repair; prior successful integrations retain their earlier source identity.

### Completed native-layer integration

`test-results/run-DLyD1O/manifest.json` passes **all twenty gates** on clean
unchanged `13b79cc62ceb29fe7a73b5d5dca9d3cde1c37b9e`, tree
`f0d7a7149dea97c79460d4361a3cb3aca5624dd8`, identity
`d37c9e92ab37b26ef74aa5d0241fcef851e348f87e1bc82eb05759586b47312b`.
Started 2026-11-03T00:10:09.061Z; finished 2026-11-03T00:25:18.207Z. Node
24.22.2, Windows x64 and Chrome 156.0.8078.79 are recorded for this run.
The exact manifest SHA-256 is
`89b6477f25f5479e7e59a962f4427fad2894a4fec21e0dd82e968610dc48da2b`.
The preceding nineteen gates are repeated on this source and the new 60-case
native-layer gate passes against exact Git modules. All five selected native
groups pass (28 HTML, 65 roundtrip, 95 media, 345 plugin and 28 Person cases),
as do 45 ordinary pages, 2198 Node tests / three platform skips, 52 deferred
loading cases, resource/navigation/responsive/glyph controls, heap, types,
docs, package and site. The actual fullPreset measurement is **95.5 KiB gzip /
96 KiB**. The manifest is retained with the following Code/Marker checkpoint
as `integration-manifest.json.gz`; it is the original twenty-gate record,
without a relabelled candidate or outcome. B-HTML and the register remain open
within their separately recorded scopes.

## Absolutely positioned native popovers — 2026-11-03

The native top layer can contain a popover whose application stylesheet uses
`position:absolute`. A fixed-position-only admission still clipped it in all
four public surfaces. The exact `e9f0373d` replay has four product failures and
a passing independent native control. Its open 170px box had only 70px visible
in Raw editor and none in the other three views.

Measurement now admits a visible, actually open native popover independently
of its CSS position. The native capability guard avoids testing the popover
selector on an engine without the feature. Application positioning remains
`absolute`; author HTML and styles are not rewritten to another position.
Closing/Escape still returns the surface to its original flow height, and
trusted lower controls, page UI and canonical data retain their behavior.

The permanent matrix grows to **65 cases**. All 65 pass on the working repair,
including explicit computed-position preservation and viewport resize. The
final five-case predecessor replay retains all four intended failures and its
passing native control. Both typechecks pass. The earlier 60-case / twenty-gate
record remains evidence for `13b79cc6`; this later repair requires its own
immutable integration. `B-HTML` and whole-library readiness remain open; the
current register is separately **69 accepted / 140 open** after Code/Marker.
