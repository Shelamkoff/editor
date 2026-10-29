# Built-in block ROUNDTRIP investigation

This is the implementation inventory and reproduction guide for the
`ROUNDTRIP` template in the functional preservation register. It does not
accept any detailed block-action row. An inventory entry is not evidence
that its browser scenario has run.

The implemented rich-field slices are Paragraph, Heading, List, Quote, Warning, Checklist, Spoiler, Columns and Table, each with
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

Raw adds two plain-text textarea cases: its actual empty default and a fixed
multiline HTML source containing entities and token-looking literal text.
Canonical `html` and textarea value remain exact strings; only the renderer's
separate authored output is compared as parsed benign markup. All three
renderer contexts retain that markup. Read-only mode exposes the existing
sandboxed preview with its exact benign `srcdoc`, title and control
relationship. Returning to editing can retain transient preview state;
when the source is hidden, the fixture activates the actual Preview button
and requires a visible pointer-targetable textarea before native input.
Textarea identity, selection and exact one-step Undo/Redo are checked for
both cases. This does not accept Tab indentation, hostile HTML, frame sizing,
themes, media, downloads or navigation/confinement policy. Those remain
separate source, preview and HTML-boundary rows.

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

Image has a real empty-source default, a populated local PNG with a literal
rich caption, and two additional widget-caption controls with Mention and
Color inside and outside authored formatting. The valid one-pixel image decodes in both the editor
and mounted renderer; no uploader or remote provider is invoked. Fixed
file dimensions, appearance flags and benign CSS values remain canonical;
editor and detached/attached/mounted output preserve caption marks,
alternative text, media URL, dimensions and presentation. A native CSSOM
control distinguishes authored `object-position: center` from its
serialized `center center` and computed `50% 50%`; canonical data retains
the original authored value. Native input and one Undo/Redo operate on the
populated caption. The empty-source image declares no caption field, so
its authoring/history phases are explicitly N/A. The original literal case
still has no inline sidecars. The two new cases retain the exact image data,
styles and neighbors while exercising actual caption widgets through load,
both mode transitions, native caption input and one Undo/Redo. Visible
labels, derived alternative text, canonical marks and sidecars, widget and
Image DOM identity, and exact native range must all survive. Expected label
text comes from the fixed `@Ada` and `#123456` fixture values, independent
of Rector's projection or parser implementation.

Pinned v1 Image has no `mapTextFields` hook, including in its abstract base;
its public inline insertion gate rejects such blocks. The two widget cases
therefore record unsupported reference capability explicitly. They do not
silently remove input sidecars or claim v1 widget parity. The existing
literal controls remain separate. The new roundtrips exercise the accepted
field-completion hook's visible result, but do not replace its independent
pre-commit, native no-op, sidecar-update, ownership and cancellation tests.
Upload/source actions, hostile styles and the full appearance/settings
matrix remain separate detailed behavior rows.

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

Attaches adds an actual no-file default and a fixed two-file document in
variant `f`. File URLs, IDs, order, sizes and extensions are independent
literal expectations. Names include literal `<`, `>`, `&` and token-looking
characters; they remain plain text in the editor's declared DIV fields,
canonical records and all three renderer contexts. Renderer anchors retain
exact href/download values, tags and formatted sizes. The empty default
has no invented filename or native authoring/history phase. Populated
native input and exact one-step Undo/Redo edit only the first filename;
the second file and both neighboring Paragraphs remain unchanged.

Attaches deliberately rebuilds its mode-specific controls. The fixture
requires stable instance/block wrappers across mode changes, exact new
public `file:<id>:name` addresses, and rejection of read-only focus without
moving an independent host control. Retired filename hosts and the original
remove button must be detached and unable to change canonical data or
history, including after editing is enabled again. Filename field identity
is required during native input and Undo/Redo while file structure stays
unchanged; it is not required across those intentional mode rebuilds.
Actual downloads, upload/ZIP actions, variant activation, providers and
native editing of the second filename remain separate detailed rows.

