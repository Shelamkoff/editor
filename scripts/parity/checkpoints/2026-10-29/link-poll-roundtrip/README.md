# LinkPreview and Poll ROUNDTRIP checkpoint

This checkpoint accepts only `BLOCK_LINK_PREVIEW_ROUNDTRIP` and `BLOCK_POLL_ROUNDTRIP`. It extends the existing 47-case public fixture to **53 cases** and records the unchanged tested source `34439ee106a82ea7cbf4535aa151e6458866f149`. The register reaches **32 accepted / 177 open** rows. It does not accept detailed provider, voting, template or option-control rows or full editor parity.

## Final executed gates

All eight gates in `final53-manifest.json` passed on one unchanged source identity under Node 24.22.1 and Chrome for Testing 156.0.8078.47.

| Gate | Result | Elapsed |
| --- | --- | --- |
| Three-source differential | 53 cases; candidate 9,129/9,129 observations passed | 121.999 s |
| Standard native ROUNDTRIP page | 53/53 cases passed | 41.920 s |
| Ordinary projection contracts | 121/121 cases passed | 5.553 s |
| Native Poll controls | 14/14 cases passed | 9.403 s |
| Historical-classifier sensitivity | 141 historical vectors recognized; 2,271 negative variants rejected; 3,044 passing observations rejected as exceptions | 0.852 s |
| Typecheck | Both source/runtime configurations passed | 9.454 s |
| Plugin source audit | Passed | 1.261 s |
| Extension README validation | Passed | 0.648 s |

The candidate's six new cases contribute **1,184 passing observations**: Poll default 198, its three populated controls 204 each, LinkPreview default 184 and populated 190. Every new candidate case completes load, both mode transitions, real native edit, exactly one Undo/Redo and disposal. The cumulative trace preserves 781 raw v1 differences and 79 raw specification-baseline differences. Their exact classifiers leave no unexpected failures in any source. The baseline's one existing Embed error is still retained in both raw channels and separately paired by its existing classifier. Fifteen baseline cases remain explicitly incomplete, including both Poll widget cases after load; they are not additional passes. Four empty-block authoring scopes remain explicitly not applicable in each source.

The runner verified loaded Git source/style bytes for 218 v1 files and 241 files in each current-format source, plus 64 dependency files. No candidate page/server error occurred. The raw differential ran 2026-10-29 23:04:17.341–23:06:18.575 UTC. Its decompressed SHA-256 is `285a3287d606315e03f6f3cc9201b415510d832f39eaa1345cd881023b0ad419`.

## Behavior and honest reference limits

Poll includes an actual empty default, a populated literal question/options control and separate wrapped/unwrapped Mention/Color controls. Fixed local totals, percentages, selected answer, IDs/order, marks, sidecars, fields and all three renderer contexts remain independent expectations. Native question input preserves sibling option data, results and neighbors. Intentionally rebuilt author hosts must be detached and unable to author through retired input/blur callbacks. Separate ordinary/native tests cover an actual option edit, one Undo/Redo, widget-data updates with a backward range, runtime-only result rebuilding, a foreign result label and adoption of the entire Poll wrapper.

Pinned v1 Poll and its actual abstract base contain no `mapTextFields` hook. The public v1 inline insertion gate rejects blocks without that hook. The default/literal cases therefore establish meaningful v1 parity, while the two sidecar cases explicitly record unsupported reference capability and prove the supported current capability. Their input sidecars and raw failures are retained; no adapter removes them. `source-facts.json` identifies the exact source files and hashes. Only v1's generated default block and two option identities are captured; their validity/count and all author data remain fixed.

LinkPreview checks empty and populated construction, literal HTML-like metadata, exact URL/media attributes, read-only controls, native URL entry, clearing previous metadata, visible card completion and input/caret restoration during one Undo/Redo. No provider is configured for these basic cases. The standard native driver sends each URL character through its existing native input helper, matching the browser differential's real keyboard typing.

The separate `../link-preview-native/` checkpoint records 19 native LinkPreview tests and 18 existing unit tests on original core without the concurrent Poll/core changes. It includes independently reproduced native card/history defects, cancellation callbacks that author a successor URL, same-URL resubmission and readonly/retired-timer negative controls. The LinkPreview runtime was subsequently published as `f8df108cb03de7cde39261bffd1006c9cd2a116f`; this checkpoint does not substitute its frozen source for a later integration or remote CI run.

