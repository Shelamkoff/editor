# Gallery caption/order evidence — 2026-10-30

This checkpoint preserves the original evidence for the scoped acceptance
of `BLOCK_GALLERY_CAPTION_ORDER`. All artifacts are stored in Git; temporary
execution directories are recorded as provenance, not required evidence
locations. The [summary](../gallery-caption-order.json) gives commands,
results and hashes. The [scenario guide](../../../gallery-caption-order.md)
describes the native actions and independent oracle.

## Source identities

| Identity | Commit | Tree |
| --- | --- | --- |
| Isolated base / production RED | `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef` | `8b22cffd41d5f1e56729029d492f7151dabade56` |
| Isolated fixed runtime | `ff828ef5a6db070172f56a6c4a92ba68b2740c4f` | `d89699d6d88de4a32d970ce75baa179ac65ed8d4` |
| Executed proof files committed | `f795edf098fe733146e2cf34de77977bdcb01819` | `714e39b1a93b59524d629d6fcb90ef213cbd47b5` |

The measured final runtime is `ff828ef5`; the runner/fixture/classifier byte
hashes match their later commit in `f795edf0`. The
[source facts](source-facts.json) distinguish these isolated identities from
the published integration counterparts
[runtime fix](https://github.com/Shelamkoff/editor/commit/836fed7db5af30240b8156f811cb2a10b4fa0511)
and [proof](https://github.com/Shelamkoff/editor/commit/24c012015542e0f955164a47d52fa4c4c7db75ae).
An integrated commit includes other changes and has its own tree identity.

[executed-fix-and-proof.patch.gz](executed-fix-and-proof.patch.gz) contains
both exact source patches over `e99fec9d`. Applying them in a separate
checkout reconstructs the recorded file trees even when a later publication
uses different commit IDs. The original precommit fixture/runner snapshots
below were reconstructed from the committed source and admitted only after
their byte hashes exactly matched the executed raw traces.

## Original artifacts

| Artifact | Preserved result |
| --- | --- |
| [literal-drag-red.json.gz](literal-drag-red.json.gz) | Original three-source literal drag RED: v1 passes; baseline and candidate lose keyboard history ownership |
| [native-drag-red.log.gz](native-drag-red.log.gz) | Full affected native page: 240/241, with the new real-drag regression failing |
| [native-drag-focused-green.log.gz](native-drag-focused-green.log.gz) | Fixed focused regression: 1/1 |
| [native-drag-full-green.log.gz](native-drag-full-green.log.gz) | Fixed full affected page, before adding the six detailed cases: 241/241 |
| [unsupported-underline-oracle.json.gz](unsupported-underline-oracle.json.gz) | Original failed exploration with unsupported `<u>`; candidate has 56 oracle differences |
| [supported-unclassified.json.gz](supported-unclassified.json.gz) | Corrected supported markup: candidate 378/378, while historical observations remain unclassified and process exit remains 1 |
| [final-three-source.json.gz](final-three-source.json.gz) | Final exit 0; candidate 378/378, v1 123 and baseline 101 exact historical differences, four paired baseline errors, nothing unexpected |
| [native-caption-order-green.log.gz](native-caption-order-green.log.gz) | Six detailed cases through the standard native CDP page: 6/6 |
| [gallery-unit-green.log.gz](gallery-unit-green.log.gz) | Gallery unit tests: 16/16 |
| [classifier-controls.json.gz](classifier-controls.json.gz) | 224 positive / 3808 negative observation controls, four paired / 11 negative error controls, zero candidate exceptions |

The two native page totals are separate executed results. No combined
247-case result or later integrated full-gate result is invented here.

The exploratory snapshots are
[fixture-initial.js.gz](fixture-initial.js.gz),
[fixture-underline-oracle.js.gz](fixture-underline-oracle.js.gz),
[fixture-supported-unclassified.js.gz](fixture-supported-unclassified.js.gz)
and [runner-unclassified.mjs.gz](runner-unclassified.mjs.gz). The original
failed traces are unchanged. Unsupported underline was an input/oracle
mistake; the final input uses allowed code formatting without a production
sanitizer change or a candidate exception.

## Verification and boundaries

[hash-index.json](hash-index.json) identifies the stored gzip bytes and the
exact decoded originals. Gzip timestamps are zero for deterministic storage.
The final raw also includes every loaded source/style and dependency hash,
Git-source identity checks, environment metadata and raw error channels.

The six scenarios execute real native middle-caption input, outer-image
drag/swap or edited-image removal, then two independent keyboard Undo and
two Redo actions. Fixed records verify rich marks, IDs, captions, sidecars,
order, live widget ownership, neighbors, history and provider silence.
The caller document stays unchanged. v1's rich-caption/sidecar limitations
remain capability limits; focus and projection failures remain historical
defects. Candidate failures and errors always remain fatal.

Acceptance is scoped to the recorded native actions with three images on
Chromium `156.0.8078.47`. Step buttons, removing the final image, overflow
variants, additional caret/range boundaries and a fresh mode/renderer matrix
were not executed by this slice. Sources/uploads, layouts, viewer controls,
other browsers, performance and whole-library parity are separate proof
obligations. The documentation/evidence packaging step ran no browser,
project tests or build.