Embed adds four cases: its actual empty default, a configured literal rich
caption, a configured caption containing Mention and Color inside formatting,
and an unwrapped-widget control. All populated cases use Vimeo with the
existing `resolvePreview: false` configuration, a local one-pixel PNG cover,
and fixed title/duration metadata. The empty default has a URL input but no
declared rich caption; only that case records caption authoring, Undo and
Redo as not applicable. URL configuration, playback and provider actions
remain separate behavior rows.

Populated Embed cases perform trusted native caption insertion and exact
one-step Undo/Redo. Canonical marks, actual sidecars, neighboring Paragraphs,
block IDs and order remain independent fixed expectations. Both the editor
and all three renderer contexts check caption markup and actual widgets;
preview URL, alternative text, title, duration, decoded local cover and the
absence of an activated iframe are also checked. The wrapper stays stable;
caption identity is required during load, mode changes and native input.
For a genuinely changed caption during Undo/Redo, the existing update
contract permits either the same connected host or a fully detached old
host. In the latter case stale input/blur on that predecessor must preserve
exact canonical records, history, the current field and active/native
selection nodes and offsets. Current caption text, actual widgets and
expected native caret/history remain strict. Player controls intentionally
rebuild, so the fixture does not invent a player-subtree identity requirement.
The first diagnostic oracle incorrectly required caption identity even for
changed Redo content; its three candidate failures are recorded as an
invalid oracle attempt, not as a production regression or an accepted
candidate exception. `plugins/embed/reconciliation.test.js` already
requires a fresh authoring host for externally changed caption content.

The v1 Embed class does not declare `mapTextFields`. Its `core/types.d.ts`
and extension guide require that hook for persistent inline widgets, and
`EditorFacade.insertInlinePlugin()` rejects a block without it. The v1
README does not advertise caption widgets. Therefore the default/literal
cases establish meaningful v1 parity, while the two widget-caption cases
preserve a current capability and explicitly report unsupported v1 reference
coverage. Their inputs keep the real sidecars and all raw failures; no
adapter removes them. The renderer checks consume saved records, so missing
v1 output widgets here are downstream of the saved sidecar omission and do
not constitute an independent intact-input renderer test.

The shared settlement helper waits for finite animations and transitions.
It excludes only animations whose computed end time is `Infinity`; it does
not cancel animations, disable CSS, or accept a timeout as success. An actual
three-source diagnostic observed `oe-embed-pulse` still running after three
seconds with infinite iterations/end time while the adjacent finite
transition had finished. That was a harness wait failure, separate from
production parity. The local-cover readiness bound also rejects on timeout;
cover dimensions and all authoring/history assertions remain required.

Table uses its actual empty 3-by-3 default and a fixed 2-by-2 document
with a heading row. Mention lives in the first header cell and Color in the
last body cell; the other header and body retain independent `mark` and
canonical `i` formatting plus a literal ampersand. The unwrapped control
keeps both real widgets outside formatting. Native input edits only the
first declared TD/TH, while every other cell, row order, headings flag,
sidecar and neighboring Paragraph must remain unchanged through mode and
one-step Undo/Redo. Current row/cell IDs are checked in data and actual DOM,
including the same cell IDs in distinct row namespaces. Wrapper, table,
rows and cell identities are independent observations. All three renderer
contexts require TABLE/THEAD/TBODY/TR/TH/TD structure and authored cell
contents. Row/column actions, heading toggles, Table paste, multi-cell
selection, Tab/Enter behavior and separately typing into sibling cells
remain separate behavior rows.

The initial exploratory Table fixture incorrectly expected unsupported `u`
to survive; both historical/current sanitizers omit that tag. A second
probe used the allowed `em` alias but compared its spelling literally,
where the current rich-text codec canonicalizes it to `i`. Both traces are
retained as invalid fixture expectations, not production RED evidence.
The corrected fixed fixture uses `i`; neither sanitizer policy nor the
shared markup oracle is changed to admit those earlier failures.

