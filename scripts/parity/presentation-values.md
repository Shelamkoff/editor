# FONT and benign class preservation runner

`presentation-values.mjs` runs the nine `PRESENTATION_VALUES_FONT_1..9`
scenarios and the benign `PRESENTATION_VALUES_CLASS_SPAN` /
`PRESENTATION_VALUES_CLASS_CODE` scenarios against real v1, specification
baseline and candidate modules. It uses the same fixed browser fixture as
`tests/browser/presentation-values.js`, which is imported by the standard
`native-plugin-parity.html` suite.

This runner is independent of the immutable HTML/style checkpoint probes.
It makes no changes to production modules, sanitization policy or package
dependencies. The user must supply Chromium and Playwright from their test
environment; neither is added to the Rector package.

## Inputs and invocation

Run `npm ci` in the Rector checkout first. Prepare archive directories from
these exact Git objects using `git archive`, without modifying their files:

| Environment variable | Required source |
| --- | --- |
| `EDITOR_V1_ROOT` | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (v1.0.5) |
| `EDITOR_SPEC_BASELINE_ROOT` | `e981ff308000c1d92d7e820df95113c1e19bcee8` |
| `EDITOR_CANDIDATE_ROOT` | Optional immutable candidate archive; defaults to the checkout containing this runner. |
| `EDITOR_CANDIDATE_SHA` | Exact Git identity of that candidate; defaults to the checkout's current `HEAD`. |
| `EDITOR_DEPENDENCIES_ROOT` | Optional dependency directory; defaults to this checkout's `node_modules`. |
| `EDITOR_PLAYWRIGHT_PATH` | Optional absolute path to an installed Playwright ESM entry; without it, Node resolves `playwright` normally. |
| `EDITOR_CHROME_PATH` | Optional Chromium executable; without it, Playwright uses its installed browser. |
| `EDITOR_PRESENTATION_FILTER` | Optional scenario-ID substring for a focused investigation. No match is an error. |

The checkout must retain the two baseline Git objects, because every served
production source and stylesheet is compared byte-for-byte with `git show`.
When reproducing a checkpoint whose API publication rewrote commit IDs, see
`checkpoints/2026-10-29/PUBLICATION.md` for reconstruction of the original
source identities.

```sh
EDITOR_V1_ROOT=/path/to/v1-archive \
EDITOR_SPEC_BASELINE_ROOT=/path/to/spec-baseline-archive \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
node scripts/parity/presentation-values.mjs > presentation-values.json
```

Set both candidate variables when the shared checkout contains unfinished
production changes. A differing source is rejected, rather than relabeled as
the commit named by `HEAD`. Fixture sources are hashed separately; they are
test inputs, not purported files from either historical baseline.

The focused standard candidate gate is:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Presentation differential:' \
node tests/browser/physical-history.mjs
```

## Independent expected behavior

Both editor and renderer load their ordinary stylesheets. Explicit host
rules then establish an actual 20px Paragraph base; the document root is
16px. Both bases are asserted in every phase. The expected sizes are fixed:

| Authored value | Expected computed size |
| --- | ---: |
| `16px` | 16px |
| `16.5px` | 16.5px |
| `1.5em` | 30px |
| `150%` | 30px |
| `1.5rem` | 24px |
| `calc(10px + 1em)` | 30px |
| `201px` | 201px |
| `250px` | 250px |
| `inherit` | 20px |

The two benign class fixtures use an explicit host rule with enough
specificity to override the built-in code presentation. They require the
authored classes, `lang="javascript"`, 30px size and `rgb(12, 84, 156)`
color. The code fixture is single-line inline code; it does not claim
multiline syntax-highlighter coverage.

Every case runs load/save/render, trusted insertion of `X` into adjacent
plain author text, one trusted Undo, and one trusted Redo. The oracle checks
canonical block metadata, exact text/mark/class/language structure, both
editor and renderer computed styles, caret/focus, unchanged input data,
one-step history availability, exact saved-record replay, and an untouched
neighbor's DOM identity. Attribute order and browser style serialization
are normalized by a test-owned HTML parser, without calling a Rector
sanitizer or deriving expected sizes from product output.

Only public API and wire spelling differ: v1 uses `new Paragraph()` and its
v1 document envelope; the two v2 sources use `createParagraphPlugin()` and
Paragraph `dataVersion: 2`. All use `createEditor`, `save`, native keyboard
events and the public `EditorRenderer` constructor/`renderTo`/`destroy`.

## Results and limits

The JSON output records the runner and browser-fixture hashes, every loaded
source/dependency hash, exact candidate identity, browser/runtime versions,
all phase observations, raw failed assertions and their classification.
Files are checked again after execution. `sourceUnchanged` concerns the
bytes actually loaded during the run; `sourceIdentityVerified` additionally
requires every requested source to have passed identity verification.
Neither field substitutes for examining execution errors and failures.

The only classified historical difference is v1 reconstructing the
untouched neighboring block during Undo/Redo. Its two raw identity failures
remain visible as `repaired-v1-history-remount`; e981 and the candidate must
retain the neighbor. All other historical or candidate failures produce a
nonzero exit. The baseline v1 history callback is wired to whole-document
`facade.render` in `core/index.js`; this classification does not excuse
lost formatting, caret, records or extra history.

These cases do not select a class-trust policy or accept hostile-class
confinement, Raw/Carousel topology, navigation, other renderers, full tool
coverage, or other browser engines/platforms. The separate HTML/style
checkpoint retains known hostile-class and HTML confinement failures.
Passing this bounded runner must not be described as full editor parity.
