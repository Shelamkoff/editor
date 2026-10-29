# Parity probe sources — 2026-10-29

These are immutable, byte-for-byte copies of the probe sources executed for the
2026-10-29 checkpoint. They preserve the original session paths and imports.
They are reproduction evidence for that checkpoint, not a portable CI runner,
package entrypoint, compatibility runtime or new dependency installation path.
No generated trace or screenshot is stored here.

Published commit IDs and the original verification IDs are related by the
tree-verified [publication provenance](PUBLICATION.md). The accompanying map
retains original commit bytes so a fresh checkout can reproduce probes that
name the original local IDs.

## Source identities and results

| Source | Executed scope | Result |
|---|---|---|
| `rector-quote-v1-oracle.mjs` | Pinned v1 `Quote.onPaste`: nested `cite`, `footer`, `figcaption`, rich attribution and unchanged input DOM | 3 passed |
| `rector-renderer-v1-oracle.mjs` | Pinned v1 and candidate public renderer: subclass/override, custom registration, output, incremental reuse and disposal | 14 checks passed per version; 12 resources created/disposed per version |
| `rector-renderer-factory-parity.mjs` | v1 and specification-baseline constructor/factory controls, candidate class/factory absence, subclass/override and custom output/disposal | Passed; 7 resources created/disposed per construction branch |
| `rector-renderer-factory-control.mjs` | Initial factory-probe development source with an incorrect expected dark-theme CSS modifier | **Failed fixture; not acceptance evidence** |
| `rector-quote-paste-merge.mjs` | v1, specification baseline and candidate: trusted system paste, compatible merges, boundary negatives, public export and conversion | 16 cases per source; 48 classified observations; candidate passed |

The first two successful runs used candidate production source
`fa13888a66e660e2893e5fc493bd600588f13b10`; the successful factory control used
`4b87dad094367eea16b768ca4e3ac0808b1dec1f`. Only a conversion-grouping test fixture
changed between those commits. The initial failed probe is retained separately
to explain the failed `renderer-factory-control` session trace; the corrected
source is `rector-renderer-factory-parity.mjs`.

SHA-256 values of the exact executed files:

```text
23a24b72067d51fd27400494d7ae567639e0d0757ce97c97c31f070007f44a98  rector-quote-v1-oracle.mjs
42266203aba29552651e118efe2ac68dac942c1ed88f35fa707b23b0b452b9c8  rector-renderer-v1-oracle.mjs
bccac37befe9041536e24d035465f82fe43d7763f60709315b26e2cc6fc5a6cc  rector-renderer-factory-parity.mjs
dd6c8a159b2d745531c7a1ce6edfe5a81e9c9502172e9424b42cd8b29a8e9364  rector-renderer-factory-control.mjs
e38cde196974587f5a743c268448b98251a4d97e78a5b55e6ae4ff24c93601e3  rector-quote-paste-merge.mjs
```

## Original environment and required paths

The runs used Linux, Node `v24.22.1` and Chromium `142.0.7444.175`, with local
loopback HTTP servers. The exact sources require these session locations:

| Path | Required content |
|---|---|
| `/workspace/scratch/61a2ad7355f4/editor` | Candidate Git checkout and its installed current `node_modules`; required baseline Git objects must be available |
| `/tmp/rector-v1-5e5c7f8` | Unmodified archive of `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (v1.0.5) |
| `/tmp/rector-e981ff3` | Unmodified archive of specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`; needed by the factory control |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` | The session-provided Playwright module imported by all probes |
| `/tmp/rector-browsers/chrome-linux64/chrome` | Chromium executable hardcoded by Quote/renderer14; the factory probes receive this path through `EDITOR_CHROME_PATH` |

Supply the exact baseline archives before execution. Quote assumes its archive
identity; the renderer probes additionally compare specified baseline entrypoint
bytes with Git objects. The factory probe also verifies its candidate entrypoint
and implementation against the current HEAD. The scripts do not pin or restore
the candidate checkout: a later checkout is a different run, not the historical
accepted result.

The renderer probes share the candidate's installed dependencies through their
import map. They do not install or recreate the complete historical dependency
environments. Their custom renderers use `injectStyles: false`. The probe files
were originally executed from `/tmp` with the same filenames; once all required
paths exist, the retained files can also be invoked directly with `node` from
this directory. Set `EDITOR_CHROME_PATH` for the factory probe. No repository
script or CI job invokes these files automatically.

Do not rewrite these checkpoint files to relocate paths or extend assertions.
Use a separately identified probe with its own hash and results for a new
environment or expanded comparison.

## Evidence boundary

The constructor/factory result supports the bounded `RENDERER_CONSTRUCTION`
scenario together with the candidate's class, declaration and installed-package
checks. It does not accept the broader renderer-output row or all 209
preservation scenarios. Built-in renderer coverage, producer-revision shortcuts,
foreign-output ownership, async factories, styles, CSP and cross-realm behavior
remain separate obligations. Document/schema adapters exist only in these tests.

Quote executes the original importer directly in a real DOM. Its corresponding
candidate regressions are registered in `tests/browser/html-root-parity.js` and
use a controlled ClipboardEvent; this comparison does not prove system-clipboard
HTML transfer. None of these probes establishes whole-library functional parity.

## Expanded Quote comparison

The separate `rector-quote-paste-merge.mjs` was executed on candidate
`948bc5544dcf57a343733f589883973ec7db6cd7` from 15:32:43 to 15:33:12 UTC.
It checked all loaded source JS/CSS bytes against Git before and after the run:
103 modules/assets for v1 and 89 for each current-format source. The retained
source resolves the candidate repository relative to its own location and uses
the existing baseline archives; `EDITOR_V1_ROOT`, `EDITOR_SPEC_BASELINE_ROOT`,
`EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH` can supply the recorded paths.

Trusted browser Copy from a controlled external producer and Paste into the
editor exercise real system clipboard transfer. Backspace/Delete merges cover
both, target-only and source-only captions; negative boundaries retain separate
fields and incompatible neighboring blocks. Public export and both conversion
directions preserve rich author content. Candidate assertions include one-step
Undo/Redo, directed selection, block IDs and unrelated DOM identity.

The baseline oracles explicitly retain observed v1 caption loss on merge and
Quote-to-Paragraph conversion as repaired defects, not functionality to restore.
They also classify the older nested-attribution and caret/history defects.
A baseline PASS means that its observed behavior matches that version's stated
oracle; it does not mean the baseline satisfies the candidate contract.

The matching 16 candidate cases are registered by
`tests/browser/native-plugin-parity.js`. The unfiltered page passed 217 cases on
clean `22ef58405326be1e4e61aff334f4f4538cdab3c0` (published identical tree at
`1acc8ec9dedd3348f0ba0783930e9a7369cafe22`) from 15:37:15 to 15:38:11 UTC.
This accepts the bounded `BLOCK_QUOTE_PASTE_MERGE` row, with its documented
repaired-defect differences. `BLOCK_QUOTE_FIELDS`, `BLOCK_QUOTE_ROUNDTRIP` and
the other clipboard rows remain independent obligations.
