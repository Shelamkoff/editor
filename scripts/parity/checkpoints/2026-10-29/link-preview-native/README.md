# LinkPreview native URL and cancellation checkpoint

The independent LinkPreview patch repairs native URL card completion and input restoration during Undo, and makes canceled metadata work yield to a newer URL. It changes no core code or public contract.

## Executed evidence

- The two standalone default/populated native cases failed against the original `1547de28ee66498d649555d69e212b58be7fcf31` runtime: canonical URL input succeeded but the visible card retained old or empty metadata. The corrected driver delivers each URL character through the existing real native input helper.
- A native cancellation regression failed after the first repair: an external abort callback authored a successor URL, then the obsolete view projection replaced its card. The minimal projection identity/generation guard stops that write.
- Native Enter resubmission of the same URL separately failed by requesting the superseded URL again after cancellation. The existing acquired-task snapshot now checks its canonical URL before calling the external provider, inside its cancellation/finally boundary.
- The final isolated LinkPreview patch passed **19 native tests and 18 existing input-lifetime unit tests**. `manifest.json` records both gates passed with unchanged source identities. The native gate includes the two ordinary default/populated URL/history cases, both cancellation controls, readonly/retired timer rejection, all seven templates, existing metadata/Delete/menu cases and four block-menu history operations.

Each basic native case checks canonical records, visible card metadata, input value, stable block/input hosts, trusted native input, exact one-action Undo/Redo, native caret and transaction accounting. The readonly/retired control also proves no provider call or successor author change occurs after disposal.

The initial default native attempt incorrectly passed an entire URL to a driver command that requires one character. `native-basic-invalid-driver-attempt.log` retains that harness error; it is not a production RED. `native-basic-red.log` is the corrected actual two-case RED. The existing task-acquisition revocation unit test also exposed an extra early snapshot read during development; the final conditional view completion preserves that test and keeps the provider snapshot inside the existing task boundary.

## Source and reproduction

The final verification used `/tmp/rector-link-preview-red-baseline-1547`, original core at `1547de28`, Node 24.22.1, and Chrome for Testing 156.0.8078.47. The new fixture and production patch were frozen but not committed in that checkout; exact tracked patch, untracked fixture, dependency symlink and tested-file hashes are in `manifest.json` and `verification.json`. This run does not contain the concurrent Poll or core field-completion changes.

From a checkout with the exact patch and dependencies, initialize a fresh verification run and execute:

```sh
node plugins/link-preview/input-lifetime.test.js
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-controls.html \
EDITOR_NATIVE_FILTER=LinkPreview \
node tests/browser/physical-history.mjs
```

Retain a new C11 manifest for a replay. The archived manifests/logs are immutable executed evidence, not a claim about a later integration commit or remote CI. This focused repair does not accept the full LinkPreview ROUNDTRIP register row or broader functional parity; the independent shared differential remains separate evidence.
