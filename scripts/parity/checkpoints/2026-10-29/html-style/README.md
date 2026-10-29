# HTML/style decision probes — 2026-10-29

These are immutable, byte-for-byte copies of the sources actually executed in
this session, including failed probe-development sources and rejected proposals.
They are historical reproduction evidence, not a portable CI runner, package
entrypoint, production compatibility layer, vendored runtime or dependency
installation path. No generated trace, screenshot, media file or downloaded
registry response is stored here. [DECISION.md](DECISION.md) records the findings,
concrete proposal and remaining policy decisions.

## Source identity

The v1 source archive was `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (v1.0.5).
The current Rector source archive was
`948bc5544dcf57a343733f589883973ec7db6cd7`, whose tree was published as
`3103eb5f`. These probes continue to name the original verification commit;
[publication provenance](../PUBLICATION.md) explains how to reconstruct original
commit objects. They do not silently test the latest working tree after that
checkpoint. API/schema adapters exist only in these probes.

The captured environment was Linux, Node `v24.22.1`, Chromium
`142.0.7444.175`, current DOMPurify `3.4.15` and Carousel `1.0.0`. The v1
sanitizer uses its vendored DOMPurify `3.4.12`; other browser dependencies are
resolved from the current installed dependencies. This is not a recreation of
all historical dependency environments or a fresh sanitizer advisory review.
The probes compare principal source files against pinned Git bytes and record
those hashes. Source archive paths remain fixed while other repository work
continues.

Upstream Carousel source was read from exact public master
`9896ddf60e594501b612ce38dbac66270f93181e`. The archive SHA-256 was
`d712c7b8c2f5555994b578a4542ea840f1ae8f19cd7d47c87cb2c5d9377e3b7e`;
its original `src/plugins/swipe.js` SHA-256 was
`f2924d9f809d3577e304720fc3c72a76cc13f6514801d04f9c843fed0430cb69`.
The two retained candidate `.js` files are inactive upstream proposal sources,
served only by explicitly invoked probe servers. They are never imported by
Rector production or used to replace the installed package. Their MIT license
is preserved in [UPSTREAM_LICENSE](UPSTREAM_LICENSE).

## Probe identities and classification

| Source | Executed scope and result |
| --- | --- |
| `rector-eh-first-probe.mjs` | Initial four-surface overlay probe with `injectStyles:false`. Fixed overlay observations are valid; all popover cases have a fixture ERROR because reserved/clobbering ID `open` is removed. Not acceptance. |
| `rector-eh-overlay-controls.mjs` | Corrected IDs, ordinary automatic styles and actual outside host clicks. Raw renderer/Carousel editor fixed-overlay failures occur in v1/current. Scratch paint containment fails against native popovers. One v1 Carousel editor popover case is disabled by read-only controls; a non-opening renderer pointer popover does not prove safety. |
| `rector-eh-positive-controls.mjs` | Actual fragment/download/named-window effects plus theme/tall/responsive/field focus observations. Its guessed native video-control pixel produces inconclusive media failures; these are not product-media findings. |
| `rector-eh-media-keyboard-controls.mjs` | Correct media activation: trusted Space on the focused native video, with advancing currentTime on all eight surfaces. Raw preview still fails theme/natural-height requirements. |
| `rector-style-positive-negative.mjs` | Initial fixture-development failure: wrong current Paragraph dataVersion 1; lower-specificity code-theme expectation and assumed named-window behavior. Retained, not acceptance. |
| `rector-style-cascade-and-navigation-controls.mjs` | Correct current schema and explicit host code specificity; native platform control initially omitted required rel, so its navigation comparison is not accepted. |
| `rector-style-cascade-and-navigation-final.mjs` | Same exact rel on bare Chromium control and products. Nine independently calculated font sizes, benign class/code and actual self/blank/named target outcomes pass in v1/current editor/renderer. Host-class viewport overlay fails in all four product cases. |
| `rector-carousel-interactive-ownership.mjs` | Actual v1/current renderer versus scratch omission of only swipe installation. Native event traces isolate pointer capture as the reason fragments, downloads and button default actions fail. Omitting swipe is a diagnostic control, not a product proposal. |
| `rector-carousel-keyboard-popover-negative.mjs` | Actual unmodified Carousel renderer: trusted Enter opens a host-covering popover in both versions. No paint prototype or swipe change is involved. |
| `rector-carousel-upstream-regression.mjs` | Published dependency, exact upstream master and deferred-capture proposal. Deferred capture repairs taps but fails native range dragging; the proposal is rejected. |
| `rector-carousel-deferred-capture.js` / `.patch` | Exact failed proposal source and corresponding upstream patch; preserve separately from the corrected proposal. |
| `rector-carousel-native-controls-regression.mjs` | Same public Rector renderer with published, exact-master and native-control-admission dependency arms. Corrected upstream proposal passes 8/8 bounded scenarios; original arms deliberately retain reproduced failures. |
| `rector-carousel-native-controls.js` / `.patch` | Reviewable upstream-only gesture admission proposal. It does not suppress bubbling or add a renderer shim. Patch applies to exact upstream master; not applied/published upstream or installed in Rector. |
| `rector-iframe-owned-bridge-prototype.mjs` | First decision-only scriptless iframe prototype. Exact ownership/trusted activation bridge works for tested navigation, but initial ordinary sizing undercounts collapsed margins. Retained as a failed prototype. |
| `rector-iframe-owned-bridge-sizing.mjs` | Corrected geometry with unchanged assertions: explicit-theme arm passes 6/7 properties, including ordinary 1167 px content, actual links/download, native playback, confinement and synthetic/disposed-link negatives. `calc(100vh + 20px)` still creates a height feedback loop. This is decisive evidence against adopting the current prototype. |

The complete diagnostic runs generally exit 1 because known negative controls
and rejected proposals are intentionally retained. Report individual arms and
properties; do not label the complete scripts green. In the final iframe probe,
the opaque control's `viewport-height-feedback` PASS means only that its fixed
150px viewport does not auto-grow; it does not establish adequate content flow.
The resize stop after 24 measurements is a probe safety cutoff, not an accepted
product cap or fallback.

The iframe sources transform only the served current Raw sanitizer configuration
to retain `target` during that decision experiment. Their frame construction,
bridge and sizing are fixture code, not production changes. They preserve the
fixture's model JSON, which is not proof of integrated Editor history, selection,
all four surfaces or the complete resource lifecycle. In particular, the
prototype rebinds on later accessible frame loads and does not establish source-
generation admission for navigation replacement; the decision memo records that
limitation. No production safety claim is inferred from the scoped negatives.

## Required paths and reproduction

The exact executed sources preserve these hardcoded session paths:

| Path | Required content |
| --- | --- |
| `/workspace/scratch/61a2ad7355f4/editor` | Git checkout containing the original pinned commit objects and installed dependencies from the checkpoint lockfile |
| `/tmp/rector-v1-5e5c7f8` | Unmodified v1 Git archive |
| `/tmp/rector-eh-current-948bc554` | Unmodified current Git archive named above |
| `/tmp/rector-carousel-upstream-9896ddf6` | Exact upstream archive, needed by the upstream comparison probes |
| `/tmp/rector-carousel-deferred-capture.js` | Exact failed candidate source retained here; needed by its historical probe |
| `/tmp/rector-carousel-native-controls.js` | Exact corrected candidate source retained here; needed by its probe |
| `/tmp/rector-eh-media.webm` | Local two-second black VP8 sample described below |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` | Session-provided Playwright module |
| `/tmp/rector-browsers/chrome-linux64/chrome` | Chromium executable |

