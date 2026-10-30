# Continuation integration checkpoint — 2026-10-30

This archive preserves the two completed C11 integration attempts `run-AapPg2` and `run-r6iBZN` from `/tmp/rector-continuation-20261030`. Their raw manifests and failed outcomes are unchanged. This is historical integration evidence, not the final combined65 acceptance run. `run-2Zb0Ur` is deliberately excluded; its owner will archive that run after completion.

## Frozen sources and outcomes

| C11 run | Frozen source | Overall result | Source stability |
| --- | --- | --- | --- |
| `run-AapPg2` | `9a60deb51a6f1906a9ad4a17080deedc52b2426a` | Failed | Clean; unchanged throughout |
| `run-r6iBZN` | `061471080da7438f0f73d09bba8a444e8d9d5bda` | Passed | Clean; unchanged throughout |

Both runs use lock SHA-256 `91874afdcfbe533e607429bdaa3e0a4cbf9d671410831dbeb1d62d4d5d266382`. Exact tree hashes, source identities, commands, environments and intervals remain in each original manifest. `summary.json` is a derived index and does not replace those manifests.

## Initial failed run: run-AapPg2

| Gate | Recorded result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | **1,986 passed / 1,987 tests; 1 failed**, zero skipped/cancelled |
| `npm run test:types` | PASS |
| `npm run test:package` | **FAIL — ENOTCACHED** |

The unit failure is `person renderer ignores a queued resize callback after destroy`: the unit fixture's `FakeElement` lacked `append`, and production rendering threw `TypeError: list.append is not a function`. Test-only commit `061471080da7438f0f73d09bba8a444e8d9d5bda` supplies the missing DOM stub behavior and strengthens the oracle: detached output already contains both profiles, firing a retired observer must not read geometry, and the original list/cards must remain intact. The exact patch is retained under `source/`; the failed unit log is preserved as it was.

The package failure requested the pinned Carousel codeload archive `f7f6485886a1d77f9213d9079eb70000efeff499` from an empty disposable cache while using `npm install --offline --ignore-scripts`. npm reported `ENOTCACHED`. Supplying a same-name direct file tarball had not populated the original Git edge. This archive retains that failed attempt. Later package-gate fixes and their passes belong to their separate checkpoints; neither historical run here is relabelled as a package pass.

## Combined61 run: run-r6iBZN

| Gate | Recorded result |
| --- | --- |
| Unit tests | **1,987 / 1,987 PASS**, zero failures/skips/cancellations |
| Three-source block roundtrip differential | **61 selected cases; candidate 10,740 / 10,740 observations PASS** |
| Native roundtrip preservation | **61 / 61 PASS** |
| Native core behavior | **66 / 66 PASS** |
| Runtime contracts | **105 / 105 PASS** |
| Projection contracts | **146 / 146 PASS** |

The differential compared v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, spec baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`, and candidate `061471080da7438f0f73d09bba8a444e8d9d5bda`. Its source identity checks passed. Candidate has no failed observations, unexpected failures, page errors or runtime errors. The existing reference classifications remain explicit in the raw log: v1 has 1,065 classified differences and 10 unsupported reference cases; spec baseline has 151 classified differences, 19 incomplete cases and a classified error/page-error pair. All sources retain five explicitly not-applicable authoring cases. These are not silently counted as exercised candidate authoring phases or erased from the evidence.

`run-r6iBZN` did not run the package gate. Passing these selected suites does not claim completion of unexecuted work or overall v1 functional parity.

## Gallery observation count: 703 → 685

The four Gallery cases retain the same case IDs and observation identities except for exactly 18 conditional retired-field checks:

| Gallery case | Isolated observations | Combined observations |
| --- | ---: | ---: |
| Default | 82 | 82 |
| Populated | 207 | 201 |
| Populated with widgets | 207 | 201 |
| Populated with widgets, unwrapped control | 207 | 201 |
| **Total** | **703** | **685** |

The fixture runs `galleryRetiredActionsLeaveCanonical`, `galleryRetiredActionsLeaveHistory` and `galleryRetiredActionsLeaveFields` only inside `if (retiredFields.length)`. After the host-retention fix, Undo and Redo keep the same Gallery caption hosts, so there are no retired fields for those three populated cases. The difference is exactly **3 cases × 2 history phases × 3 conditional checks = 18**.

The conditional code remains present in the frozen fixture. No other observation identity disappeared, none were added to hide this reduction, and completed phases plus trusted-event type sequences remain unchanged. All retained Gallery observations pass. The merged Gallery extraction matches the combined candidate log exactly. Original value payloads, including generated IDs, remain untouched.

`gallery/gallery-count-isolated.json.gz` and `gallery/gallery-count-merged.json.gz` preserve the supplied extracts losslessly. `gallery/observation-count-audit.json` enumerates every difference by case, phase and property. `gallery/block-roundtrip-fixture.js.gz` is the immutable fixture from the combined commit and matches the fixture SHA-256 recorded by the differential run.

## Artifact layout and integrity

- `runs/`: raw original C11 manifests and deterministic gzip-compressed gate logs.
- `supervisor/`: exact original fast/combined61 configs and statuses, plus compressed supervisor logs.
- `gallery/`: unchanged observation extracts, the frozen conditional fixture and the derived count audit.
- `source/`: the test-only Person DOM-stub correction explaining the unit RED/GREEN transition.
- `summary.json`: machine-readable counts and source/result mapping.
- `hash-index.json`: SHA-256 and byte lengths of stored and decompressed bytes, source paths and compression method.
- `hash-audit.json`: completed storage/source audit and the hash of the index itself.

Every `.gz` is made with gzip level 9 and `mtime=0`; decompression is byte-for-byte equal to its original. JSON manifests, configs and statuses are copied directly, without reformatting. The archive audit also checks that all original filesystem sources still equal their copied bytes and that the excluded final run has no archived directory. The hash index excludes itself and the audit report to avoid a circular digest; the audit records the index hash.
