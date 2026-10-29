# Person derived presentation repair — 2026-10-29

This checkpoint records the bounded Person production repair and its test-first
history. It does **not** accept the full Person ROUNDTRIP or complete v1 parity.
The shared ROUNDTRIP fixture and its historical classifier are a separate slice.

## What changed

The default tab fallback now contains its ordinal when no plugin locale exists.
The active tab derives its label from the exact completed name field, including
real Mention and Color projections. A sibling edit or reorder can retain that
field, its widgets and backward native selection; `renderTabs()` uses the retained
field without requiring a completion callback for unchanged content. The renderer
parses each name once and uses the same fragment for its visible name and avatar
alternative text.

Person `update(next, previous)` compares the documented canonical predecessor.
It no longer compares decorated widget DOM with token-bearing canonical HTML.
A peer test exposed a further case: removing the active first profile changes the
active ID before `update()` runs. The final guard retains a body only when its
captured profile ID still matches, so avatar and link controls cannot remain from
the removed profile. Exact captured node paths and lifetime checks protect stale
listeners and moved source/target nodes. Whole-block admission remains in core.

## Evidence and results

| Stage | Immutable source | Actual result |
| --- | --- | --- |
| Ordinary tests before repair | `8b0bf9fc106303b442362752e35804724694189f` | 103 PASS, 10 FAIL out of 113; existing 100 controls pass |
| Trusted native preedit before repair | `2af64ae1d06bc774a96b6209966477664414b6ac` | 2 FAIL; canonical preedit and exact predecessor controls pass |
| Initial production repair | `72a7c40462b55eb0b94d99f80795ed2317a7e3ab` | Ordinary 113 and native 2 pass; aggregate remains FAILED because separate raw reference differences were unclassified |
| Peer active-profile removal test | `35f3da5c20f1b334e8befe5b6413d36d18c0fc69` | 113 PASS, 1 FAIL; stale avatar/link controls reproduced |
| Final production guard | `3eeaedb878ea02111910a6f8d8889e9edc66169f` | Ordinary 114/114, native Person 17/17, Node 14/14 PASS |
| Final fresh type checks | `14546d61c89785a6164ca230e553b8dd58215bea` | Both checkJs configurations PASS; all six delivered file hashes match the final production guard |

Every recorded C11 gate reports unchanged source. The source manifests explicitly
include the unchanged external `node_modules` symlink; this is not a claim that
the entire checkout had no untracked paths. Chrome evidence uses the recorded
Chrome 142 executable. The retained invalid first launcher command started no
browser or gate and is not counted as a failed test.

`manifest.json` records original and stored SHA-256 hashes for every evidence
file. Gzip logs preserve the exact original bytes; compression has a fixed mtime.
The source patch contains only the six production/test files. `tdd.mbox` preserves
five separate test-first and production stages. It excludes the shared fixture,
including two auxiliary-label assertions from the original first test commit.
All executed focused test modules and the delivered runtime are byte-identical.

## Replay

Use the immutable commits above in an isolated checkout with the locked project
dependencies. Alternatively, apply `tdd.mbox` to the recorded production base
`fe44cc57f5cbac1daffd031f5c8e791d707fb828`. The five-stage mbox was also applied
cleanly on main source `fdd136f0967178f38e8dbf7f52a11c749e99502f`, and all six
resulting hashes were checked against `manifest.json`.

```sh
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome EDITOR_BROWSER_PAGE=projection-contracts.html node tests/browser/run.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-plugin-controls.html EDITOR_NATIVE_FILTER=Person node tests/browser/physical-history.mjs
node --test plugins/person/reconciliation.test.js renderer/renderers/person/lifecycle.test.js
node node_modules/typescript/bin/tsc -p jsconfig.json
node node_modules/typescript/bin/tsc -p jsconfig.runtime.json
```

For the initial two native failures, use the narrower recorded filter
`Person derived native preedit`. Exact commands, environment, times, exit codes
and source identities are retained in each C11 manifest. Browser paths are local
environment observations, not a promise that an arbitrary machine has that binary.

## Remaining boundary

**Inactive rich-name tabs remain OPEN.** An unprojected name has no completed
editable field or authorized inline decoder port. This repair does not synthesize
fields, decode sidecars by hand, clone widgets, cache stale projected text, or make
canonical no-op writes. A separate positive test proves that focusing the hidden
profile creates its actual rich field and completes its readable active label.
The full ROUNDTRIP classifier and whole-library acceptance require their own
review and recorded gates.