Supply the archives before execution; do not replace their source files with
working-tree modules. The upstream archive URL is
`https://codeload.github.com/Shelamkoff/carousel/tar.gz/9896ddf60e594501b612ce38dbac66270f93181e`.
The current/v1 archives are obtainable with `git archive` once the named Git
objects are available. Copy the exact proposal `.js` files to their recorded
`/tmp` locations before running their associated probes.

The media sample was generated with:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi   -i color=c=black:s=160x90:r=10 -t 2 -c:v libvpx -an   -y /tmp/rector-eh-media.webm
```

For example, with those prerequisites present:

```sh
node rector-carousel-native-controls-regression.mjs   > /tmp/rector-carousel-native-controls-regression.json   2> /tmp/rector-carousel-native-controls-regression.stderr
```

The expected complete diagnostic exit is 1 because the original dependency arms
still fail. Inspect the eight `native-controls` results to assess the candidate.
The patch can be checked without modifying the exact upstream archive with
`git apply --check /path/to/rector-carousel-native-controls.patch` from that
archive's root. Normal application/package/browser checks against a future
published dependency remain separate gates.

No repository script or CI job invokes these sources automatically. Do not edit
these immutable files to relocate paths or add assertions. Use a newly named
source with its own hash and results for a new run. Normal diff whitespace tools
may report the single-space context lines inside the `.patch` artifacts; those
are required unified-diff context, retained byte-for-byte.

## Exact source hashes

```text
ee385e1b8ccc05bbd96d114f77bfde8163ff52631783691234d35211838ac302  UPSTREAM_LICENSE
50ba89120fb27999a169827ba68568147766bccec541bf2a7f0ce7d542d9e11a  rector-carousel-deferred-capture.js
e462d0c06d094492f9efd783e802c1917f8a901fa1781abceb0eb68333127d0a  rector-carousel-deferred-capture.patch
dbce38576455299d1ecbcb2b3a867fd7fd8e1aa1ed66b4d258b0b1fb3ca0baf4  rector-carousel-interactive-ownership.mjs
bba8c416aa53565a2c2d76475b1c086a9ca10c33a68fc2134ad8971694bd293b  rector-carousel-keyboard-popover-negative.mjs
4b42ba593eeb30cb6833e5adea11dda923e820187e5367c298b0a6a24582e0c5  rector-carousel-native-controls-regression.mjs
2b4cbea767aefdae6b50f0004095071c18655512bf76d60b6fe7ce83c8c65444  rector-carousel-native-controls.js
b232580b65aee7f0cde94d94d0e34ef63d4837579365afa6e63df548f1d9df13  rector-carousel-native-controls.patch
c9fc50c89c5d5d5298b400884e1ba11ab234461f0736b01721d9902e56b94e05  rector-carousel-upstream-regression.mjs
962f996d7b6883f0913a1923295967308dbdc138b8699b6c830d2eb97eb45c9e  rector-eh-first-probe.mjs
7451406f21f86f29c266ec237b6643260db473e7260d14b18fd9a98221c5324f  rector-eh-media-keyboard-controls.mjs
a3e677b029a512459d3ddd8a582ba563790ec47fadc19f63aa2fef27740c1cb3  rector-eh-overlay-controls.mjs
59016baaea69f7297fc74882a1df6ecc46df06a7a225ba68314f5286b0156013  rector-eh-positive-controls.mjs
f8c24edf25115a233d7d73fa48f5a2249aa1e02ccad2e236ec44a6bd8b6d76bf  rector-iframe-owned-bridge-prototype.mjs
e7f83091542c2ca52b8fc67be9c9ba85b1bb67f9acfd4e36472e7f6bfed9b6fd  rector-iframe-owned-bridge-sizing.mjs
c6549fbe5648986017700a798e474a7dcc10e364f5ebfc08f282feeb3df85075  rector-style-cascade-and-navigation-controls.mjs
9799fc1926c8bd7d1f33a57b34899bd493a07ce1d5a8eb4f43e0b2378cab8c9a  rector-style-cascade-and-navigation-final.mjs
91f94426dd2a0bc4322fb279ab7c5f3c66281ed0ec7fbd1ad0d2a7ef665059fa  rector-style-positive-negative.mjs
```

This folder adds scoped evidence and a reviewable proposal. It does not close
B-HTML/B-STYLE, accept a new HTML/class policy, upgrade a dependency, establish
cross-browser/platform parity or automatically accept any preservation row.