Poll adds four cases: the actual two-option empty default, a populated rich
question and two options with fixed local results, wrapped and unwrapped
persistent-widget controls, and an explicit populated literal control. The
literal/default cases execute meaningful v1 comparisons. v1 Poll and its
abstract base do not implement `mapTextFields`, so its public inline insertion
gate cannot support the two widget cases; those remain labeled current
capability evidence with every raw historical difference preserved.

The populated Poll uses stable option IDs, multiple choice, a fixed ballot
count and a selected second answer. Editor fields, readable result labels,
author formatting and 67%/33% result percentages are independent expectations.
All three renderer contexts preserve the question, option marks, marker type,
selection and submit state. Native input and one-step Undo/Redo edit only the
question; independent native regressions also exercise an option with actual
widgets. Mode/history may rebuild Poll author hosts, so each predecessor must
be either the same live field or fully detached, and retired input/blur must
leave canonical data and history unchanged. Runtime-only result replacement
keeps completed fields; no extra persistent widget is invented in a label.
The v1 empty default generates option IDs: only those two nonempty unique
identities are captured, while their count, content, order and all later
records remain fixed. Voting, live sources, revision ordering and detailed
option controls remain separate rows.

LinkPreview adds its real empty `notion` default and a populated `horizontal`
card with fixed URL, image/favicon and literal metadata containing HTML-like
and token-looking text. Metadata stays plain text with zero child elements;
no sidecars are invented. The declared URL INPUT remains readonly or editable
with its mode, while editor and detached/attached/mounted cards retain their
URLs, metadata and media. Real native input changes the URL and clears the old
metadata; the existing 500ms submission is allowed to settle before observing
the card. One native Undo/Redo restores exact canonical records, input value,
card and caret. No metadata provider is configured for this basic roundtrip.
Separate native controls verify read-only input, retired timers, and external
metadata abort callbacks that author a successor URL. Templates, provider
history continuation and arbitrary URL-policy inputs retain separate rows.

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
fixed column IDs without changing layout or authored contents. v1 Attaches
receives the same file names, URLs, sizes, extensions and order without
current file IDs; filename text is never parsed as rich markup.
v1 Table receives the identical rectangular text matrix as `content: string[][]`
with the same `withHeadings`; the current form adds fixed row/cell IDs. The
adapter does not invent v1 identities or infer expected cells from a save.
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
| Image / 1 | Empty file URL/caption, false flags, empty styles | Local decoded PNG, literal and wrapped/unwrapped widget captions, fixed appearance; edit `caption` | Implemented: empty source has authoring N/A; three populated caption controls preserve actual supported sidecars, labels, history and renderer output. v1 widget capability is explicitly unsupported. |
| Delimiter / 1 | Empty object | The same data-free separator between Paragraphs | Implemented: actual default has authoring phases N/A; a separately named real neighbor edit proves history preservation. |
| Table / 2 | Empty 3-by-3 grid with row/cell IDs | Rectangular rich cell matrix, headings; edit a declared cell | Implemented: v1 `content: string[][]`; fixed current rows/cells, headings, all field/renderer slots, native first-cell history and independent identities. The separate default repair preserves explicit 1-by-1 data. |
| Checklist / 2 | One empty unchecked item | Checked/unchecked pair, marks/sidecars; edit first label | Implemented: v1 item IDs absent; label, checkbox state and independent row/control identities are checked. |
| Warning / 1 | Empty title and message | Rich title/Mention and independent rich message/Color; edit `title` | Implemented: both canonical fields and renderer slots are checked; message survives the sibling edit. |
| Embed / 1 | Empty service/video/caption/metadata | Fixed Vimeo/local cover; literal and current widget captions | Implemented: actual empty default, native caption history, actual widgets and retired-host controls. v1 persistent caption widgets are unsupported reference evidence. |
| Raw / 1 | Empty HTML source | Literal multiline authored HTML/entities; edit `html` source | Implemented: exact textarea source, benign rendered markup, existing preview disclosure and native history. HTML confinement/navigation remain separate rows. |
| Gallery / 2 | No images, auto layout, declared viewer defaults | Two local images, captions, layout/options; edit first caption | v1 image IDs absent; no fabricated caption on an empty gallery. |
| Carousel / 1 | No slides, autoplay off | Identified local slides/captions, deterministic controls | IDs already exist in v1; no external media playback/provider assumptions. |
| Attaches / 2 | No files, variant `f` | Two controlled file URLs, literal names, size/extension; edit first filename | Implemented: v1 file IDs absent; plain text, current keyed focus, retired mode controls, native history and renderer anchors are checked. |
| LinkPreview / 1 | Empty metadata, `notion` template | Controlled URL and populated literal metadata; edit declared URL | Implemented: real native input, metadata clearing, visible card, plain metadata, URL caret and exact Undo/Redo; no provider request. |
| Toggle / 1 | Empty title/content, closed | Rich title/Mention and content/Color, explicit open/closed state; edit title | Implemented: both fields, hidden populated content, open state, accessibility relationship and renderer structure survive mode/history. |
| Columns / 2 | Two empty columns, `1-1` layout | Fixed `1-2` rich columns with independent widgets; edit first column | Implemented: v1 column IDs absent; current IDs, both fields/order, grid/layout controls and renderer columns are checked. |
| Spoiler / 1 | Empty label/content | Rich label/Mention and content/Color; edit label | Implemented: both fields and transient open/hidden presentation survive mode/history; renderer keeps an empty label and omits an empty body. |
| Poll / 1 | Single choice, two empty options, always-visible results | Identified rich choices/question, literal and widget controls, fixed local results; edit question | Implemented: fixed results/IDs/marks, readable derived labels, native history and retired-host controls; v1 persistent widgets are explicitly unsupported. |
| Person / 2 | One empty profile and no links | Rich profile fields, local avatar and identified link | v1 profile/link IDs absent; hidden fields and empty draft filtering need explicit controls. |

