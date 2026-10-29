# Built-in block ROUNDTRIP investigation

This is the implementation inventory and reproduction guide for the
`ROUNDTRIP` template in the functional preservation register. It does not
accept any detailed block-action row. An inventory entry is not evidence
that its browser scenario has run.

The first vertical slice is Paragraph, with separate actual default
construction and populated-document cases. The populated case contains
both real Mention and Color sidecars inside authored formatting, fixed
neighbor blocks, and stable IDs. A third populated positive control keeps
the same widgets outside formatting wrappers, distinguishing the known
baseline mode-transition failure from ordinary widget support.
Other inventory entries below are planned
coverage, not completed tests.

## Source identities and test-only adapters

| Source | Git identity |
| --- | --- |
| v1.0.5 | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` |
| Specification baseline | `e981ff308000c1d92d7e820df95113c1e19bcee8` |
| First investigation candidate | `4f1ccfd3c2364dbc2f1e3e982302c24b5ac5d0b6` |

The runner records the exact candidate identity for each execution; the
table identifies the beginning of this investigation, not every future
run. Source files and styles are compared byte-for-byte with their Git
objects before serving and checked again after the run. The separate
browser fixture is hashed as test input.

v1 block classes are constructed with `new`; v2 uses the public factory
functions. v1 inline renderer configuration is `inlinePlugins` with
`createMentionWidget()` / `createColorSwatchPlugin()`; v2 uses
`inlineRenderers` with the dedicated Mention/Color renderer factories.
Current block and inline `dataVersion` fields are supplied only to the
versions that define them. These are fixture adapters, not production
compatibility or a legacy decoder.

## Inventory of 21 built-ins

The defaults in this table are current schema defaults. Their concrete
construction, presentation and historical differences must be executed
before accepting the corresponding row. Populated fixtures must preserve
all listed content, order and identifiers; they must not infer expected
author data from an initial `save()` result.

| Block / current version | Current default | Planned populated fixture and declared edit | v1 adapter / principal risk |
| --- | --- | --- | --- |
| Paragraph / 2 | Empty text | Rich text, both inline sidecars; edit `text` | Alignment was plugin data; now tunes. First implemented vertical slice. |
| Heading / 2 | Empty level-2 heading | Level 3, rich text/sidecars; edit `text` | Alignment relocation; preserve level/tag. |
| List / 2 | One empty unordered item | Ordered pair with marks/sidecars; edit `item:first` | v1 string array; compare content/order and separately preserve current item IDs. |
| Quote / 1 | Empty quotation and caption | Rich quotation and independent rich caption; edit `text` | Fields share the wire shape; caption must survive. |
| Code / 1 | Empty source, `auto` language | Literal multiline HTML-like source, explicit language; edit `code` | Plain source has no fabricated rich-text sidecar. |
| Image / 1 | Empty file URL/caption, false flags, empty styles | Controlled local image, rich caption, appearance; edit `caption` | Caption is declared only with an image source. |
| Delimiter / 1 | Empty object | The same data-free separator | No editable field or fabricated authoring step. |
| Table / 2 | One empty cell with row/cell IDs | Rectangular rich cell matrix, headings; edit a declared cell | v1 `content: string[][]`; current identified rows/cells. Default size difference remains unresolved. |
| Checklist / 2 | One empty unchecked item | Checked/unchecked pair, marks/sidecars; edit first label | v1 item IDs absent; checkbox is not the editable label. |
| Warning / 1 | Empty title and message | Independent rich fields; edit `title` | Empty renderer slots may be omitted without losing data. |
| Embed / 1 | Empty service/video/caption/metadata | Controlled service/video with local cover, rich caption | Disable or inject documented metadata provider; caption exists only for a valid embed. |
| Raw / 1 | Empty HTML source | Safe multiline authored HTML; edit `html` source | Source field is plain text; preview confinement/navigation remain separate rows. |
| Gallery / 2 | No images, auto layout, declared viewer defaults | Two local images, captions, layout/options; edit first caption | v1 image IDs absent; no fabricated caption on an empty gallery. |
| Carousel / 1 | No slides, autoplay off | Identified local slides/captions, deterministic controls | IDs already exist in v1; no external media playback/provider assumptions. |
| Attaches / 2 | No files, variant `f` | Controlled file URL/name/size/extension; edit filename | v1 file IDs absent; name is plain text. |
| LinkPreview / 1 | Empty metadata, `notion` template | Controlled URL and populated metadata; edit declared URL | URL field disclosure and metadata replacement need the documented provider contract. |
| Toggle / 1 | Empty title/content, closed | Rich title/content and explicit open state | Hidden content must survive mode changes. |
| Columns / 2 | Two empty columns, `1-1` layout | Two rich columns; edit first declared column | v1 column IDs absent; retain content/order/layout. |
| Spoiler / 1 | Empty label/content | Rich label and content | Hidden content and rendered placeholder labels need separate assertions. |
| Poll / 1 | Single choice, two empty options, always-visible results | Identified choices/question and fixed result data | Canonical results/provider effects must be distinguished; no external voting provider. |
| Person / 2 | One empty profile and no links | Rich profile fields, local avatar and identified link | v1 profile/link IDs absent; hidden fields and empty draft filtering need explicit controls. |

The existing `tests/browser/roundtrip.js` is a useful current-format smoke
and save/reload check. It does not replace this template's native history,
mode, sidecar, rendering and three-source requirements.

### Default Table investigation

v1 `plugins/table/index.js` constructs a 3-by-3 grid when no content is
supplied, and its README explicitly documents that default. The current
README explicitly documents a 1-by-1 empty grid. `git blame` attributes
the current schema default to
`fab6eb36d92cc6583bcb39d49f9503b3be3a5db6` (`feat: add table stable-id
schema`). This is a documented behavioral difference, not merely the
addition of IDs. Its public construction, preserved configuration route
and contract disposition must be established before treating it as either
a regression or an accepted change.

## Running the vertical slice

Prepare unmodified archives of the two baseline commits and run `npm ci`
in the candidate checkout. The original baseline Git objects must remain
available for identity verification. If publication changed commit IDs,
see `checkpoints/2026-10-29/PUBLICATION.md`.

```sh
EDITOR_V1_ROOT=/path/to/v1-archive \
EDITOR_SPEC_BASELINE_ROOT=/path/to/spec-baseline-archive \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
node scripts/parity/block-roundtrip.mjs > block-roundtrip.json
```

`EDITOR_CANDIDATE_ROOT` plus `EDITOR_CANDIDATE_SHA` select an immutable
candidate archive; otherwise the checkout and current HEAD are used.
`EDITOR_DEPENDENCIES_ROOT` can point to a separate installed
`node_modules`. `EDITOR_ROUNDTRIP_FILTER` selects an exact scenario-ID
substring; the trace lists the actual selected IDs. Playwright and
Chromium belong to the test environment and are not new Rector package
dependencies.

The standard candidate page is registered in the existing native runner:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html \
node tests/browser/physical-history.mjs
```

