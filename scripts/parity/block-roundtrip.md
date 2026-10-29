# Built-in block ROUNDTRIP investigation

This is the implementation inventory and reproduction guide for the
`ROUNDTRIP` template in the functional preservation register. It does not
accept any detailed block-action row. An inventory entry is not evidence
that its browser scenario has run.

The implemented rich-field slices are Paragraph, Heading, List, Quote, Warning, Checklist, Spoiler and Columns, each with
separate actual default construction and populated-document cases. Each
populated case contains both real Mention and Color sidecars inside
authored formatting, fixed neighbor Paragraphs, and stable IDs. A third
populated positive control for each block keeps the same widgets outside
formatting wrappers, distinguishing the known baseline mode-transition
failure from ordinary widget support.

Heading uses its actual empty level-2 default and a fixed populated level-3
document. Editor fields and all three renderer contexts assert the exact
H2/H3 tags; output block IDs, types and order are also checked independently
of canonical saved data. This does not cover controls for every heading
level, heading-root paste or splitting/conversion.

List uses its actual one-item unordered default and a fixed two-item
ordered document. The first item contains the inline widgets; the second
retains independent `mark` formatting. The fixture checks UL/OL roots,
LI order and authored content, stable item DOM, and the exact current item
IDs in both saved data and editor DOM. It edits only the first declared LI;
the second item and neighboring Paragraphs must remain unchanged. List
Enter/Backspace, partial selection and style controls remain separate rows.

Quote keeps Mention in the primary text and Color in its separate caption.
The fixed caption also contains independent `mark` formatting. The editor
checks both BLOCKQUOTE/CITE fields, their editability and DOM identities;
the renderer checks its separate P/CITE author slots and omits an empty
caption slot. The native edit and one-step Undo/Redo are initiated in the
primary text. Caption is proved as preserved sibling data, live DOM and
renderer output; this is not a separate native caption-authoring cycle.

Warning keeps Mention in its title and Color in its independent message.
Both editor DIV fields are checked for authored contents, editability and
DOM identity. The renderer checks separate STRONG/P author slots, omitting
only the slot whose saved value is empty. Native input and one-step
Undo/Redo operate on the declared title field; message data and live DOM
must survive that sibling edit. A separate native message-authoring cycle
is outside this template.

Checklist uses its real one-item unchecked default and a fixed checked /
unchecked pair. Only the first declared text label is edited; its checkbox
is a separate control. The fixture checks both labels, checked classes,
button `aria-pressed` and read-only disabled state, row/button/label DOM
identities, and current item IDs. Renderer UL/LI/SPAN structure, rich label
contents and checkbox role/`aria-checked` must match the saved states in all
three contexts. v1 receives the same item text and checked state without
invented IDs. Checkbox activation, Enter/Backspace and selection actions
remain separate detailed behavior rows.

Code adds two plain-text cases: its real empty/`auto` default and literal
multiline source with a fixed `javascript` language. Source containing HTML
syntax, an entity and a token-looking string remains literal in canonical
data, the textarea and all renderer outputs; no rich-text sidecars are
invented. The native Edit control reveals the source field when needed.
The fixture then checks textarea value, read-only state, native selection
endpoints and field identity through native input and one Undo/Redo. The
preview's presentation-only final newline is checked separately from the
saved source. Language is preserved in data and in populated renderer
output. The differential serves the v1 bundled highlighter unchanged;
its unbundled v2 sources use their documented plain-text fallback when the
bare optional highlighter import cannot resolve. The standard Vite native
page supplies the installed highlighting dependency. Token colors and
highlighter injection are not accepted by this roundtrip template.

Delimiter adds two explicit non-editable scenarios. Its actual default
has payload `{}`, an editor HR and renderer HR, no text or source control,
and no invented sidecar. It executes load/render, read-only and return,
then cleanup. Native edit/Undo/Redo are explicitly not applicable in that
case; the trace retains `notApplicablePhases` and the top-level
`notApplicableCases` summary instead of crediting unexecuted authoring.
The `populated-neighbor-edit` case keeps the same empty Delimiter between
Paragraphs and performs trusted native editing plus one Undo/Redo in the
real prefix Paragraph. That separate adjacent-history control checks
Delimiter payload, ID/order, HR DOM identity and renderer output without
pretending to edit the separator. Delimiter insertion, selection, move
and deletion remain a separate structural row.

