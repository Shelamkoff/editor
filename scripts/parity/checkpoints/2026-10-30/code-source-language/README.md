# Code source editing and language control

## Result and scope

This checkpoint supplies a fixed, independently authored browser corpus for `BLOCK_CODE_SOURCE` and `BLOCK_CODE_LANGUAGE`. The immutable candidate is `e6842abf21aee9655d56900ec9fb784edd864609`; it changes test infrastructure only. The current source completes all **20 scenarios and 2,062 observations**, with no failed observations, incomplete cases, page errors or server errors. The native harness executes the same **20 scenarios with exit 0**. The recorded three-source comparison exits **1** because historical failures remain visible; its separate `candidatePass` is true.

| Source | Complete cases | Observations | Failed observations |
|---|---:|---:|---:|
| v1 `5e5c7f8d…` | 20 | 1,894 | 178 |
| Specification `e981ff30…` | 20 | 2,062 | 232 |
| Current `e6842abf…` | 20 | 2,062 | 0 |

All sources execute the same public gestures and receive the same expected semantic outcomes. The historical adapter only selects public construction and wire-version spelling. The old version lacks the current transaction observation API; public content, history and native interaction checks still run. No historical result is reclassified as a pass.

## Fixed authoring corpus

Twelve source scenarios use literal HTML-like content and escaped entities. Native Tab inserts four spaces at a caret or replaces a single-line range. Multiline indentation preserves forward/backward direction, excludes a line reached only by the ending boundary, includes empty selected lines and handles a final newline. Shift+Tab removes one tab or up to four spaces, handles a caret inside indentation and leaves unindented source unchanged. Each operation verifies exact source text, inert live paint, owning block and unchanged neighboring paragraphs. A subsequent native `X` is a separate history action. Undo/Redo must restore both exact author content and source selection; a no-op does not acquire an extra history entry.

Eight language scenarios exercise the real visible menu and filter using trusted clicks or keys: arrow selection of JavaScript and TypeScript, Enter to Auto, mouse selection of Plain text, unknown-language fallback followed by a supported choice, the same language as a no-op, Escape and an empty search result. Filter text remains auxiliary state and creates no history action. Native source input precedes the language action; separate Undo/Redo verifies both. The source is explicitly refocused before keyboard history, so this proof does not impose historical post-menu focus behavior on the improved current UI.

A fixed injected highlighting provider returns escaped spans for Auto and known languages. Unknown and explicit plain source remain readable without invoking highlighting; literal source never becomes authored HTML. Language, provider selection, caller-owned input and neighboring block records are checked throughout. Read-only rejects a retained opposite language item. Before destroy, the editor returns to editable source mode; the retained opposite item must then leave the detached projection, provider and author transaction count unchanged.

The fixed expectations are authored in the fixture rather than computed by production helpers. Observations clone actual and expected values at capture time. The runner pins every production module to immutable Git bytes, records their hashes and dependency bytes, requires unchanged source/fixture/runner, rejects empty candidate cases and incomplete plans, and retains raw historical failures.

## Evidence and limitations

`manifest.json` records exact sources, original commit bytes, source patch, process outcomes and hashes. `final-differential.json.gz` is the complete recorded comparison. `native.log.gz` and the process records retain the successful native result. `runtime-hashes.json` verifies the same Node, Chrome and Playwright bytes used for the recorded runtime. The source patch can reconstruct the original tested tree from the published base without relying on an unpublished branch reference.

`attempts/` retains an initial fixture preparation failure: eight language cases incorrectly expected Undo to be available while read-only. The final fixture expects the intended suspended capability and verifies its restoration after returning to editable mode. That correction is a test expectation repair, not a production fix. The initial staged tree and patch have no immutable commit claim. The first complete green run has unavailable terminal exit results; a fresh native run and a subsequent complete differential run have explicit recorded process outcomes. An intervening wrapper stopped without recording its second outcome and left empty output; this is retained without inventing a cause or success.

This scope covers the recorded Chrome runtime. Page-error and server-error channels are collected, but console messages and the diagnostic callback are not. It does not accept other Code features, other browsers, whole-library parity or unsettled `B-HTML`/`B-STYLE` choices. Independent peer artifacts are stored separately under `peer-review/`; root's fixture authorship is not described as peer review.

## Reproduction

Restore the tested source and recorded dependencies, then run:

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node scripts/parity/code-source-language.mjs

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Code source-language parity' \
node tests/browser/physical-history.mjs
```

The historical comparison exits 1 while the retained old failures remain. The native filter must execute exactly 20 scenarios.