The existing `tests/browser/roundtrip.js` is a useful current-format smoke
and save/reload check. It does not replace this template's native history,
mode, sidecar, rendering and three-source requirements.

### Default Table investigation

v1 `plugins/table/index.js` constructs a 3-by-3 grid when no content is
supplied, and its README explicitly documents that default. At the initial
investigation, the candidate README and schema instead specified a 1-by-1
empty grid. `git blame` attributes that earlier schema default to
`fab6eb36d92cc6583bcb39d49f9503b3be3a5db6` (`feat: add table stable-id
schema`). This was a behavioral difference rather than an ID-only change.
The separate default repair in `e1790dce` restores no-data 3-by-3
construction, retaining explicit 1-by-1 and 3-by-3 data and the existing
one-cell text conversion. Its targeted tests alone do not accept the
full Table ROUNDTRIP template. The later Table slice above executes that
template separately; detailed structural actions retain their own rows.

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
one-step Undo/Redo. Delimiter, empty-source Image, no-file Attaches and unconfigured Embed cases
expose their explicit non-editable or neighboring-field phase scope as described above. The fixture
checks marks, sidecars, IDs/order, logical caret, DOM reuse, renderer input
immutability, disposal and release of newly acquired owned styles. No
private editor transaction or compatibility implementation is invoked.

Errors retain completed and incomplete phases. In particular, a baseline
that throws while switching mode does not receive credit for the remaining
history or disposal assertions. Known historical defects, if classified,
remain visible as raw failures with exact source/scenario/property checks;
unrelated candidate or baseline failures must remain fatal.

The Paragraph, Heading, List, Quote, Warning, Code, Checklist, Delimiter, Image, Toggle, Spoiler, Columns, Attaches, Raw, Embed, Table, Poll and LinkPreview oracle
classifies only observed historical differences or unsupported reference
capability, bounded to the fifty-three exact scenario IDs in the runner. The
separate LinkPreview/Poll classifier is hashed before/after each execution,
binds all phase records to fixed author data and accepts no candidate
exceptions. Its offline sensitivity checkpoint rejects changed sources,
values, phases, identities, owners and unrelated errors. Existing historical
observations include:

