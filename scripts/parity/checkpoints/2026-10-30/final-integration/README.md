# Final integration verification — 2026-10-30

This checkpoint joins the source-completion, derived-presentation and late
Person ownership repairs with their final integration evidence. The directory
uses the user's local checkpoint date; original manifests retain UTC timestamps
from 2026-10-29. It does not accept the whole library or every action of the
affected plugins.

## Exact code and publication

The production and test source is local commit
`60fec50c9ac9ec9a82e1d1c0653ce44cda06d51b`, tree
`ff795704ef0602156c07c46e17d664048240ca79`. Both the browser attempt and its continuation use
`f04e63da788564cd00d5316dacf9146b6d6d8aba`, tree
`94193654b29acd021200367787cb234d9fbd8cb1`; the only intervening change is
Russian preservation prose. Later commits add documentation and evidence only.
Their runtime and test bytes are unchanged. `runtime-publication-map.json`
binds the original checked commits to their exact-tree GitHub equivalents.

Git CLI reads were available but push credentials were not. Authorized GitHub
Git Data publication preserves every complete tree and ordered parent; commit
identities change with server commit metadata. No force push or source
transformation is used. The map describes these tree identities, not a second
test execution on the remapped commit IDs.

## Final verification

| Check | Actual result | Source / original run |
| --- | --- | --- |
| Library and runtime typecheck configurations | PASS | `60fec50c`, `run-T69Tfd` |
| Unit suite | 1987/1987 PASS | `60fec50c`, `run-T69Tfd` |
| Installed-package contracts and build | PASS | `60fec50c`, `run-T69Tfd` |
| Consumer declaration suite | 7/7 PASS | `60fec50c`, `run-T69Tfd` |
| Bundle size check | PASS; core 124.6 KiB gzip | `60fec50c`, `run-T69Tfd` |
| Three-source roundtrip comparison | 53 candidate cases, 9129 observations, zero failures | `60fec50c`, `run-T69Tfd` |
| Historical classifier sensitivity | PASS | `60fec50c`, `run-T69Tfd` |
| Ordinary browser pages and first 25 named native pages | 36/36 pages and 970 named-native records passed before interruption | `f04e63da`, `run-bJYxpZ` |
| Remaining ten native pages and heap | 10/10 pages, 939 recorded cases; heap 23 sentinels, 0 retained, eviction controls PASS | `f04e63da`, `run-aO0xLM` |
| Documentation tests and production documentation build | Separate final gate pending | See the subsequent final documentation manifest |

The size check's 51 KiB reference is informational. Passing that command is not
acceptance of all comparative performance or allocation obligations. These
results overlap focused checkpoints and earlier cumulative runs; their case
counts must not be added together. Each actual command retains its original
source-before/source-after identity and process outcome.

Both browser attempts use Chrome for Testing `156.0.8078.47`, Linux and
Node `v24.22.1`. Focused repair checkpoints also contain Chrome 142 evidence.
The interrupted log proves successful Enter/toolbox checks, the history matrix
and six initial native fixtures by sequential control flow; their final JSON
was not emitted, so their case counts are not reconstructed. Its 25 named native
page markers contain 970 cases. The separate continuation records the remaining
ten named pages and heap gate in full. This is composed coverage on unchanged
code, not a successful monolithic `npm run test:browser` command. Expected
negative statuses inside the harness-contract self-test are not product errors.

## Comparison with the first version

