# HTML boundary integration — active 2026-11-02

This implements the user-selected C05 contract in all four Raw/HTML Carousel
editor and renderer surfaces. **B-HTML and B-STYLE remain open; no new register
row is accepted by this implementation checkpoint.** The 2026-11-01 decision
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