- v1 remounts the exact block/widget arrays, List items, Quote/Warning/Toggle/Spoiler fields, Columns fields, Code/Raw textareas and
  Checklist rows/buttons/labels, Delimiter HR, Image wrapper/picture/caption
  and Attaches wrapper during read-only/editable mode
  changes and Undo/Redo. Default Delimiter, empty-source Image and no-file
  Attaches admit only their two executed mode phases; their populated cases
  admit the two mode and two history phases. Attaches filename remount
  differences apply only to populated Undo/Redo, since mode rebuilds are
  explicit and separately checked for retirement.
  No caret exception applies to Delimiter; no widget exception applies to
  Delimiter, literal-caption Image, plain-text Attaches or Raw. Author data and sidecars
  must still be exact.
- The first v1 Undo in each rich-field block's populated cases focuses the preceding
  `prefix` Paragraph, with both native points in text `Before` at offset 6.
  The required `probe` caret is offset 14 for Paragraph/Heading/List/Checklist and
  offset 12 for Quote/Warning/Toggle/Spoiler/Columns. Populated literal-caption Image has the same
  exact prefix-owner defect, with required probe offset 18; Image's separate
  widget controls require offset 14. Populated
  Attaches requires filename offset 26. The full active/anchor/focus
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
- The first v1 Undo in populated Raw retains textarea offset 83 but focuses
  the exact prefix Paragraph (`Before`, offset 6). Both Raw Redo cases focus
  their textarea at offset 0 instead of 1 (default) or 84 (populated).
  The native DOM Range points to that same Raw block's `Preview` text at
  offset 7. Classification requires the exact textarea class, full owner
  snapshot and all seven completed phases; default ownership is bound to
  the actual generated block ID. The v1 history code restores a block DOM
  Range rather than the textarea's selection. e981 and the candidate have
  no Raw exceptions and must retain the correct source caret.
- e981 reports `false` from public keyed focus for each populated Attaches
  filename even though the exact requested DIV becomes active. The
  classification requires only this scenario, the `edit` phase, the two
  exact address properties and `{ accepted: false, active: true }`, with
  all phases completed. Its `focusin` handler calls `setCurrent` during
  plugin focus and therefore invalidates the older request's claim. The
  existing same-occurrence native-acknowledgment repair in `0a535f75149606fa`
  corrects this behavior; the candidate must return true and focus the
  declared field. This is not a generic exception for rejected focus.
- e981 throws `Inline widget root left its projection boundary before
  hydration` while entering read-only mode in each formatted-widget case,
  including both the open and closed populated Toggle cases.
  Only `load` completed; read-only, return to editing, edit, Undo, Redo and
  disposal assertions remain explicitly unexecuted. The unwrapped controls
  execute the complete template on that baseline; the separate Embed Redo
  failure is recorded below.

- Embed has a separate classifier limited to its four exact IDs. v1 block
  and wrapper remounts are recorded at the two mode transitions and, where
  applicable, Undo/Redo. Caption identity is required at unchanged mode
  transitions; changed history fields instead execute the retirement
  controls described above. The empty v1 Embed also moves independent host
  focus to its URL input when editing resumes; classification binds the
  INPUT and both empty DIV selection points at offset 1 to the generated
  default block ID.
- The two v1 Embed widget-caption cases are **unsupported reference
  capability**, not repaired widget defects or successful v1 widget parity.
  In all six content phases, the saved record omits the exact Mention/Color
  sidecars and both editor and the three saved-record renderer contexts
  contain no actual widgets. The complete expected/actual records and exact
  widget arrays are matched without changing the browser input or results.
  Literal tokens give caret offsets 33/34 instead of logical widget offsets
  14/15. The classifier requires these exact offsets, caption owners and
  actual wrapped/unwrapped text-node endpoints. First Undo in the populated
  widget and literal controls has the same independently observed prefix
  focus defect, with required caption offsets 14 and 18 respectively.
