# Carousel common ROUNDTRIP: complete local verification

The four Carousel cases complete the common preservation template against the
published automatic-height dependency fix. The final isolated run also executes
the existing 53 cases: all 57 current-candidate cases pass, with 9,847 passing
observations and no candidate failure, incomplete phase, window error or page
error. Carousel accounts for 718 of those observations. This checkpoint is the
local evidence for `BLOCK_CAROUSEL_ROUNDTRIP`; the parent integration separately
combines Gallery, Person and Carousel into the 65-case gate before changing the
central acceptance documents.

This does not accept every Carousel action row, every built-in block, Swipe,
HTML/style policy, or whole-library functional parity. The existing Carousel
media controls below are regression coverage for the dependency change, not an
automatic promotion of their separate detailed rows.

## Exact source and dependency

The Rector production baseline is
`4bfb39426744bc0a96725258c06dc9192b58098b`. The scoped fixture, recognizers,
registered regression and two README corrections are local commit
`14cccfa0b6fe34ccab06a69d43b4fba24bfc333f`. No additional Rector production
runtime change was needed. Earlier caption-renderer repairs remain part of that
published baseline.

Final C11 run `run-64mauO` used clean local HEAD
`942467e2669064433e2b50a14dbdd0df4df01d2b`, tree
`4bd0667b6eda0d4d222d1f22380384394c0e072a`. Its complete manifest is
[`runs/run-64mauO/manifest.json`](runs/run-64mauO/manifest.json). Every gate and
the entire run report `sourceUnchanged: true`. The differential independently
checks loaded source files against the requested Git identities, plus the
runner, recognizer, media-fixture and dependency hashes.

The final dependency is the published Git commit
`f7f6485886a1d77f9213d9079eb70000efeff499`, tree
`d71d783ab0a030c3c538aea3bee5b0ee944bc01a`, in
`https://github.com/Shelamkoff/carousel.git`. This clone actually installed it
with `npm install --ignore-scripts --no-audit --no-fund` and the immutable
`git+https` URL. Its 47 installed distribution files were compared byte for
byte with the verified narrow backport build. Package and lock bytes were then
aligned with the parent's pin commit
`9a60deb51a6f1906a9ad4a17080deedc52b2426a`; the initial npm-generated metadata
is preserved rather than overwritten in the evidence.

[`published-dependency.json`](published-dependency.json) contains the command,
exit status, final package/lock hashes and all 47 distribution hashes. The
parent owns the separate clean-cache installation and package-delivery proof.
The final Git artifact includes the canonical generated distribution, so this
is distinct from the earlier prepare-only installation described in
[`../carousel-autoheight-dependency/README.md`](../carousel-autoheight-dependency/README.md).
That earlier checkpoint's packaging failures remain historical failures.

## Four independent cases

| Case suffix | Author content and applicable phases | Current observations |
| --- | --- | ---: |
| `default` | The actual empty `slides: []` default and default options; load, read-only, editable-again and dispose. There is no caption to edit, so edit/Undo/Redo are explicitly not applicable. | 79 |
| `populated` | Image, local video and benign HTML slides; literal caption characters including ampersands and angle brackets; all seven phases. | 213 |
| `populated-widgets` | The same mixed media, with an actual Mention and Color widget inside italic/strike wrappers in the first caption; all seven phases. | 213 |
| `populated-widgets-unwrapped-control` | The same real widgets without those wrappers; all seven phases. | 213 |

The cases are registered in the normal native ROUNDTRIP page and consumed by
the three-source differential. Neither the empty default nor the populated
cases set a fixed aspect ratio. The local 16-by-16 WebM is served with its media
content type and has an immutable hash in the differential record.

Fixed author records cover every slide, its stable identifier, type, options,
caption, independent alternative text and both neighboring blocks. Assertions
cover canonical records, marks, sidecars, block order, read-only state, history,
foreign focus, native caret and disposal. Wrapped and unwrapped widget cases
use the actual Mention and Color implementations. A changed active caption may
replace its view, but its predecessor must be detached; retained input, blur
and navigation callbacks must leave current content, history, field ownership
and selection unchanged.

The populated cases also use trusted pointer input to select video, HTML and
image slides in that order. They check the visible counter, media element,
caption, actual video metadata, media controls and HTML markup, while requiring
unchanged author data and history. Trusted caption input then inserts one
character, and native keyboard Undo and Redo each restore the independently
specified records and caret. Detached `render()`, immediately attached render
output and settled `renderTo()` are checked at each applicable phase, including
all three media types, labels, navigation, pagination, thumbnails and widgets.

The v1 wire format is specified independently: its captions are literal text.
Equivalent visible literal author characters therefore use the original text
representation, while current rich caption records retain their HTML
representation. v1 does not provide persistent rich-caption widgets. Both v1
widget controls retain explicit `supported: false` capability metadata and
their observed failures; they prove the current capability, not historical v1
widget parity.

## Executed final gates

