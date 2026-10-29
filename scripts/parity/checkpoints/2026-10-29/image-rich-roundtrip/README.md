# Image caption-widget ROUNDTRIP checkpoint

This checkpoint records the two Image widget-caption cases added to the existing literal/default cases. It preserves the executed evidence and the exact supporting scripts. It changes no production code.

The candidate production source was `fe44cc57f5cbac1daffd031f5c8e791d707fb828`. The fixture was committed as `daeca9e976f60caa3e37728e0ed8cc12dd914857`; the final runner and guide were recorded as `93dda99fc3b9a7d471d7f1a2d24f503dfdb40e97` after their unchanged bytes passed verification. The cumulative three-file patch has SHA-256 `9ab57b6b3861508a790814cf20963743eb939aeb0301b7023a72648880bc3dc0`.

## Executed results

| Gate | Executed result | Time |
| --- | --- | --- |
| Initial two-case differential, before new Image classifications | Candidate 392/392 observations passed; 132 v1 differences and seven spec-baseline differences remained raw, so the gate exited 1 | 8.317 s |
| Final 47-case differential | Candidate 7,945/7,945 observations passed; no unexpected differences or page errors in any source | 107.792 s |
| Standard native ROUNDTRIP page | 47/47 cases passed | 35.539 s |
| Offline classifier sensitivity | All 139 observed historical vectors classified; all 2,093 negative variants rejected | No browser run |

Both final gates used Chrome for Testing `156.0.8078.47` and recorded unchanged source identities. The candidate Image cases contributed 670 passing observations: 82 for the empty-source default and 196 each for the literal, wrapped-widget, and unwrapped-widget captions. The two new cases use the real Mention and Color definitions, preserve sidecars, and execute native caption editing plus exact one-operation Undo/Redo.

The final differential retains 651 raw v1 differences, 68 spec-baseline differences, and the separately attributed existing Embed redo page error. These are classified historical observations, not additional candidate passes. Thirteen spec-baseline cases remain explicitly incomplete after an execution failure. Four empty cases have explicit authoring/history phases that do not apply; they are not incomplete failures.

## What is preserved

`raw2.json.gz` and `full47.json.gz` decompress byte-for-byte to the actual JSON outputs. `native47.log`, `raw2-manifest.json`, and `final47-manifest.json` are exact copies of the native output and C11 manifests. Their original paths, compressed and decompressed hashes, timestamps, source identities, and counts are in `verification.json`.

`classifier-sensitivity.mjs`, `classifier-sensitivity.json`, `source-facts.json`, `raw-probe-wrapper.py`, and `final-gates-wrapper.py` retain their original executed or recorded bytes. In particular:

- Checker source SHA-256: `0f65e2734432f27cfea6115a102b340b28a1cb22f1110f3b16248c3023d90112`.
- Checker result SHA-256: `4c13391c660cfe6aacf74f42b415f5b854ce72f916ef8247d3de101e1302b10d`.
- Raw two-case JSON SHA-256 after decompression: `db0b1db7461ef244b12b17b1cfca334f1d50978c77091e885a0b1b99a2948f49`.
- Final 47-case JSON SHA-256 after decompression: `46b00751b8326ae547cbc48b4aec379baabe5f38157b296017f7034d2b1a1655`.

## Reproduction requirements

These are immutable session sources, not a portable CI runner. The two wrappers and checker contain actual absolute paths and output names. Preserve these files and adapt a copy when replaying in another workspace. Do not overwrite the archived evidence with a fresh run.

The original environment used Node `24.22.1`, Python 3, and these paths:

- Candidate checkout: `/tmp/rector-image-rich-roundtrip-20261029`.
- v1 archive: `/tmp/rector-v1-5e5c7f8`, source `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.
- Spec baseline archive: `/tmp/rector-e981ff3`, source `e981ff308000c1d92d7e820df95113c1e19bcee8`.
- External dependency symlink target: `/workspace/scratch/61a2ad7355f4/editor/node_modules`.
- Playwright: `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`.
- Browser: `/tmp/rector-browsers-156/chrome-linux64/chrome`.

The source Git objects must be available to the differential runner for byte verification. The dependency versions and 64 loaded dependency hashes are recorded in `verification.json`; they do not claim to hash the entire external dependency installation. C11 recorded the final runner/guide worktree patch and external symlink, so the original verification checkout was frozen but not completely clean.

For the initial raw probe, use the initial fixture commit `daeca9e976f60caa3e37728e0ed8cc12dd914857`, whose runner has no new Image classifier, and invoke a copy of `raw-probe-wrapper.py` with arguments `raw2 BLOCK_IMAGE_ROUNDTRIP/populated-widgets`. Its exit 1 is the recorded unclassified historical result. For the final pair, use the exact three tested files recorded in `verification.json` and a copy of `final-gates-wrapper.py`; it runs the differential and native page sequentially.

For the original offline sensitivity result, restore the decompressed `raw2.json.gz` to the checker's recorded raw path and make the recorded final runner available at its recorded path. The checker imports only the classifier prefix; it does not launch a server or browser. A new browser trace will have new timestamps, generated IDs, origins, and hashes and must receive its own provenance.

## Acceptance boundary

Pinned v1 Image and its abstract base declare no `mapTextFields` hook, and the v1 public insertion gate rejects blocks without that capability. The exact source references and hashes are in `source-facts.json`. The new widget-caption cases therefore establish the current supported capability while exposing v1's lack of persistent caption widgets; they do not invent v1 widget support.

The two new cases retain 114 v1 unsupported-capability observations, 16 v1 mode/history remount observations, two v1 first-Undo caret observations, six spec-baseline derived-alt observations, and one spec-baseline formatted-widget mode failure. The latter completed only load; its six later phases remain incomplete. Candidate exceptions are excluded, and the original 45 case specifications remain unchanged.

This evidence covers the common Image ROUNDTRIP template with the accepted `afterProjection` implementation. It does not accept every Image upload/cropper/control action, substitute for the separate lifecycle/adoption/precommit tests, establish a later remote CI result, or prove full editor parity.