- The specification baseline's wrapped Embed case fails at the same exact
  formatted-widget read-only boundary; only `load` completes. Its unwrapped
  control completes all seven phases but Redo retains the Undo document and
  history state. This is bounded to that one ID and phase, the exact original
  and edited complete records (including media metadata and sidecars), the
  captured active caption and text ` tail` at offset 5, and eleven exact
  canonical/renderer/history/identity/selection failure pairs. It is not a
  generic allowance for content loss or failed Undo/Redo. Literal caption
  and default cases pass that baseline without exceptions.

- Image's two widget-caption controls have a separate classifier with fixed
  complete Image records, local PNG metadata, appearance data and decoded
  label expectations. All six content phases, exact mode values and exact
  history states must match before a v1 difference is recognized; all seven
  phases must complete. The 114 unsupported-capability observations retain
  exact missing sidecars/widgets, token-based alternative text and literal
  caret offsets 33/34 instead of 14/15. Caret classifications additionally
  require the exact wrapped/unwrapped text node and caption owner. The
  sixteen three-node block/Image remount observations and two first-Undo
  prefix-focus observations are separately recorded historical defects.
- The specification baseline's wrapped Image control completes only load,
  then throws the exact known formatted-widget ownership error during the
  read-only transition. Its load alternative text still contains tokens.
  The unwrapped control completes all seven phases; only the five observed
  load/mode/Undo/Redo alternative-text pairs are classified. Native editing
  already updates its alternative text and receives no exception. These
  six alternative-text observations require full fixed media/style objects
  and exact canonical/history records; missing media, lost sidecars or
  other data changes are not accepted. The remaining wrapped phases stay
  explicitly incomplete. Candidate failures receive no exception.

- Table has a separate classifier limited to its three exact IDs. v1
  remounts exactly one/three block shells and fourteen/eight Table nodes for
  default/populated cases, plus exactly two populated widget roots, at the
  two mode and two history transitions. Its default first Undo focuses the
  actual generated block's first TD while both selection points remain on
  that same empty DIV wrapper at child offset 1. Populated first Undo has
  the exact prefix Paragraph focus defect, with required first-cell offset
  12. All seven phases must have completed for these classifications.
- The specification baseline retains its pre-repair 1-by-1 Table default.
  Its six content phases must have the exact corresponding complete
  canonical records, with only the first cell changing to `X` at edit/redo.
  The six admitted property pairs compare that exact 1-by-1 data, fields,
  DOM IDs and three renderer structures with the fixed 3-by-3 expectation;
  arbitrary missing rows/content are not allowed. Its formatted populated
  case stops after load at the exact known inline mode hydration failure.
  The unwrapped populated control receives no exception and completes the
  full template.

The runner also records uncaught browser errors in two independent raw
channels: Playwright's page-error stack and a synchronous `window.error`
observation carrying source, case ID, phase, name, message and stack. Neither
channel suppresses the browser event. The only classified page error is the
observed specification-baseline unwrapped Embed Redo: exactly one matching
pair, its fixed complete ten-frame stack (only the local server origin
varies), and all eleven unique exact Redo failure signatures with completed
phases and canonical/history/selection records. The pairing occurs after
all source pages close. Current errors, duplicates, unpaired reports and
any other source, case, phase, message, stack or failure signature remain
fatal. The raw error arrays stay present alongside classified and unexpected
error records.

The candidate receives none of these exceptions. Raw failures remain in
the JSON alongside classifications. `unsupportedReferenceCases` explicitly
lists the two v1 Embed and two v1 Image widget controls and does not grant v1 capability
coverage. `incompleteCases` lists every partial
scenario even when its precise historical cause is known. Exit zero means
there is no unexpected failure; it does not relabel incomplete baseline
phases as passes.

This page does not by itself accept full Paragraph, Heading, List, Quote, Warning, Code, Checklist, Delimiter, Image, Toggle, Spoiler, Columns, Attaches, Raw, Embed or Table behavior,
the other 5 built-ins, hostile HTML/class confinement, all renderers,
platform breadth or full editor parity.
