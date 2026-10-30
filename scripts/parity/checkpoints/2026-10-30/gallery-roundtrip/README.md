# Gallery public ROUNDTRIP evidence — 2026-10-30

This checkpoint adds Gallery to the existing shared public ROUNDTRIP template.
It does not modify the preservation ledger or accept other Gallery behavior rows.

Production source is the published commit
`4bfb39426744bc0a96725258c06dc9192b58098b`. No production defect was reproduced
in this bounded task, and no core, plugin, renderer or shared runtime file was
changed. The initial differential exit 1 records actual historical differences
before recognition; it is **not** a claim of a new candidate regression or a
production RED-to-GREEN repair. Candidate native controls passed from the first
literal-only iteration.

## Public cases and independent expectations

Four cases are appended to the shared fixture:

- Actual default Gallery: an empty images array and documented default options.
  It has no fabricated caption field; edit/Undo/Redo are explicitly N/A.
- Populated literal captions: two fixed local one-pixel images, stable current
  image IDs, entities, literal markup text and an unowned `{{literal}}` token.
- Populated rich captions with real Mention/Color sidecars beneath formatting
  wrappers, distributed across the two independent captions.
- The corresponding unwrapped widget control.

The populated cases use the public fixed two-image layout, fixed presentation
styles and nondefault options. Each has independently specified Paragraph
neighbors. Checks cover fixed canonical author data and meaningful ID/order,
all caption fields and alternative text, marks/sidecars, declared-field focus,
read-only and editable-again modes, one trusted native edit and exactly one
keyboard Undo/Redo, caret/focus, and exact original/edited saved records.

Renderer checks inspect three surfaces: a detached `render()` result, that same
result after attachment, and `renderTo()`. Gallery represents captions as image
alternative text and accessible names; it intentionally does not display inline
widget DOM in the grid. Expected labels come from the fixed caption values and
known real widget labels, while output must contain no stray widget elements.
The local images are decoded and checked as 1 by 1 pixels. Input records and
sidecars remain unchanged, and the Mention provider is never invoked.

Gallery recreates mode-specific presentation fields. The test permits that
existing contract while checking that current fields remain connected and old
fields are disconnected. It dispatches retained old caption input/blur and
clicks retired removal controls, then checks unchanged canonical data, history
and current fields. A native text edit must retain both current caption hosts.
Block/wrapper identity, widget lifetime, renderer disposal, editor disposal and
owned stylesheet release are also checked.

## Historical wire boundary

The pinned v1 reference is `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.
Its Gallery has `inlineTools = false`, no `mapTextFields` hook, unkeyed images,
and plain `textContent` captions. Its abstract base declares no rich-field hook
that would enable persistent caption widgets. The fixture explicitly supplies
fixed equivalent plain caption strings and omits image IDs only for this
historical wire. It does not decode through or call production helpers.

Rich formatting and persistent Gallery widgets are current capabilities. Both
v1 widget reference cases are marked unsupported; they do not prove historical
support. Their literal visible caption text and native authoring are still run.
The spec baseline is `e981ff308000c1d92d7e820df95113c1e19bcee8`.

## Recorded results

| Check | Result | Original C11 run |
| --- | --- | --- |
| All shared cases, three pinned sources, Chrome 156 | 57 cases per source; candidate 9,832/9,832 PASS | `run-fFA7Pt` |
| All shared native cases, Chrome 156 | 57/57 PASS | `run-EJFGkt` |
| Gallery native cases, Chrome 142 | 4/4 PASS | `run-Sw4PUG` |
| Both TypeScript configurations | PASS | `run-90JTKd` |
| Historical classifier sensitivity | PASS | `run-uaE5sW` |

Gallery alone has 703 candidate observations, all PASS. Its v1 reference has
670 observations and 103 raw failures. Its spec baseline has 349 observations
and 36 failure records: 34 FAIL observations plus two execution ERROR records.
Both baseline rich cases stop after load with the captured projection-boundary
error; their six remaining phases are explicitly incomplete.

The full 57-case v1 result retains 884 raw FAIL observations. The full baseline
retains 98 raw FAIL observations, 17 execution ERROR records and 17 incomplete
cases. Its one previously recorded Embed page error remains classified by the
existing Embed recognizer. Gallery produces no page errors. All sources have
zero unexpected failures after exact historical classification; candidate has
zero raw failures, errors, incomplete cases or exceptions.

The new Gallery recognizer matches 139 recorded historical failure records,
including remount/caret, unsupported sidecars/widgets, old caption labels,
focus-result acknowledgment and the two baseline mode failures. It requires
exact source/case, phase sequence, independent author records, actual/expected
values and relevant selection ownership. It never accepts candidate sources.
Offline controls reject 2,644 altered inputs and all 1,585 captured PASS
observations. These are recognizer sensitivity checks, not browser behavior
tests or changes to the raw results.

## Provenance and replay

`source-fingerprints.json` records exact test source hashes, production and
historical commits, dependency versions, local dependency realpath, browser
versions, commands, source identities and all final outcome counts. Original
C11 manifests are copied without modification. Every compressed log decodes to
its original bytes. `initial-evidence-index.json` indexes the initial records;
`source-fingerprints.json` indexes the final records; `artifact-hashes.json`
covers stored checkpoint artifacts.

`initial-fixture.patch.gz` is the four-case fixture used by the unclassified
Gallery differential and the first four-case native run. Earlier literal-only
iteration logs and their C11 source hashes are retained as exploratory records;
they are not the input to the final historical classifier. The raw input for
`classifier-sensitivity.mjs` is `gallery-initial-unclassified.log.gz`.

The isolated checkout owns a real `node_modules` directory; it does not share a
Vite cache with another worktree. `detached-runner.py` records the launcher used
to preserve subprocess completion across user turns. It is task-local replay
material; update its paths for a different checkout before reuse.

After applying the scoped fixture/runner/classifier patch to the production
base, run the shared differential with `EDITOR_V1_ROOT`,
`EDITOR_SPEC_BASELINE_ROOT`, `EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH` set
to the paths recorded in the fingerprints. Set `EDITOR_ROUNDTRIP_FILTER` to
`BLOCK_GALLERY_ROUNDTRIP` for just these four cases, or leave it empty for all 57.
For native execution use `EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html`
and the corresponding `EDITOR_NATIVE_FILTER`. The standalone sensitivity
command is `node scripts/parity/checkpoints/2026-10-30/gallery-roundtrip/classifier-sensitivity.mjs`.

This fixed-layout template does not accept detailed source/upload, layout,
Masonry, drag/reorder, lightbox, settings or design behavior. Those rows and the
overall v1 functional parity decision remain separate.
