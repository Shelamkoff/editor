# Image source replacement repair — 2026-11-05

Tested production and maintained fixture: `a5bc6567`.
Parent: `888619b04cb3f8113be808389229838ccdfc9836`.
Environment: Linux x64, Node 24.22.1, Chromium 155.0.8059.79.

Submitting a new URL now cancels the existing upload/application source rather
than allowing its late result to replace the new image. Read-only removes the
cancelled request's loading indicator immediately. Cleanup relinquishes the old
request before cancellation callbacks and leaves successor loading intact.

The twelve valid-input regression cases all fail with the parent production
module and pass with the repair. Cases combine upload/action, empty/populated,
late resolve/reject and a mode round trip with a live successor. Expected block
records are copied from the initial authored document and changed only at the
explicit file/caption fields. Rich captions, actual Color payloads, sizing,
caller data, one transaction and exact Undo/Redo are required.

Native execution passes twelve cases and thirteen under enforcing Trusted
Types, using real mouse input, URL typing and raw keyboard Undo/Redo. File
delivery uses a controlled synthetic drop; no native OS file-picker claim is
made. The ordinary page also runs all twelve cases in the default browser gate.

Validation: typecheck, 2247 passing Node tests, documentation contracts, build,
plugin surfaces and existing lifecycle resource checks. Logs are archived with
stored and decoded hashes in `artifact-hashes.json`; `source.json` binds the
maintained sources to the actual code commit. This is a bounded repair, not
complete historical comparison or acceptance of `BLOCK_IMAGE_SOURCES`.
The register remains 169 accepted / 40 open / 209 total.

The complete ordinary browser gate passes 64 executions across 60 distinct
pages (the existing inventory contains four repeated entries). The newly added
Image page contributes twelve cases. The documentation site builds successfully.

The initial invalid data-URL experiment appended a fragment to an image data
URL; the sanitizer correctly rejected that input. Those failures are probe
errors and are excluded from the regression claim. Correct valid-input RED
evidence is retained separately. The first native run selected the hidden
dropzone Library button on populated images; the final fixture selects the
visible control. Existing exact content/history assertions are unchanged.

Reproduce from the repository root with installed dependencies and Chromium:

```sh
EDITOR_BROWSER_PAGE=image-source-ownership.html node tests/browser/run.mjs
EDITOR_NATIVE_PAGE=native-image-source-ownership.html node tests/browser/physical-history.mjs
EDITOR_NATIVE_PAGE=native-image-source-ownership-trusted.html node tests/browser/physical-history.mjs
```
