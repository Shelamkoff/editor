# Gallery field preservation — 2026-10-30

A public change to one Gallery caption rebuilt every image slot, even when image
IDs/order/URLs, layout and options were unchanged. This retired untouched caption
hosts and their real inline instances. The structural acceptance controls use
fixed independent authored data for 3 and 48 images; both reproduced the failure.

## Narrow repair

Gallery now keeps its declared rich-field hosts when the surrounding media view
is stable. Existing core projection applies changed canonical caption content,
including history restoration, and completes the affected field's derived
alternative text. The plugin no longer uses caption equality to decide whether
to rebuild the whole media view. It introduces no new API or core path.

Open Gallery dropdowns and structural media/layout/options changes retain their
existing full-view projection. The fake-DOM unit assertion that demanded a new
host on Undo is replaced by the declared-host contract. Restored author content,
sidecars and actual history remain assertions of the real structural browser
fixture, rather than a copied approximation of core in the unit harness.

## Recorded outcomes

| Stage | Original C11 run | Result |
| --- | --- | --- |
| Unmodified Gallery structural RED, Chrome 156 | `run-ddcoEt` | 2 FAIL: public caption update replaces unchanged hosts |
| Fixed structural paths, Chrome 156 | `run-lJtdCh` | 2/2 PASS |
| Same structural paths, Chrome 142 | `run-d2OkGb` | 2/2 PASS |
| Gallery unit suite | `run-lV9LDW` | 16/16 PASS |
| Both checked-JavaScript configurations | `run-iodNLP` | PASS |
| Existing projection contracts | `run-RJPVle` | 146/146 PASS |
| Existing trusted native Gallery media controls | `run-KbdxxW` | 35/35 PASS |

Each structural case runs empty/equal no-ops, public model update, trusted native
text input and trusted IME composition. Each changed operation has one Undo,
one Redo and restoration, with exact fixed data, meaningful IDs/order, sidecars,
caller immutability, neighbor identity, all field hosts, untouched sibling marks
and inline nodes, provider effects and scheduled notification assertions. The
media controls retain existing layout/settings, overflow, source/retirement,
Masonry and derived-alt positive/negative coverage. This checkpoint does not
claim a new complete Gallery behavior matrix or C09 timing acceptance.

All original manifests report `sourceUnchanged: true`. The six GREEN stages share
source identity `f1115f7c1a5f2c4901ce46337e3f26cd603c0c751b40700cf581a47df7cb087d`.
The base is `d8181d595fb74ab7f70de5ffc945770436ed8796`, which includes the parent's
separate immutable event-publication repair; Gallery source before this repair
matches published `4bfb39426744bc0a96725258c06dc9192b58098b`.

The runtime diff was independently reviewed by the native-selection agent.
Its review covered delegation to existing canonical/inline projection and the
retained structural fallback. It did not replace these executed gates.

## Source and replay

`gallery.patch.gz` contains only the Gallery plugin and its affected unit oracle;
decompress it before applying.
`red-source.patch.gz` and `green-source.patch.gz` are exact complete tracked diffs
against the recorded base; their decoded hashes equal each stage's C11
`patchSha256`. The parent-owned, then-untracked structural fixture is archived
separately as `structural-authoring-fixture.js.gz`; its decoded hash equals every
manifest's untracked source entry. Apply one stage diff to a clean base checkout
and restore that fixture to `tests/browser/structural-authoring-fixture.js`.
Use an actual local dependency installation, with no shared Vite cache.

```sh
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-core-behavior.html EDITOR_NATIVE_FILTER='Structural authoring gallery' node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-core-behavior.html EDITOR_NATIVE_FILTER='Structural authoring gallery' node tests/browser/physical-history.mjs
node --test plugins/gallery/*.test.js
npm run typecheck
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_BROWSER_PAGE=projection-contracts.html node tests/browser/run.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-plugin-media.html EDITOR_NATIVE_FILTER=Gallery node tests/browser/physical-history.mjs
```

Exact commands, environment, timestamps, exit codes and source identity are in
the untouched manifests and `source-fingerprints.json`. Original logs are stored
as lossless gzip with fixed mtime. `artifact-hashes.json` records original and
stored bytes/hashes; decompression was verified. No generated build assets or
screenshots are included. Gate durations are not performance comparisons.
