# Inline range preservation: bounded update comparison

This checkpoint preserves the 29 October 2026 comparison that exposed the
quadratic ownership scan in the first reviewed inline-range repair. It records
decision evidence for the linear replacement. It does not accept complete
editor performance, the later combined integration, or full Image parity.

## Observed result

The fixture constructs real editors with one Paragraph field containing 50, 200,
or 800 registered inline widgets. Each timed operation calls the actual public
`InlineWidgetContext.updateData` captured during widget creation and changes one
middle widget's payload. It includes the synchronous scope, schema, canonical
store, history, event and DOM-projection path through return. The block update
API does not accept inline payloads; this is the supported public boundary for
the reproduced bug.

Each variant has three warmups and nine measured samples at each size. Variant
order alternates forward/reverse; an animation frame settles pending observers
between updates, outside the clock. Construction, disposal, post-return
observers/UI work, layout/paint, native input and retained memory are excluded.
DOM/save assertions also run after the clock. `historyMaxStack` is 1.

| Widgets in one field | Original baseline | Quadratic repair | Linear repair |
| --- | ---: | ---: | ---: |
| 50 | 4.3 ms | 5.0 ms | 4.2 ms |
| 200 | 13.6 ms | 18.5 ms | 13.3 ms |
| 800 | 47.4 ms | 114.6 ms | 52.5 ms |

These are measured medians. At 800 widgets, baseline samples span 44.5–92.8 ms,
quadratic samples 102.4–134.1 ms, and linear samples 38.7–78.8 ms. The linear
median is 10.8% above baseline in this bounded sample, with overlapping ranges.
The result supports removing the repeated global scan; it is not a timing
threshold, latency guarantee or general editor speedup claim.

Every variant commits exactly 12 changes and updates exactly the target widget
12 times at each size. All widgets remain mounted, canonical save contains the
new payload, and creation counts remain 50/200/800. Decode counts across the
whole fixture lifetime, including assertions, are identical across variants:
713/2813/11213. Both repairs retain the unrelated tail Text node;
the original baseline replaces it. The fixture records this identity control,
not a complete native selection or IME acceptance test.

The linear repair validates the current/next captured slots before their
effects, checks global owner revocation immediately after callbacks, and scans
all slots once before hydration. Exact authored HTML is checked after hydration.
The separate three ownership RED tests remain unchanged. There is no cross-call
schema cache: ExtensionRegistry captures schemas with snapshotDataSchema, whose
decode clones the plugin's returned JSON into core-owned data before the local
per-call map receives it.

## Preserved inputs and provenance

`recorded-runner.mjs`, `fixture.js`, `recorded-variants.json` and
`result-linear.json` are byte-identical to the successful comparison inputs and
result. The result retains all 27 timing samples per size, environment,
timestamps, control counts, the dependency lock hash and the hashes of all 258
served source/dependency modules. Node was v24.22.1, V8 13.6.233.17-node.58 and
Chromium 142.0.7444.175 on the recorded AMD EPYC host.

| Label in result | Historical source commit |
| --- | --- |
| baseline | `256cc0436d74040e5c5881a07350a14de7b66a96` |
| candidate (quadratic) | `10d1ee48a83bd2cf0a29802fd33b6a4aed6518b3` |
| linear | `ede029cc646f0f528c84e3984797e502bd4e37ec` |

Those local commits identify the original observations. Replay does not require
their Git objects: the included frozen patches reconstruct all measured modules
from published `fcd7fbc4e14372147ecf1f08f75c7016b8c4c3b1`.
`published-to-baseline.patch` preserves the five source files needed for the
historical C12-v9 baseline. The two `baseline-to-*.patch` files preserve only the
measured InlineProjectionRuntime variants. They contain no investigation hooks
or optional production prototype. Apply them only in disposable replay trees.

`REPRODUCTION-MANIFEST.json` pins every checkpoint artifact, source identity and
replay transformation. `IMAGE-ALT-SEAM.md` records the remaining read-only
lifecycle finding; the Image implementation was not changed by this checkpoint.

## Replay

Use a checkout containing the published anchor and dependencies matching its
lockfile. The three loaded dependency modules are hash-checked before replay;
the helper never installs dependencies or modifies the checkout. To obtain a
separate dependency tree, extract the anchor's package.json/package-lock.json
to a temporary directory and run `npm ci` there, then point
`RECTOR_INLINE_DEPENDENCIES` at its node_modules.

```sh
RECTOR_INLINE_REPO=/absolute/path/to/editor \
RECTOR_INLINE_DEPENDENCIES=/absolute/path/to/matching/node_modules \
node scripts/parity/checkpoints/2026-10-29/core-continuation/inline-range/replay.mjs --prepare-only
```

That command reconstructs each source, checks all 258 module hashes and the
three lockfiles, and syntax-checks the relocated runner. It does not open a
browser. The printed temporary directory contains the reconstruction record.
To execute a fresh comparison, run the same command without `--prepare-only`
and supply the browser dependencies:

```sh
RECTOR_INLINE_REPO=/absolute/path/to/editor \
RECTOR_INLINE_DEPENDENCIES=/absolute/path/to/matching/node_modules \
RECTOR_INLINE_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/absolute/path/to/chromium \
node scripts/parity/checkpoints/2026-10-29/core-continuation/inline-range/replay.mjs
```

The helper preserves the original runner and fixture. In a fresh temporary
directory it relocates only paths/imports and replaces the original Git-object
byte comparison with the recorded SHA-256 comparison for every served module.
The measured browser code, update boundary, clocks, assertions and ordering are
unchanged. The relocated runner has its own recorded hash. Its new observation
is written to `result-replay.json`; the historical result is never overwritten.
Run this comparison without competing browser/benchmark work and retain its
new environment alongside the samples. Exact historical timings are not a
replay requirement.
