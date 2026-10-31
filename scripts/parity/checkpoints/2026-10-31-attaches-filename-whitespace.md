# Attaches filename whitespace — 2026-10-31

## Scope and provenance

- Repository: `Shelamkoff/editor`, branch `refactor/rector-v2-architecture`.
- Baseline: `5151c646a4652dd734ec0cafa47e30e870bd09bd`.
- Restored source `plugins/attaches/index.js` was verified against Git blob
  `e9dcc7e270ff04d4f4b54960cc71dec6321ac92b` before modification.
- This is one defect repair, not whole-library or v1 parity acceptance.

## Defect and change

`BlockInstance.read()` unconditionally trimmed filenames. Reading `report `
therefore returned `report`, losing an in-progress separator or an intentional
edge space. The schema already accepts filename strings without this trimming.

Use `trim()` only to decide whether the input is blank. Return the original
non-blank spelling. Preserve the existing blank-input fallback to the latest
canonical name by stable file ID, and to the local projection only if that ID
is absent. No history, data-version, public API, sanitizer or schema changes.

## Executed checks

Node.js v22.16.0, on a locally reconstructed source subset:

- Red: the first regression test failed with `report` instead of `report `.
- Green: all 15 filename read/projection tests passed; zero skipped.
- `node --check plugins/attaches/index.js` passed.
- `node --check plugins/attaches/filename-read.test.js` passed.

The local test command was:

```sh
node --test --experimental-loader=/mnt/data/rector-verification/isolated-loader.mjs \
  plugins/attaches/filename-read.test.js
```

The local-only loader substitutes imported collaborators (configuration, schema,
URL/HTML helpers, presentation helpers). The production Attaches source is the
actual module under test. Tests use a narrow element double and read-only
projection, not a browser or the document/history engine. The loader is NOT
part of the product or committed tests. This result is isolated component
verification, not the normal full-repository test command or native acceptance.

The committed test imports `./index.js` normally. Run it again with the real
repository dependencies using:

```sh
node --test plugins/attaches/filename-read.test.js
```

Coverage includes leading/trailing/repeated and Unicode whitespace, blank input,
latest canonical fallback after reordered IDs, missing-ID fallback, and retained
projection/replay in variants `a`, `b`, `f`, `g`. Replay here calls the block
projection contract; it does not prove editor Undo/Redo history integration.

## Open verification

- Chromium navigation to the local test fixture was rejected with
  `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no browser scenario is reported as passed.
- Full unit suite, typecheck, build, native/clipboard/history/parity and memory
  gates were not run. Previous-session totals are not candidate evidence.
- The earlier workspace and its unpublished commits were not available in this
  environment; no claim is made that those commits have been recovered.
