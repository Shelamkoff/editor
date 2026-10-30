# Gallery renderer image lifetime and viewer text — 2026-10-30

This checkpoint covers two independent repairs. It does not accept the complete
Gallery layout/viewer preservation rows, other engines, trusted input, CSP,
download/fullscreen/zoom behavior or whole-library parity.

## Source and environment

- Starting branch source: `355577fc`.
- Image notification repair and fixture: `504c8029`.
- Viewer caption repair and final fixture: `0e2c034f`.
- Pinned reference sources: v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`
  and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`.
- Linux x64, Node `24.22.1`, Chromium `156.0.8078.79`.

The manifest records full commit identities and SHA-256 hashes of compressed and
decoded evidence. These are isolated source commits; a later integration commit
has its own tree and must identify its own checks.

## Image notification repair

Previously, retained `load`/`error` listeners and cached-image microtasks kept
reading retired image geometry and changed the former root's layout after
`renderBlock`, `render`, `renderTo` disposal or `renderTo` replacement. The repair
registers those listeners in the Gallery's existing resource set, removes both
listeners at settlement/disposal and checks the exact live owner before queued
work runs. The current output still refines its automatic layout; duplicate
notifications settle an image only once.

The final RED uses the committed `504c8029` test files with only
`renderer/renderers/gallery/index.js` replaced by its `355577fc` bytes. The
unchanged production baseline fails **10 of 164** assertions, all in the new
lifetime controls: five retired outputs each still perform nine image geometry
reads and change `eg--3a` to `eg--3c`. The original production bytes were restored
automatically after the control. The repaired affected page passes **164/164**.

This fixture uses genuine browser elements. Network-style `load` and `error`
notifications are delivered at controlled boundaries; they are not claimed as
trusted browser input. A separate cached-image control first decodes the real
local image, verifies the subsequently created images are complete, destroys
their output synchronously and then releases the queued microtasks.

Both typecheck projects pass. The privileged Renderer unit command passes
**156/156** individual cases, no skips. These are independent scoped commands;
their totals are not combined with the browser assertions.

## Viewer text repair

The existing grid alternative text already resolves a rich caption through its
owning inline parser. Expose's caption and image alternatives, and the iframe
dialog, previously received the stored rich source verbatim. Entities remained
encoded and Mention/Color references were shown as tokens. The repair derives
each image's plain display text once, before allocating the Gallery output, and
shares that value between grid and viewers, including overflow images. It keeps
the input record unchanged and never reparses the resolved label as HTML.

Caption parsing completes before Gallery container, observer, image listener or
viewer acquisition. Existing renderer failure cleanup remains the owner of
previously staged sibling output/styles; existing inline renderer failure
contracts still reject failed projection. No new callback occurs on viewer open
and no new rendering/resource API is introduced.

The exact final RED uses the committed `0e2c034f` fixtures with only the Gallery
implementation replaced by its `504c8029` bytes. It fails **8 of 190** assertions:
literal and rich caption text plus image alternative text in both main and iframe
viewers. The remaining controls, including actual next-slide navigation, empty
captions, unchanged source URLs/input, disposal and inactive retained openers,
pass. The complete affected page on restored `0e2c034f` passes **190/190**.
Both typecheck projects and **156/156** Renderer unit cases also pass.

The first exploratory viewer run did not wait for Expose's timer-owned transition
completion. Its extra two main-document navigation failures were fixture errors;
that original log remains as `viewer-exploratory-red.log.gz`. The final fixture
waits for the existing transition to retire before the next click. It does not
modify the library or dependency to speed the animation up.

## Pinned three-source comparison

`scripts/parity/gallery-viewer-captions.mjs` serves source modules directly from
the three immutable Git objects. The candidate's committed fixture is verified
against the working file; source HEAD and tracked-file state are checked at the
end. The JSON retains every loaded source/dependency file hash, dependency
versions, raw actual/expected observations, page/server errors and timestamps.

The comparison intentionally uses the same installed current dependencies for
all three sources. It is not an execution of each historical npm dependency tree.
The fixture adapts public version/config spelling. For the literal control,
v1's plain-caption wire string and v2's rich-field escaped string denote the same
fixed authored text, including literal tag-looking text, a literal unknown token
and an entity that must remain encoded after one decode.

| Source and realm | Executed observations | Raw failures | Incomplete |
| --- | ---: | ---: | --- |
| v1 main document | 13 | 3 | No |
| v1 iframe | 1 | 1 | Yes: no viewer in its owning iframe; 12 later observations not executed |
| Specification baseline main | 13 | 4 | No |
| Specification baseline iframe | 13 | 4 | No |
| Candidate main | 13 | 0 | No |
| Candidate iframe | 13 | 0 | No |

The v1 literal reader text passes. Its two rich-caption/widget failures identify
an unsupported v1 caption capability, while its retained opener re-creates a
disposed viewer. Its iframe viewer is absent from the owning document. The
baseline has the eight reproduced text/alternative-text defects. Every source
has zero page/server errors. Each source/realm runs in a fresh page so a
historical revived viewer cannot contaminate the next scenario.

The raw command exits **1** because reference failures/incomplete work remain
visible. It records `candidatePass: true`, **26/26 candidate observations** and
no candidate exception. There is no historical classifier or all-source green
claim. The comparison uses DOM control activation, not trusted pointer/keyboard
or OS clipboard proof, and it does not change preservation-register acceptance.

## Reproduction

Install the locked dependencies, Chrome/Chromium and Playwright. From a checkout
containing this checkpoint:

```sh
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_BROWSER_PAGE=gallery-layout-registry.html node tests/browser/run.mjs
node --test renderer/*.test.js renderer/renderers/*/*.test.js
npm run typecheck
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node scripts/parity/gallery-viewer-captions.mjs
```

The differential chooses the current commit as candidate, requires the fixture
to be committed and rejects tracked changes during execution. Its three-source
raw failure status should be interpreted using the recorded per-source results.
For the exact original candidate, use `0e2c034f` plus the unchanged runner whose
hash is recorded in the JSON. New runs must retain their own source identity.
