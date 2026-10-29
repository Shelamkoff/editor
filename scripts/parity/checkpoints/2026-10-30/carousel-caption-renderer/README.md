# Carousel caption rendering — native v1 regression, 2026-10-30

An isolated review of the still-open Gallery/Carousel ROUNDTRIP rows found a concrete Carousel output regression. Starting with the plain visible caption `Alpha`, a trusted native `&` edit correctly produces current canonical `Alpha&amp;` and visible editor `Alpha&`. Exact native Undo/Redo succeeds. The Carousel renderer nevertheless writes the canonical string with `textContent`, displaying `Alpha&amp;` to the reader after edit and Redo in detached render, an attached render result and `renderTo`.

The pinned v1 editor saves plain caption text with `textContent`, and its renderer's `textContent` assignment therefore displays the same native edit correctly. This is a user-visible regression with ordinary typed text, independent of historical rich-widget support or ambiguous HTML input.

## Contract and scoped correction

Current `shared/blockSchemas/carousel.js` maps each caption as a rich-text field, and `plugins/carousel/index.js` declares the active caption with mode `rich-text`, projects HTML and serializes its `innerHTML`. `EditorRenderer` already provides a document-bound InlineParser with the actual sidecars. The two-line correction uses that parser for the FIGCAPTION, matching the existing Image/Embed/Person consumers. No new decoder, public API, dependency change or shim is introduced. Media `alt` remains a separate plain-text property.

Maintained regressions prove exactly-once entity decoding, literal encoded markup, independent media alternatives, authored formatting, actual Mention/Color labels, sibling preservation, unchanged renderer input, the three renderer surfaces and genuine native input/history with retained native edit nodes and caret. The v1 Carousel class has `inlineTools = false` and no `mapTextFields`; the rich-widget tests establish current capability, not historical v1 widget support.

Implementation patch SHA-256: `7fc19c017287e16b2b04e4d83e89096fb6d817ff13c99458b3d633f4f616eda9`. It is scoped to the Carousel renderer, three regression files and two test imports, relative to the already-applied Gallery/source-completion implementation `ec5240c307753163c6c43c68431e77ff6e3d133626710a06b4a5297f7dea96f1`. The latter is not repeated here. Source and log hashes are in `manifest.json`.

## Raw differential and TDD

The same fixed fixture runs real defaults and two populated local-image cases against pinned v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` and the isolated candidate. Baseline bytes are checked against Git; loaded candidate files are hashed and checked unchanged at completion. No source transformation or acceptance classifier is used.

| Raw bounded run | v1 | Specification baseline | Candidate |
| --- | --- | --- | --- |
| Before Carousel correction | 178 observations, 0 failures | 12 failures: Gallery 6, Carousel 6 | 6 Carousel failures |
| After Carousel correction | 178 observations, 0 failures | Same 12 raw failures | 178 observations, 0 failures |

Both bounded runs have zero server, page and window errors. The raw differential intentionally exits with code 1 while baseline failures remain; it is not described as an entirely green three-source run. The candidate fixes Carousel's six output failures. Gallery's populated control is already green through the prior Gallery work. Each empty default records edit/Undo/Redo as not applicable because no caption exists; no author field is invented. The populated cases preserve fixed image/slide order and IDs, sibling `Bravo`, options, data and actual native history. Gallery's v1 wire adapter omits only IDs that did not exist in that version. V1 focus after Undo is reacquired on the current real caption solely to deliver the requested native Redo; this probe does not assert v1 caret parity.

`renderer-red.log.gz` retains two independent failing maintained tests for literal/marked and actual-widget captions. `native-red.log.gz` retains the genuine native ampersand failure. Final maintained gates are:

| Gate | Result |
| --- | --- |
| `projection-contracts.html` | 139/139 PASS |
| Maintained native Carousel caption regression | 1/1 PASS |
| Renderer Node tests | 122/122 PASS |
| Both source typecheck configurations | PASS |

## Geometry and observation limits

The initial exploratory probe used an invalid Gallery layout `2a`; the corrected fixture uses the actual `2` layout. That initial Gallery failure is a fixture error, not production evidence.

The same initial probe also emitted `ResizeObserver loop completed with undelivered notifications` during auto-height Carousel output. A later first renderer-test attempt emitted one such error while its styles were loading. These events remain preserved in `native-probe-initial-unbounded.log.gz` and `renderer-style-loading-diagnostic.log.gz`; they are not filtered, classified away or claimed fixed by this caption change.

The bounded differential uses the existing public `aspectRatio: '16 / 9'` option. Maintained renderer tests additionally acquire the documented `renderer.injectStyles()` lease and wait for those real styles before constructing Carousel; they release that lease on cleanup. All browser errors remain fatal. Those are explicit fixture bounds for the caption contract, not a runtime change or acceptance of auto-height behavior.

## Remaining ROUNDTRIP acceptance work

The frozen shared 53-case fixture and preservation ledger are untouched. They still contain neither Gallery nor Carousel. Completing their full shared template requires dedicated nested-caption data adapters, exact current addresses, real default N/A phases, current mode-rebuild/retired-host ownership assertions, full native caret checks and the applicable renderer observations. Gallery intentionally recreates views on modes; Carousel declares only its currently presented caption while retaining other slide captions in canonical data. Neither behavior should be tested with a fabricated stable-host or simultaneous-visible-field requirement.

Wrapped/unwrapped rich-widget controls need explicit unsupported-reference attribution for v1 where its public inline contract lacks the required mapping hook. They must remain separate from the ordinary literal/native controls above. Gallery overflow/Masonry, Carousel navigation/autoplay, providers, media actions and auto-height observation behavior retain their separate acceptance obligations. This checkpoint does not close either full ROUNDTRIP row or any detailed behavior row.

## Reproduction

For the maintained regressions, use the ordinary `projection-contracts.html` entrypoint and `EDITOR_NATIVE_PAGE=native-plugin-media.html EDITOR_NATIVE_FILTER='Carousel native caption ampersand'` with the existing browser runners. Unit command: `node --test renderer/*.test.js`; source check: `npm run typecheck`.

The `reproduce/` tree preserves the isolated raw probe at its original relative paths. Copy those files into an isolated implementation checkout, provide the pinned archive directories `/tmp/rector-v1-5e5c7f8` and `/tmp/rector-e981ff3`, the recorded installed dependencies and Chrome 156, then run `node scripts/parity/media-roundtrip-review.mjs`. The raw runner has no classification exceptions. The standalone native probe uses `EDITOR_NATIVE_PAGE=native-media-roundtrip-review.html` with `tests/browser/physical-history.mjs`.

Independent peer review confirmed the rich-field contract, existing parser/ownerDocument/sidecar boundary, exactly-once decoding and the narrow correction. Full combined-source gates belong to the parent integration run.