Image adds a real empty-source default and a populated local PNG with a
literal rich caption. The valid one-pixel image decodes in both the editor
and mounted renderer; no uploader or remote provider is invoked. Fixed
file dimensions, appearance flags and benign CSS values remain canonical;
editor and detached/attached/mounted output preserve caption marks,
alternative text, media URL, dimensions and presentation. A native CSSOM
control distinguishes authored `object-position: center` from its
serialized `center center` and computed `50% 50%`; canonical data retains
the original authored value. Native input and one Undo/Redo operate on the
populated caption. The empty-source image declares no caption field, so
its authoring/history phases are explicitly N/A. The populated case has
no inline sidecars. These two cases are scoped evidence only and do not
complete `BLOCK_IMAGE_ROUNDTRIP`: the supported caption-widget capability
also needs to preserve visible text, alternative text and native range.
The separately confirmed stale-alt and inline-update range-collapse
defects remain open; no widget data is discarded by a historical adapter.
Upload/source actions, caption widgets, hostile styles and the full
appearance/settings matrix are not accepted by this literal-caption slice.

Toggle adds four cases: its actual empty closed default, rich open content,
an unwrapped-widget open control, and the same rich populated document
with `open: false`. Mention belongs to the title; Color belongs to the
independent content field. Both editor DIV fields retain canonical markup,
editability and DOM identity. The fixture checks the open class, actual
body display, `aria-expanded` and the exact `aria-controls` relationship.
All three renderer contexts require DETAILS/SUMMARY/title-SPAN structure,
the saved open state and a body DIV only when content is nonempty. Native
input and exact one-step Undo/Redo edit the title. The independent body,
including closed hidden content and its widget, must survive that sibling
edit. This does not accept toggle-button activation, Enter behavior or a
separate native content-field authoring cycle.

Spoiler keeps Mention in its label and Color in the independent content
field. Its empty default has both editable DIV fields; populated cases
retain both authored values, widgets and field identities. Disclosure is
transient: editing is expanded, read-only is collapsed, and returning to
editing expands the same fields. The fixture checks the actual content
`hidden`/display state, open class, accessible control label and exact
`aria-controls` relationship. Renderer output always starts collapsed,
keeps the separate label DIV, and omits the body only when content is
empty. Native label input and exact Undo/Redo preserve the independent
body. This does not accept disclosure-button activation, Enter behavior,
a separate content-field authoring cycle or other locale labels.

Columns uses its actual two-column `1-1` default and a fixed two-column
`1-2` populated document. Mention belongs to the first column and Color
to the independent second column. Both fields retain contents, editability,
order and DOM identity; current column IDs remain exact in canonical data
and editor DOM. The editor grid and all renderer contexts preserve the
fixed fractional layout and separate DIV columns. Layout controls retain
their fixed accessible labels and active states. Trusted native input and
exact one-step Undo/Redo edit the first column only; the second column's
marks/widget and neighboring Paragraphs must remain unchanged. Layout
activation, three-column conversion, responsive sizing and native editing
in the second column remain separate detailed rows.

Other inventory entries below are planned coverage, not completed tests.

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
versions that define them. The v1 List fixture uses `items: string[]`;
current List uses explicit identified item records. Expected contents and
order are fixed in both forms, without inventing historical item IDs.
v1 Checklist likewise receives `{ text, checked }` items; current Checklist
adds explicit IDs without changing their order or checked values.
v1 Columns receives ordered `{ content }` records; the current form adds
fixed column IDs without changing layout or authored contents.
These are fixture adapters, not production compatibility or a legacy
decoder.

## Inventory of 21 built-ins

The defaults in this table are current schema defaults. Their concrete
construction, presentation and historical differences must be executed
before accepting the corresponding row. Populated fixtures must preserve
all listed content, order and identifiers; they must not infer expected
author data from an initial `save()` result.