## Repairs, failed attempts and classifiers

Poll result labels previously rendered canonical widget tokens. The plugin now derives readable labels with allowed author marks from its exact completed option fields, without cloning widget instances. It uses the accepted `afterProjection` hook and the reviewed native-source completion path; there is no direct option input listener. The shared core patch is identified in `verification.json` by SHA-256 `03e772ca1c7275324cf6634ba750f185c4a2c7239f39b9dc5bd242eb69a11f7d`.

The archive retains the original Poll 24-assertion differential RED, ordinary/native REDs, and the initially incomplete completion fix. A direct input-listener attempt made the ordinary native edit pass but failed the whole-wrapper adoption control; it is absent from the accepted source. One positive formatting fixture initially placed class/style on a tag that the existing sanitizer does not support for those attributes. Its failed trace is retained as an invalid oracle attempt, and the corrected fixture uses a supported SPAN around the same B author mark. The sanitizer and expected readable labels were not weakened. The final ordinary suite includes both label and whole-wrapper ownership negatives.

LinkPreview's original shared differential had five candidate failures in card completion and Undo input/caret restoration. Native submissions can already be canonical no-ops, so the plugin completes their own visible card when its cached URL is stale. Host updates and Undo compare against the accepted canonical predecessor. Metadata cancellation can call application code synchronously; a superseded projection stops, and metadata acquisition checks its current canonical URL inside the existing task cancellation boundary. Exact RED/GREEN traces, including the earlier unit-boundary failure and corrected cancellation cleanup, remain recorded as preliminary evidence.

`link-poll-roundtrip-classifiers.mjs` never changes input or expected values and cannot classify a candidate failure. Each historical exception binds the source, exact scenario, phase completion, independently fixed author records and actual/expected values; caret/focus exceptions also require exact native owners. The separate classifier hash is checked before and after the run. The sensitivity script checks changed sources, values, properties, phases, statuses, IDs, owners, author records and unrelated execution errors. Page errors remain subject to the runner's existing independent accounting.

## Artifacts and reproduction

`full53.json.gz` decompresses byte-for-byte to the executed JSON. Native, projection, audit and typecheck outputs and the C11 manifest are exact copies, with original paths, timestamps, counts and compressed/raw hashes in `verification.json`. `preliminary-evidence.json` identifies the earlier attempts separately; none is silently substituted for the final run. `tested-code.patch.gz` preserves the relevant runtime, core, tests and shared harness changes against `1547de28ee66498d649555d69e212b58be7fcf31`; its uncompressed SHA-256 is `bc81c391d96c8cdd482c0c2e72c03fb0935cdf482053d3cfbc461803a1593065`. Checkpoints are excluded from that reconstruction patch to avoid recursive evidence.

The original checkout was `/tmp/rector-roundtrip-link-poll-1547`. Its only untracked entry during final verification was the external dependency symlink, recorded by C11. Runtime Git objects, fixture/runner/classifier hashes and loaded dependency hashes are retained in the trace. To replay from a published checkout, use its actual Git identity and record a new run; do not report a new execution as the archived private source commit.

```sh
EDITOR_V1_ROOT=/path/to/v1-5e5c7f8 \
EDITOR_SPEC_BASELINE_ROOT=/path/to/e981ff3 \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
node scripts/parity/block-roundtrip.mjs

EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html \
node tests/browser/physical-history.mjs

node scripts/parity/checkpoints/2026-10-29/link-poll-roundtrip/classifier-sensitivity.mjs
```

The original baseline archives were `/tmp/rector-v1-5e5c7f8` and `/tmp/rector-e981ff3`; source identities remain the pinned hashes listed by the runner. Playwright was the installed runtime module under `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`, and Chrome was `/tmp/rector-browsers-156/chrome-linux64/chrome`. The shared guide `scripts/parity/block-roundtrip.md` documents semantic boundaries and adapters. Gallery, Carousel, Person and the detailed behavior rows remain open.