All eight gates below belong to the same unchanged-source C11 run. Full output
is preserved under [`runs/run-64mauO/`](runs/run-64mauO/), compressed without
altering the raw log bytes; `summary.json` maps every log to its raw and
compressed SHA-256.

| Gate | Observed result |
| --- | --- |
| Three-source differential, all 57 cases | Current candidate 9,847/9,847 observations pass; zero unexpected failures or unexpected error-channel reports in any source. |
| Native Carousel ROUNDTRIP, Chrome 156.0.8078.47 | 4/4 cases pass. |
| Native Carousel ROUNDTRIP, Chrome 142.0.7444.175 | 4/4 cases pass. |
| Standard projection-contracts page, Chrome 156 | 147/147 pass, including the registered real automatic-height regression. |
| Standard projection-contracts page, Chrome 142 | 147/147 pass, including the same automatic-height regression. |
| Existing native Carousel media controls, Chrome 156 | 16/16 pass, including sources, settings, navigation, autoplay, native history and local-video resource lifetime. |
| Carousel recognizer sensitivity replay | 123 historical differences recognized; 2,418 altered negative controls and 1,649 passing observations rejected. |
| README contracts | 47 localized pairs validated. |

The runtime regression is
`tests/browser/regressions/carousel-auto-height.js`. It removes the fixed ratio
from the public renderer caption fixture and runs through the ordinary harness,
which fails on unexpected browser errors. Its original actual product RED is
preserved as `run-uymu1L` in the dependency checkpoint: 146 existing cases passed
and the new case failed with two observer errors. The upstream public probes,
original release RED, coalesced-resize and disposal controls, loop geometry
regression and compatibility guard are also preserved there. The final run
uses the installed published package; no observer monkeypatch, global error
filter or fixed-ratio substitution is involved.

## Historical differences remain observable

The final Carousel subset has 91 v1 and 32 spec-baseline failure records. All
123 remain in the raw output with their original actual/expected values. The
recognizers only label the exact observed source, case, phase, property,
independent author records and failure values. They never rewrite browser
input, alter observations, grant candidate exceptions or manufacture completed
phases.

| Exact Carousel classification | Count |
| --- | ---: |
| Repaired v1 mode remount | 16 |
| Repaired v1 history remount | 12 |
| Repaired v1 first-Undo caret | 3 |
| Unsupported v1 persistent sidecars | 12 |
| Unsupported v1 persistent widgets | 48 |
| Repaired spec-baseline literalized rich captions | 24 |
| Repaired spec-baseline renderer widgets | 6 |
| Repaired spec-baseline widget mode-transition failure | 2 |

The two rich spec-baseline cases actually stop after `load` with
`Inline widget root left its projection boundary before hydration`. Their
read-only, editable-again, edit, Undo, Redo and disposal phases remain explicitly
incomplete. Only that exact partial phase sequence and exception are accepted
as known historical evidence. The equivalent candidate cases complete every
phase. The 57-case aggregate separately retains one previously classified
spec-baseline Embed event in each raw error channel; it is not a Carousel
exception and no error-channel policy was changed here.

The sensitivity script independently mutates source identity, case identity,
actual and expected values, status, phase sets, author data, block identity,
other-slide content, sidecars, mode, native selection owner and unsupported
capability metadata. It also rejects unrelated execution errors. These are
offline recognizer controls on captured observations, not edits to product
input or substitutes for native browser tests.

## Preserved preliminary observations and reproduction

`initial2-differential.json.gz` and its manifest preserve `run-syi0s1`, the
default/literal raw investigation. The candidate passed 285 observations; the
gate failed because historical differences had not yet been classified.
`four-case-raw.json.gz` preserves `run-gX5U8W`, with 718 passing candidate
observations before the exact rich spec-baseline partial-phase recognizer was
added. Both preliminary runs used the explicitly recorded local dependency
artifact in `preliminary-dependencies.json`. They are neither final published
installation proof nor additional product RED failures. Their exact fixture
bytes are archived beside the results.

`reproduce/implementation.patch.gz` is the complete scoped code and dependency
pin delta from the published Rector baseline. `reproduce/source-commits.json`
records the local commit sequence. `reproduce/final-job.json` and
`reproduce/final-run.py` preserve the exact commands, source roots, browsers and
detached C11 orchestration used for the final run. For another checkout, adjust
those local paths and keep the recorded v1 and spec-baseline Git SHAs. The
standard public commands remain `scripts/parity/block-roundtrip.mjs`,
`tests/browser/physical-history.mjs` and `tests/browser/run.mjs`, with the page
and filter selections recorded in the C11 gate environment.

To replay only the strict Carousel recognizers against this final raw result,
run `classifier-sensitivity.mjs` with
`runs/run-64mauO/differential.log.gz` as its input path. With no argument it
replays the earlier four-case raw record. `hash-index.json` covers every file
in this checkpoint except the hash index itself. The older dependency
checkpoint's 83 indexed artifacts were also rechecked without changing them.