| Block / current version | Current default | Planned populated fixture and declared edit | v1 adapter / principal risk |
| --- | --- | --- | --- |
| Paragraph / 2 | Empty text | Rich text, both inline sidecars; edit `text` | Alignment was plugin data; now tunes. First implemented vertical slice. |
| Heading / 2 | Empty level-2 heading | Level 3, rich text/sidecars; edit `text` | Alignment relocation remains a separate behavior; level/tag is implemented in this slice. |
| List / 2 | One empty unordered item | Ordered pair with marks/sidecars; edit `item:first` | Implemented: v1 string array; fixed content/order plus current item IDs and item DOM. |
| Quote / 1 | Empty quotation and caption | Rich quotation/Mention and independent rich caption/Color; edit `text` | Implemented: fields share the wire shape; caption data, DOM and output survive the sibling edit. |
| Code / 1 | Empty source, `auto` language | Literal multiline HTML-like source, explicit language; edit `code` | Implemented: textarea, literal renderer output, language and native history; no fabricated rich-text sidecars. |
| Image / 1 | Empty file URL/caption, false flags, empty styles | Local decoded PNG, literal rich caption, fixed appearance; edit `caption` | Implemented: empty source has authoring N/A; populated native caption history and renderer preserved. Widget-caption defect remains separate. |
| Delimiter / 1 | Empty object | The same data-free separator between Paragraphs | Implemented: actual default has authoring phases N/A; a separately named real neighbor edit proves history preservation. |
| Table / 2 | One empty cell with row/cell IDs | Rectangular rich cell matrix, headings; edit a declared cell | v1 `content: string[][]`; current identified rows/cells. Default size difference remains unresolved. |
| Checklist / 2 | One empty unchecked item | Checked/unchecked pair, marks/sidecars; edit first label | Implemented: v1 item IDs absent; label, checkbox state and independent row/control identities are checked. |
| Warning / 1 | Empty title and message | Rich title/Mention and independent rich message/Color; edit `title` | Implemented: both canonical fields and renderer slots are checked; message survives the sibling edit. |
| Embed / 1 | Empty service/video/caption/metadata | Controlled service/video with local cover, rich caption | Disable or inject documented metadata provider; caption exists only for a valid embed. |
| Raw / 1 | Empty HTML source | Safe multiline authored HTML; edit `html` source | Source field is plain text; preview confinement/navigation remain separate rows. |
| Gallery / 2 | No images, auto layout, declared viewer defaults | Two local images, captions, layout/options; edit first caption | v1 image IDs absent; no fabricated caption on an empty gallery. |
| Carousel / 1 | No slides, autoplay off | Identified local slides/captions, deterministic controls | IDs already exist in v1; no external media playback/provider assumptions. |
| Attaches / 2 | No files, variant `f` | Controlled file URL/name/size/extension; edit filename | v1 file IDs absent; name is plain text. |
| LinkPreview / 1 | Empty metadata, `notion` template | Controlled URL and populated metadata; edit declared URL | URL field disclosure and metadata replacement need the documented provider contract. |
| Toggle / 1 | Empty title/content, closed | Rich title/Mention and content/Color, explicit open/closed state; edit title | Implemented: both fields, hidden populated content, open state, accessibility relationship and renderer structure survive mode/history. |
| Columns / 2 | Two empty columns, `1-1` layout | Fixed `1-2` rich columns with independent widgets; edit first column | Implemented: v1 column IDs absent; current IDs, both fields/order, grid/layout controls and renderer columns are checked. |
| Spoiler / 1 | Empty label/content | Rich label/Mention and content/Color; edit label | Implemented: both fields and transient open/hidden presentation survive mode/history; renderer keeps an empty label and omits an empty body. |
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
pointer focus and native field input where a field exists, then exact
one-step Undo/Redo. Delimiter and empty-source Image cases expose their
explicit non-editable or neighboring-field phase scope as described above. The fixture
checks marks, sidecars, IDs/order, logical caret, DOM reuse, renderer input
immutability, disposal and release of newly acquired owned styles. No
private editor transaction or compatibility implementation is invoked.

Errors retain completed and incomplete phases. In particular, a baseline
that throws while switching mode does not receive credit for the remaining
history or disposal assertions. Known historical defects, if classified,
remain visible as raw failures with exact source/scenario/property checks;
unrelated candidate or baseline failures must remain fatal.

The Paragraph, Heading, List, Quote, Warning, Code, Checklist, Delimiter, Image, Toggle, Spoiler and Columns oracle
classifies only these observed historical differences, bounded to the thirty-four exact scenario IDs in the
runner:

