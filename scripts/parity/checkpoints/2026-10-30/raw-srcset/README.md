# Raw responsive-image preservation — 2026-10-30

This is a bounded repair in the existing shared Raw HTML sanitizer. It does not
select a new HTML containment topology, change inline class trust, or close
`B-HTML`, `B-STYLE`, a complete Raw/Carousel row, or whole-library parity.

## Repair and source

The old candidate splitter treated every comma outside the first data-URL comma
as a separator. A real permitted HTTP image URL ending in `?asset=one,two 1x`
therefore loaded `?asset=one`. The same regular expression also discarded valid
exponent and leading-dot densities, width/height descriptor pairs, and mishandled
invalid descriptor boundaries. DOMPurify's preliminary single-URI check removed
permitted blob/raster candidates and an entire attribute whose first candidate
was unsafe, before Rector could preserve its allowed neighbor.

The replacement follows HTML candidate boundaries: collect a URL until ASCII
whitespace, remove trailing delimiter commas, and keep commas inside a
parenthesized descriptor. The browser still decides descriptor validity and
image selection. Invalid descriptors are retained as invalid; removing text
from them must not activate a different candidate. Every candidate URL passes
the unchanged shared media policy. No protocol, CSS property, iframe permission
or public API is added.

`ADD_URI_SAFE_ATTR: ['srcset']` delegates that attribute's URL validation from
DOMPurify's single-URI prefilter to this per-candidate hardening. The fragment
remains inert until `hardenRawFragment` has completed. The Trusted Types signing
pass receives the already hardened serialization. Negative cases cover script,
active SVG data, credentials, messaging/file protocols, and unrequested foreign
network attempts; permitted blob/raster sources have actual decode controls.

- Base: `69c8425e0081fde69cf5176ccb73d032720c15fc`.
- Production and registered regression commit: `9b99110a`.
- First complete validation: `fd2614f899ddf8d8dd1b02855f6e83b13788899c`,
  tree `90e8ef906754b3260feccfed288cf425263200fa`.
- Final isolated-oracle validation: `66b5a1c60f3aea3825d8382cbef77faa692dad50`,
  tree `31fb517ae7b3fe34d98c075e5d8b5c3e1d17e7a2`.

The final source changes only `tests/browser/raw-srcset-fixture.js` after the
first complete validation. It removes the comma from density/negative-control
URLs, so each grammar defect is independently observable. Production, native,
type, security and downstream fixture source files remain identical. The
source comparison and six full-index patches/raw commit objects are retained
under `source.json` and `reproduce/`; they reconstruct the named original trees.

## Final immutable comparison

`scripts/parity/raw-srcset.mjs` serves unmodified Git-object modules for v1,
specification baseline, pre-fix and candidate. The fixture, runner and media
asset are separately frozen and hashed. For each source, 15 explicit cases
compare retained markup and actual `currentSrc`/decoding with a bare-browser
control. Unsafe-neighbor controls use the independently stated policy-allowed
candidate. Nearby text/marks, image ownership, alt text, string/node parity and
idempotence are checked. Foreign HTTP requests are recorded and aborted before
leaving the test server's origin; no tested source attempted one.

