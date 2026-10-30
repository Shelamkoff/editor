# Combined 65-case integration — 2026-10-30

This checkpoint retains the first unfiltered 65-case integration attempt and its original failed whole-run outcome. The candidate's three-source differential passed; the full browser command later exposed three Gallery failures. Those facts are separate. Later repairs and continuation gates must retain their own frozen source and result records.

## Initial immutable source

- Local commit: `9ccae3589fed3cc9f601fdf847654efbdcb1d584`.
- Tree: `49caefb7386d24612c36a86e603cfa634da9c178`.
- C11 run: `run-2Zb0Ur`; overall **failed**, `sourceUnchanged: true`.
- Git Data tree-equivalent commit: `92d71b74d34662eb959c7737a4662a9c61aee152`. The mapping file records exact tree equivalence, not a claim that its branch or CI had already completed at the original test time.
- Installed Carousel: immutable Git commit `f7f6485886a1d77f9213d9079eb70000efeff499`; the lock fingerprint is retained in the original manifest.

## Completed checks in the initial run

| Gate | Recorded result |
| --- | --- |
| Both typecheck projects | PASS |
| Unit tests | 1,997/1,997 PASS |
| Declaration contracts | 7/7 PASS |
| Unfiltered three-source ROUNDTRIP | 65 cases per source; candidate 11,458/11,458 observations PASS |
| Ordinary browser pages | All 36 PASS |
| Named native pages completed before the failure | 25 pages / 979 cases PASS |
| Next native page, `native-plugin-parity.html` | 228/231 PASS; three failures preserved |
| Following nine named native pages and heap gate | Not run in this attempt |

The initial physical-history sequence and six earlier native arrays precede the named page loop, but the failed command did not emit its final aggregate JSON. No counts for those unprinted arrays are reconstructed. This checkpoint does not call the interrupted browser command a successful complete run.

The differential preserves 1,156 raw v1 failure records and 183 specification-baseline records, including 21 incomplete baseline cases and the existing independently paired Embed error. None is silently converted to a successful historical observation. The candidate has zero failed observations, incomplete cases, browser errors or classifier exemptions. All three sources have zero unexpected failures. The 65 cases cover the exact 21-type built-in registry; this common template does not accept every detailed behavior row or whole-library parity.

The local Carousel WebM SHA-256 is `acc9e5c613e78cf0a6c73a18dabbb2662e090f0331e4f31cbc9f9f1f53499d75`. The runner checks unchanged source, dependency, fixture, classifier and media bytes. Complete observations, original commands and timing are retained in the raw records.

## Gallery failures exposed by the complete command

1. **Retired authoring controls:** the fixture changed only a caption, then required the former controls to be detached. The new caption-preserving path intentionally keeps that view. A valid retirement test must trigger an actual structural/media replacement and retain its strict stale-control assertions.
2. **Interrupted drag:** after a caption update preserved the view, the old image drag identifier remained active and blocked a fresh `Files` dragover. This is an actual runtime regression; it requires cancelling the obsolete drag without replacing healthy caption hosts or authoring extra history.
3. **Retired settings controls:** another caption/style update expected a full settings replacement. Its retirement stimulus likewise requires a real view replacement while keeping the old-controls/current-controls checks intact.

The raw page result keeps all three failures and their original messages. Correcting a fixture stimulus cannot stand in for repairing the actual drag regression.

## Files

`initial/manifest.json` and the supervisor config/status preserve their exact original bytes. Logs use deterministic gzip (`mtime=0`); `initial/hash-index.json` records compressed and original SHA-256 values and lengths. `initial-summary.json` is a derived index of the original raw results. `source-tree-mappings.json` identifies the tested local commits by their verified Git Data tree equivalents. Later result directories will be added separately after their own commands finish.
