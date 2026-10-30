# Carousel automatic height: dependency investigation

This checkpoint preserves the evidence behind a proposed narrow fix to
`@shelamkoff/carousel`. It does not accept `BLOCK_CAROUSEL_ROUNDTRIP`, any
detailed Carousel action row, HTML/style policy, or whole-library parity.
The shared Carousel fixture was still being developed while some external
dependency gates ran. Their C11 manifests record that Rector worktree;
the separate `source-proofs` manifests and browser `loadedFiles` hashes
identify the actual dependency source exercised by each command.

## Root cause and boundaries

The installed `1.0.0` renderer observes its own viewport and synchronously
writes pixel widths to its slides from `ResizeObserver`. Intrinsic media
height then changes the height of that observed viewport during observer
delivery. Both ordinary mounting of detached output and subsequent width
changes of already mounted output produce the browser's undelivered
notification error. Direct public `Carousel` construction reproduces the
same failure without Rector. Fixed aspect ratio is not a substitute for
the actual automatic-height/default contract.

The proposed source change coalesces observer-driven layout into one
owned animation frame, reads the latest width there, and releases pending
work on rebuild and destroy. Synchronous recalculation also records the
same measured viewport width used for slide widths. No global observer or
animation-frame function is replaced, and no error is filtered.

Independent review found that canceling a pending frame during rebuild
without updating that width could leave loop copies selected using stale
viewport geometry. A public plugin-context regression reproduced the
second interactive original at `x=280` instead of `x=-40` after shrinking
`640` to `320`, rebuilding before the frame and dragging to `200`. The
one-line width bookkeeping correction passes that same regression.

## Source identity

The Rector base is `4bfb39426744bc0a96725258c06dc9192b58098b`.
The installed package comes from the npm `1.0.0` tarball, integrity
`sha512-Yvf3eIB3yvxCsA7BMOTCrxArQqfGy5rkN+Kj+C2QkMxA7YefaerMrouuxnwoCmWgVR2N8YOiZvUVs71C2unGPA==`.
The canonical repository is `https://github.com/Shelamkoff/carousel.git`.

Canonical HEAD `9896ddf60e594501b612ce38dbac66270f93181e` contains many
unrelated changes since the published package, despite retaining the
same package version. The release backport therefore starts from
`93274ff295212e23ff4761f860b701d446113d61`. Its original build matches
46 of the 47 installed files exactly. The remaining published delta is
the `Carousel.update([])` rejection, which the backport preserves with
an independent browser control. After that restoration, the only changed
runtime file versus the installed package is `dist/src/TrackRenderer.js`.

The initial prepared local commit is
`5ce243ca7d32f70786b2bab93ff606ea2ffb0c96`, tree
`0f86a8dd69746748fb67409f4c3cafa2443258d4`.
Its source patch, all changed file hashes, package metadata and exact
runtime comparison are in `reproduce/rector-carousel-release-backport-*`.
Publication and the final Rector dependency pin are separate parent-owned
steps. In particular, this prepare-only commit is not yet suitable for
Rector's existing clean installation with scripts disabled; see below.

## Executed evidence

| Run | Boundary | Actual outcome |
| --- | --- | --- |
| `run-uymu1L` | Rector public renderer, actual auto-height | 146 existing projection tests pass; the new case fails with two observer errors. |
| `run-xTJ926` | Direct public dependency and Rector layout probe | Rector detached output: one resize error; direct detached dependency: attach and resize errors; direct mounted dependency: one resize error. |
| `run-6njTID` | Canonical upstream browser RED | Both detached and mounted non-loop controls fail only on observer errors. |
| `run-nPimwT` | Same canonical tests after minimal fix | 2/2 pass. |
| `run-vWgZHT` | Canonical loop/content-growth controls | Four browser cases, 37 existing/new unit tests and declaration checking pass. The later peer bookkeeping regression has its own exact RED/GREEN source proofs. |
| `run-M4bR1n` | Built original release, maintained public probe | All four layout cases complete, retaining eight raw observer errors; two scheduling/resize unit controls fail and one destruction control passes. |
| `run-exCBSm` | Narrow release backport | Four browser cases and 8/8 unit tests pass. |
| `run-xreAeU` | Published invalid-array compatibility control | Fails before restoring the guard already present in the npm package. |
| `run-J3NFvs` | Frozen local backport commit | Four cases pass in Chrome 156 and four in Chrome 142; 8/8 units pass. No window, page or server errors; source unchanged. |

The public probe covers detached/already-mounted construction with loop
disabled/enabled, natural media height at widths `640` and `320`, a
further `24px` content-height increase, retained logical slide index and
DOM disposal. Unit controls cover coalesced latest dimensions, pending
work destruction and rebuild. This is not a Swipe interaction proof.

`run-8Sbuic` and `run-hj6rhU` preserve setup attempts that imported the
initial release's unbuilt source. That source refers to its historical
local EventBus path; its existing package build rewrites that import.
The corrected maintained browser page uses the built public ESM entry.
The first attempt also lacked per-test cleanup after a failing assertion,
which made a later destruction assertion dependent on the earlier
failure. The cleaned-up unit rerun and the built-package RED are retained
separately. Neither setup timeout nor dependent cleanup failure is
counted as an additional product regression. A still earlier missing-job
supervisor failure ran no product test and is preserved in `source-proofs`.

## Packaging RED and GREEN

All consumer probes use Node `24.22.1` / npm `11.9.0` and an immutable
local Git SHA; none publishes a package or changes a remote branch.

* `consumer-install/initial-no-prepare`: ordinary installation of the
  original Git SHA exits zero but contains no public `dist` entry.
  Import fails with `ERR_MODULE_NOT_FOUND`; `prepack` alone does not
  prepare this Git installation.
* `consumer-install/prepare-normal`: the backport's ordinary
  `prepare → npm run build` lifecycle creates an importable package.
  All 47 installed distribution files match the frozen build, public
  exports load, and the stylesheet URL is readable. No consumer-side
  build or runtime shim is used.
* `consumer-install/prepare-ignore-scripts`: a fresh npm cache and
  Rector's actual `npm ci --ignore-scripts` mode reproduce a distinct
  packaging failure. Installation exits zero, but `dist` is absent and
  the same public import fails. A warm prepared cache is not used to
  conceal that outcome.

The final dependency delivery must also satisfy that last installation
mode. Until then, the automatic-height source fix is verified, while the
Rector dependency update and complete Carousel roundtrip remain open.

## Reproduction and raw records

`runs/` retains every original C11 manifest and complete compressed log.
`source-proofs/` retains immutable before/after upstream source hashes,
commands and statuses, including the peer regression. `reproduce/`
contains the public drivers, the source patches and the exact local
video fixture present in the recorded Rector worktree. No existing
failure is replaced by a later successful result.

For the frozen dependency branch, run `npm install`, then `npm test`.
Serve the checkout over HTTP and open `tests/browser/auto-height.html`;
the page reports all four cases and unfiltered browser error events in
its result element. The archived `rector-carousel-backport-browser.mjs`
driver performs that public-page check using the recorded Chrome path.
The original installed-package renderer regression is
`tests/browser/regressions/carousel-auto-height.js`, included through the
standard projection-contracts page. The archived detached-job wrapper
records C11 gates and survives interruption of the interactive shell.