- v1 remounts the exact block/widget arrays, List items, Quote/Warning/Toggle/Spoiler fields, Columns fields, Code textarea and
  Checklist rows/buttons/labels, Delimiter HR and Image wrapper/picture/caption
  during read-only/editable mode
  changes and Undo/Redo. Default Delimiter and empty-source Image admit only
  their two executed mode phases; their populated cases admit the two mode
  and two history phases.
  No caret exception applies to Delimiter; no widget exception applies to
  either Delimiter or literal-caption Image. Author data and sidecars
  must still be exact.
- The first v1 Undo in each rich-field block's populated cases focuses the preceding
  `prefix` Paragraph, with both native points in text `Before` at offset 6.
  The required `probe` caret is offset 14 for Paragraph/Heading/List/Checklist and
  offset 12 for Quote/Warning/Toggle/Spoiler/Columns. Populated literal-caption Image has the same
  exact prefix-owner defect, with required probe offset 18. The full active/anchor/focus
  ownership snapshot must match before this difference can be classified.
- The first v1 Undo in the default List focuses its empty LI, while both
  native selection points are on that same block's UL at child offset 1.
  The classification binds all three owners to the actual generated default
  block ID and requires this exact LI/UL shape. Current selection must be
  inside the declared LI at offset 0. The v1 source chooses the block's UL
  when its block-level caret fallback cannot find a text node.
- The first v1 Undo in the default Quote focuses its empty BLOCKQUOTE text
  field, while both native selection points are on the same block's DIV
  wrapper at child offset 2. This classification also binds all owners to
  the actual generated block ID. Current selection must be inside the
  declared text field at offset 0.
- The first v1 Undo in the default Warning focuses its empty title DIV,
  while both native points are on the same block's outer DIV at child
  offset 2. The exact title class and actual generated block ID are required
  for this classification; current selection must be inside the declared
  title field at offset 0.
- The first v1 Undo in the default Toggle focuses its empty title DIV,
  while both native points are on that block's outer DIV at child offset 2.
  Classification requires the exact title class and actual generated block
  ID. Current selection must be inside the declared title at offset 0.
- The first v1 Undo in the default Spoiler focuses its empty label DIV,
  while both native points are on that block's outer DIV at child offset 2.
  Classification requires the exact label class and actual generated block
  ID. Current selection must be inside the declared label at offset 0.
- The first v1 Undo in default Columns focuses its first empty column DIV,
  while both native points are on that block's outer DIV at child offset 2.
  Classification requires the exact column class and actual generated block
  ID. Current selection must be inside the declared first column at offset 0.
- The first v1 Undo in the default Checklist focuses its empty label DIV,
  while both native points are on the same block's outer DIV at child
  offset 1. Classification requires the exact label class and actual
  generated block ID. Current selection must be inside the declared label
  at offset 0.
- The first v1 Undo in populated Code focuses that same exact prefix
  Paragraph, while the recreated textarea retains its selection at offset
  61 without focus. After Redo, both Code cases focus their textarea but
  reset its selection to offset 0 instead of 1 (default) or 62 (populated).
  The document selection remains on the same Code block's trailing preview
  newline at offset 1. Classifications require these exact values, textarea
  class and owners, binding the default owner to its generated ID. v1's
  `SelectionManager` restores a DOM Range in block contents rather than a
  textarea selection. Both later sources must restore the textarea caret.
- e981 throws `Inline widget root left its projection boundary before
  hydration` while entering read-only mode in each formatted-widget case,
  including both the open and closed populated Toggle cases.
  Only `load` completed; read-only, return to editing, edit, Undo, Redo and
  disposal assertions remain explicitly unexecuted. The unwrapped positive
  controls exercise the complete template on that baseline.

The candidate receives none of these exceptions. Raw failures remain in
the JSON alongside classifications. `incompleteCases` lists every partial
scenario even when its precise historical cause is known. Exit zero means
there is no unexpected failure; it does not relabel incomplete baseline
phases as passes.

This page does not by itself accept full Paragraph, Heading, List, Quote, Warning, Code, Checklist, Delimiter, Image, Toggle, Spoiler or Columns behavior,
the other 9 built-ins, hostile HTML/class confinement, all renderers,
platform breadth or full editor parity.