Every completed case creates the default or populated document, checks
fixed canonical data, renders both detached and mounted output, switches
read-only and back while retaining independent host focus, performs real
pointer focus and native field input, then exact one-step Undo/Redo. It
checks marks, sidecars, IDs/order, logical caret, DOM reuse, renderer input
immutability, disposal and release of newly acquired owned styles. No
private editor transaction or compatibility implementation is invoked.

Errors retain completed and incomplete phases. In particular, a baseline
that throws while switching mode does not receive credit for the remaining
history or disposal assertions. Known historical defects, if classified,
remain visible as raw failures with exact source/scenario/property checks;
unrelated candidate or baseline failures must remain fatal.

The Paragraph oracle classifies only these observed historical differences:

- v1 remounts the exact block/widget arrays during read-only/editable mode
  changes and Undo/Redo. Its author data and sidecars must still be exact.
- The first v1 Undo in the two populated cases focuses the preceding
  `prefix` Paragraph, with both native points in text `Before` at offset 6.
  The required `probe` caret is offset 14. The full active/anchor/focus
  ownership snapshot must match before this difference can be classified.
- e981 throws `Inline widget root left its projection boundary before
  hydration` while entering read-only mode in the formatted-widget case.
  Only `load` completed; read-only, return to editing, edit, Undo, Redo and
  disposal assertions remain explicitly unexecuted. The unwrapped positive
  control exercises the complete template on that baseline.

The candidate receives none of these exceptions. Raw failures remain in
the JSON alongside classifications. `incompleteCases` lists every partial
scenario even when its precise historical cause is known. Exit zero means
there is no unexpected failure; it does not relabel incomplete baseline
phases as passes.

This page does not by itself accept full Paragraph behavior, any other
block, hostile HTML/class confinement, all renderers, platform breadth or
full editor parity.