The unchanged shared fixture executes the real pinned v1 source
`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, specification baseline
`e981ff308000c1d92d7e820df95113c1e19bcee8` and the candidate.

| Source | Cases | Observations | Raw differences | Unexpected failures |
| --- | --- | --- | --- | --- |
| Candidate | 53 | 9129 | 0 | 0 |
| v1 | 53 | 9040 | 781, narrowly classified | 0 |
| Specification baseline | 53 | 6824 | 79, narrowly classified | 0 |

Fifteen specification-baseline cases have incomplete later phases; those phases
are not passed. Historical exceptions are source-, case-, phase- and
value-specific. Candidate exceptions are never admitted. Current capabilities
missing from v1, including Poll's inline-widget cases, are explicitly identified
in the fixture and earlier LinkPreview/Poll checkpoint. The comparison uses
shared contemporary installed dependencies, not a reconstructed historical
dependency installation.

The runner verified 218/241/241 loaded Git source/style files and 64 dependency
files before and after execution. The final raw differential SHA-256 is
`48fd1ec025c8e9d55ae71fabb0fb65a5fb531b46624ab6acfdc571d99fa70e05`.
All 64 loaded dependency hashes also matched the independent dependency copy
used by the final browser replay.

## Earlier failed attempts retained

`run-T69Tfd` is an overall failed manifest because Russian prose validation
failed; its seven other gates genuinely passed on unchanged source. That
manifest is not rewritten into an overall success.

`run-aoJ0oS` stopped at a deferred syntax-highlighting import whose Vite URL
referenced a stale shared-cache hash. The diagnostic records the failed URL and
the observed cache identity. An independent dependency copy and cache resolved
the verification interference; no product assertion or runtime code was
weakened for the replay.

`run-Ea04al` failed setup because the temporary dependency-copy realpath lacked
a `node_modules` ancestor. Node could not resolve transitive packages. Moving
that same copy to the final worktree's actual `node_modules` directory repaired
module resolution without changing package bytes.

`run-bJYxpZ` retains its earlier failed Russian-prose gate and an interrupted
browser command. The execution session and verification parent processes were
absent while their owned browser/server children remained; the source stayed
unchanged. The recorder marks the attempt interrupted, and the orphaned children
were stopped before the continuation. No product assertion failure was observed
before interruption, and no cause or user cancellation is inferred. The
remaining ten pages and heap run separately on the same source. Corrected prose
has its own final documentation run. None of the original attempts is relabeled
as a complete green run.

## Bounded repairs

- Rich-field source completion now follows the existing hydration and exact
  ownership checks before canonical/history acceptance. Gallery's derived
  alternative text reflects final visible text and widgets.
- Image and Person no longer update derived rich-field presentation from direct
  input listeners after their view has been adopted by another owner.
- Person's URL icon follows admitted synchronous control reads. Core read/mode
  boundaries revalidate the original plugin root, and teardown preserves foreign
  DOM. Exact field ownership and healthy-sibling controls remain covered.
- Poll result labels use their completed readable field projection, preserving
  permitted formatting instead of exposing canonical widget placeholders.
- Carousel captions use the existing inline parser; native ampersands, entities,
  formatting and widget data render correctly.
- The previously published LinkPreview cancellation/native URL repair and
  vertical-selection repair remain included.

Focused RED/GREEN evidence is retained in the adjacent
`gallery-source-completion`, `image-person-native-ownership`,
`carousel-caption-renderer` and `person-url-owner` directories, plus the preceding
date's `link-preview-native` and `link-poll-roundtrip` checkpoints.

## Acceptance limits

The preservation register has **209 unique rows: 32 accepted and 177 open**.
Only the LinkPreview and Poll common roundtrip rows were newly accepted in this
batch. Gallery, Carousel and Person full ROUNDTRIP remain open. The other open
rows are individual proof/decision obligations, not a count of confirmed bugs.

`B-HTML` and `B-STYLE`, complete `C09`/`T15` performance evidence, Carousel
auto-height ResizeObserver behavior and upstream Swipe capture behavior retain
their separate obligations. The bounded Carousel comparison used public
`aspectRatio: '16 / 9'`; it did not repair or accept auto-height. This checkpoint
does not establish complete Firefox/WebKit, operating-system clipboard or IME
coverage, full v1 parity, or whole-library acceptance.

## Reproduction and raw evidence

Run the existing scripts from a clean checkout with an independent installed
`node_modules` directory and the browser/dependency/archive inputs documented in
`scripts/parity/README.md`. The original manifests record exact commands and
environment selections. Use `scripts/verification-results.mjs` to create a fresh
run; do not reuse or edit an attempted gate.

Original manifests are stored unchanged. Logs are compressed losslessly, with
original and compressed SHA-256 values in `hash-index.json` and
`continuation-hash-index.json`. Gzip timestamps
are deterministic. The final documentation result is archived separately so
that adding its evidence cannot retroactively change its checked source.
