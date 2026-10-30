# Gallery caption/order preservation

This is a focused native investigation of `BLOCK_GALLERY_CAPTION_ORDER`.
It does not use the general `ROUNDTRIP` case count as evidence for this row.

## Executed interaction

Each case starts with three fixed image IDs and three distinct local PNGs,
between unchanged Paragraphs. The six cases combine literal captions,
supported rich marks, and rich Mention/Color captions with either a real
image drag-and-drop or the native Remove button.

The literal control includes entities and angle brackets as author text.
The rich controls include bold, italic, strike, mark and code formatting.
The widget control keeps Mention on the first image and Color on the
middle image, which is edited and then removed in the Remove case.

| Phase | Required result |
| --- | --- |
| Load | Images `alpha, bravo, charlie`, original captions and sidecars, empty history |
| Native input | Append `X` to the middle caption, preserving all other captions |
| Native swap | Drag `alpha` onto `charlie`; order becomes `charlie, bravo, alpha` |
| Native remove | Remove the edited `bravo`; order becomes `alpha, charlie`, and its Color sidecar is pruned |
| First native Undo | Restore the original order and edited middle caption, including its sidecar |
| Second native Undo | Restore the original caption text; no earlier history remains |
| First native Redo | Restore only the caption edit |
| Second native Redo | Restore only the swap/removal; no later history remains |

Swap and removal are separate fresh-document cases. The fixture sends
trusted browser mouse, drag and keyboard input. It checks the exact image
targets and `isTrusted` on input, dragstart/drop, Remove and history keys.
It never refocuses a field between the structural action and Undo/Redo.

Every phase checks canonical records, live author markup, image/caption
order, alternative text, persistent v2 item IDs, widget ownership by image,
sidecars, both neighbors, history flags, caller input immutability and zero
provider calls. The expected data is fixed independently of `editor.save()`.
Markup comparison preserves tag/attribute meaning while treating equivalent
HTML entity serialization equally. The native candidate page uses exactly
the same expectations as the three-source runner.

## Historical sources and strict classification

The runner verifies every loaded source/style file against its immutable
Git object and rechecks the file bytes after execution. Dependencies, fixture,
runner and classifier have recorded SHA-256 hashes. It runs:

- v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`;
- specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`;
- the explicitly reported candidate commit.

The only input adaptations are the public versioned envelope, omission of
image IDs that v1 never supported, and v1's plain-string representation of
literal captions. Rich markup and widget sidecars are supplied unchanged
to the v1 capability controls. The trace therefore records their actual
literal rendering and missing sidecars rather than flattening the input.

The historical recognizer requires the exact source, case, completed phases,
independent records, history flags, native action evidence, provider silence
and fixed failure vectors. It also requires the actual body focus for the
known failed shortcut delivery. It never classifies a candidate failure.

| Historical observation | Classification |
| --- | --- |
| v1 renders rich caption HTML as text | Reference capability limit |
| v1 drops unsupported caption sidecars | Reference capability limit |
| v1 removes the edited caption and loses keyboard Undo/Redo | Historical defect |
| Baseline swap loses keyboard Undo/Redo | Historical defect |
| Baseline alt retains encoded entities, tokens or stale native text | Historical defect |
| Baseline widget swap/remove throws during projection | Historical defect |

The four baseline widget page errors must pair exactly between the window
error channel and Playwright, including case, phase, message and immutable
stack. Missing, duplicate, unrelated or candidate errors are fatal. The
offline validator exercises actual recorded historical observations and
mutations of their data, phases, source, native trust and paired errors.

## Regression and oracle correction

The initial literal native drag exposed a candidate regression that v1 did
not have: the drop handler focused a caption immediately before replacing
that caption. The next keyboard Undo was delivered outside the editor.
`ff828ef5` focuses the retained Gallery wrapper before the structural update.
Its dedicated regression first failed on the real CDP drag and then passed
with two independent Undo and Redo actions. The complete affected native
page went from 240/241 to 241/241 before the detailed six cases were added.

An early exploratory rich input incorrectly used `<u>`, which is outside
`shared/sanitize/allowlist.js`. Its removal was correct sanitation, not a
Gallery defect. The original failed raw trace remains recorded in the
checkpoint; the final input uses supported `<code>` formatting. No candidate
exception or production sanitation change was introduced.

## Reproduction

Run from the candidate checkout with its dependencies installed. The two
historical roots must contain unchanged Git source archives at the pinned
commits; the repository must contain those Git objects.

```sh
EDITOR_V1_ROOT=/tmp/rector-v1-5e5c7f8 \
EDITOR_SPEC_BASELINE_ROOT=/tmp/rector-e981ff3 \
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node scripts/parity/gallery-caption-order.mjs > /tmp/gallery-caption-order.json

node scripts/parity/verify-gallery-caption-order-classifiers.mjs /tmp/gallery-caption-order.json
```

The standalone runner opens a local static server and uses native Playwright
input. It does not need Vite. Optional `EDITOR_GALLERY_FILTER` selects a case;
the offline validator deliberately requires the complete six-case run.

The candidate cases are registered on `native-plugin-parity.html`:

```sh
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Gallery caption/order:' \
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome \
EDITOR_VITE_PATH=/tmp/rector-root-vite.mjs \
node tests/browser/physical-history.mjs
```

Omit `EDITOR_NATIVE_FILTER` for the full affected page. The normal project
native gate also executes these registered cases. These are functional
results, not a performance comparison. Upload/source delivery, layout and
viewer controls remain separate Gallery preservation rows.