| Source | Cases | Observations | Raw failures | Incomplete / errors |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d` | 15 | 165 | 33 | 0 / 0 |
| Specification `e981ff30` | 15 | 165 | 32 | 0 / 0 |
| Pre-fix `69c8425e` | 15 | 165 | 32 | 0 / 0 |
| Candidate `66b5a1c6` | 15 | 165 | 0 | 0 / 0 |

The comparison exits **1** and records `candidatePass: true`. Historical
failures are not suppressed, reclassified or converted to passes. All 60
bare-browser controls pass. V1's additional failure is its already historical
credential-bearing media URL behavior; this repair does not change the current
URL policy. Some malformed-descriptor cases differ only in serialized candidate
boundaries under this browser's actual resource-selection behavior; the raw
records distinguish those from observed `currentSrc` failures.

`verify-srcset.py.gz` recomputes all **660** verdicts and verifies **13** loaded
source-file records, the shared dependency file, and the three frozen artifacts.
Its output is `verification-summary.json`. This is an artifact verification
script, not an additional independent implementation or a claim of independent
review authorship. V1 uses its vendored DOMPurify; later sources use installed
DOMPurify **3.4.17**, with exact loaded bytes recorded.

## Other verification

All wrappers retain command, time, exit code, HEAD, tree, lock hash, status and
tracked-diff hash. Each listed run has a clean unchanged source snapshot.

| Gate | Source | Result |
| --- | --- | --- |
| Registered Raw responsive page | final `66b5a1c6` | 21/21 passed |
| Same page with enforcing Trusted Types | final `66b5a1c6` | 21/21 passed |
| Existing `security.html` | first complete `fd2614f8` | passed |
| Existing `trusted-types.htm` | first complete `fd2614f8` | passed |
| Native `native-plugin-parity.html`, filter `Raw` | first complete `fd2614f8` | 5/5 passed |
| Shared URL policy unit tests | first complete `fd2614f8` | 9/9 passed |
| Both checked-JavaScript configurations | first complete `fd2614f8` | passed |

The registered page exercises foreign owning documents, signed HTML sinks,
Raw/Carousel renderer image loading, Carousel editor image loading, Raw preview
source metadata, caller/canonical data preservation, public update/Undo/Redo and
disposal. The Raw iframe is still opaque: this page checks its projected source
and unchanged sandbox flags, not child-frame image loading, navigation, sizing
or confinement. The native Raw filter additionally retains real typing,
selection/caret/history, Tab indentation, read-only behavior, conversion and
preview history checks. These are bounded controls, not all Raw or Carousel
capabilities.

Environment: Linux x64, Node `v24.22.1`, Chrome `156.0.8078.79`. Final comparisons
use device scale factor 1. No other browser, OS or arbitrary density policy is
inferred from these results. Standard reproduction commands are:

```sh
EDITOR_BROWSER_PAGE=raw-srcset.html node tests/browser/run.mjs
EDITOR_BROWSER_PAGE=raw-srcset-trusted-types.html node tests/browser/run.mjs
EDITOR_NATIVE_PAGE=native-plugin-parity.html EDITOR_NATIVE_FILTER=Raw node tests/browser/physical-history.mjs
node scripts/parity/raw-srcset.mjs
```

Set `EDITOR_CHROME_PATH` and `EDITOR_PLAYWRIGHT_PATH` for the chosen installed
browser and Playwright module. The exact session supervisor is also archived.

## Retained development and initial evidence

`development/` retains the original logs, including the intended comma-URL RED
and unsafe-leading-candidate RED. Earlier probe attempts used a blob resource
before separating its URI-prefilter behavior, or a Vite-inlined SVG data URL
that the media policy correctly rejects; their generic decode failures are not
the accepted comma regression. A later fixture initially supplied a competing
implicit 1x `src`, and one history fixture initially used the wrong public
`blocks.update` patch shape. Those are fixture corrections, with no production
change made to satisfy them. The final immutable comparison supplies the fully
reproducible pre-fix RED and candidate GREEN on the same independent oracle.

`first-complete-fd2614f8/` retains the earlier full successful gates and its
combined comma/density corpus. `final/` retains the corrected independent
grammar controls and their rerun. It also contains byte-identical copies of
five earlier gate logs; `source.json` explicitly maps those copies back to
`first-complete-fd2614f8`. Only the three commands in the final manifest were
rerun on `66b5a1c6`. Neither earlier result is overwritten or counted twice.

## Platform references and remaining boundary

The [HTML srcset algorithm](https://html.spec.whatwg.org/multipage/images.html#parse-a-srcset-attribute)
defines the URL, trailing-comma and descriptor-parenthesis boundaries used
here. The [DOMPurify 3.4.17 README](https://github.com/cure53/DOMPurify/blob/3.4.17/README.md)
and [source](https://github.com/cure53/DOMPurify/blob/3.4.17/src/purify.ts)
document and implement the caller-owned URI validation added by
`ADD_URI_SAFE_ATTR`. These official resources were retrieved on 2026-10-30;
their URLs and SHA-256 values are in `official-references.json`. This is not a
fresh dependency/advisory review or a dependency upgrade.

The existing HTML/style decision still has concrete unresolved requirements:
implicit host theme preservation, viewport-relative iframe auto-height, and
host-class confinement without clipping legitimate glyphs. This source does
not change those contracts, adopt an experimental topology or accept an
additional preservation-register row.
