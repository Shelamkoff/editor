# Merged upstream parity evidence and reporting review

Normal merge `19cea0f8b8715c171b839cf6c3027ba66ea3f556` retains the local
runtime continuation and newly published upstream
`414c6af17e9ec8bab4bde6ac0026e653bb1ed9ab`. Neither history was rewritten.
The last general library run remains attributed to `1c933545`; the complete
native runner retains its own `c6e537e5` source.

## Exact integration scope

The recorded `final-merged-source-equivalence.json` verifies that all changes
from `1c933545` to the merge are Markdown, archived evidence, and exactly four
standalone parity runners. Runtime, ordinary/native fixtures, dependencies,
build source and CI configuration are byte-identical. The changed runner
files are byte-identical to upstream `414c6af1`.

The four runners now reject empty or incomplete result sets, missing or
unsupported candidate results, empty observations and incorrectly ordered
phases. Their fresh browser comparisons are recorded separately from this
reporting review.

## Independent acceptance review

[The bounded review](upstream-eight-rows-assessment.md) checks the actual
fixtures against the eight newly accepted upstream preservation rows. It
recomputes 23,382 saved raw verdicts, verifies 85 indexed payloads and 1,619
loaded production-file hashes, and checks the original fixture hashes.
The four original candidate corpora contain 102 cases and 8,696 observations
without failures or unsupported candidate cases. This is an independent
inspection of retained evidence, not a new browser execution.

The upstream acceptance is preserved: **209 unique IDs, 54 accepted and 155
open**. Exact post-settings caret, absent v1 UI, broader platform coverage,
B-HTML/B-STYLE and neighboring obligations retain their recorded limits.
The unknown original Heading shell exit, historical page errors and failed
assertions are not replaced with successful outcomes.

## Actual reporting controls on the merge

`run-1xxk7F` passes on clean, unchanged `19cea0f8`: **62/62 controls** execute
the actual aggregation/reporting blocks from the four runner Git objects.
The original upstream helper is adapted only at its repository and output
directory constants; `adaptation.json` records both hashes and those two
path changes. The checks cover successful complete results and deliberately
invalid or incomplete results, with explicit historical-unavailability and
historical-failure controls. They do not launch a browser.

`verification.json` indexes the original manifest, complete logs, controls,
source-equivalence receipt and independent upstream review. Every payload was
verified against its original bytes; compressed files retain both hashes.

## Publication boundary

Upstream `414c6af1` was fetched successfully. New local continuation commits
have **not** been pushed. The retained bounded GitHub write probe timed out;
the expected immutable object subsequently returned 404. No automatic
approval-review rejection was returned. The CLI has no available GitHub
credentials. The fallback delivery is a Git bundle. Its final commit, complete unpublished
parent history, checksum and independent recovery result belong to the separate
delivery manifest after all local evidence and documentation are committed.
