# Browser environment attribution correction — 2026-11-03

Primary CDP logs correct patch versions in the descriptive prose. The original
results and source identities are unchanged:

| Run | Source | Actual browser product | Gates |
| --- | --- | --- | --- |
| `run-A9Taxq` | `a008b32f` | `Chrome/156.0.8078.79` | 19 PASS |
| `run-DLyD1O` | `13b79cc6` | `Chrome/156.0.8078.80` | 20 PASS |
| `run-xxJbdd` | `f2070510` | `Chrome/156.0.8078.80` | 21 PASS |

The Code/Marker, task/read, mode-recovery, continuation and optional-inline
raw comparative corpora also record `156.0.8078.80`. Their human descriptions
previously repeated `.79`; those descriptions are corrected. Original raw
observations, reports, manifests, exit codes and all existing hashes are kept.
Earlier `.79` records retain their actual environment and are not relabelled.

The full 20/21 integrations and current scoped runs already use `.80`. This
correction is metadata reconciliation, not a fresh integration execution,
behavioral change, new acceptance or a claim that the native union was rerun.
The register remains 92 accepted / 117 open.

The three original browser logs and manifests are retained verbatim as gzip.
`manifest.json` binds each observed CDP product/revision to its source, command
result and original manifest hash; `artifact-hashes.json` covers stored and
decoded bytes. The first browser-log line is the actual `Browser.getVersion`
response, not the executable's file metadata or an inferred version.
