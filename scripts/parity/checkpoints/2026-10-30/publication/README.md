# Publication source mapping — 2026-10-30

The user explicitly authorized publication during this continuation. The console
Git client had no credentials, so the authenticated GitHub Git Data API published
each completed change as a separate commit. Every created tree was checked
against its original local tree. The branch advanced without force from
`355577fce341e77bead7d69705744db724f1b79f` to
`132b59923de9bc6b1f3b3f73ba48c6d1f040826a`.

`source-map-first-batch.json` records all 17 original/published commit pairs,
their identical trees, ordered parents and original raw commit objects. A fresh
Git fetch independently verified every published tree and parent. The local
branch then moved to the identical published tree; the original local chain
remains on a preservation branch. No source file or test result was rewritten
to make these identities match.

The earlier fourth-integration reports correctly describe the rejected push at
their verification time. This later successful publication supersedes their
publication status, not their tested sources or results. In particular, tested
implementation `6f5f4ff5205a25adfd00cef6d5b2279c068db633` is published as
`d12b87ee39a92a376298d01fcdce7398314811a3`, with the exact same tree
`cb4e9b2dd903177c946e93de97a95e5d41d9ec6a`.

## Restoring recorded original commit objects

After fetching this branch, the raw objects in the map can restore original
source names used by historical evidence. This writes immutable commit objects;
it does not move a branch or modify the worktree. Their trees already belong to
the published history.

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const names = ['first-batch', 'second-batch', 'docs-repair', 'reports', 'sixth-root', 'sixth-agents', 'sixth-completion']
for (const name of names) {
 const map = JSON.parse(readFileSync(`scripts/parity/checkpoints/2026-10-30/publication/source-map-${name}.json`, 'utf8'))
 for (const entry of map.commits) {
  const actual = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    input: entry.rawCommit, encoding: 'utf8',
  }).trim()
  if (actual !== entry.local) throw new Error('Recorded commit hash mismatch: ' + entry.local)
 }
}
JS
```

This map establishes exact source equivalence. It does not add a new test run,
accept a preservation row or claim that original author/committer metadata was
retained by the GitHub API.

## Runtime and documentation-output continuation

`source-map-second-batch.json` retains the next ten Code, formatting, Table and
evidence commits. Tested source `a7dc4172198dea9c641f5de41d4331e5a94a17b4`
is published as `0fbe8c78d3dcc14d8a619cc152f08d6343cb3952`; both trees are
`500d124440261953986dac14afa51d444f35ac5c`.

`source-map-docs-repair.json` retains the one-line VitePress generated-output
ignore repair: local `369cf74e33f982eed78d5a8171e98b46e13f9fbb`, published
`ae79a89c66c9b4b467e149dcaf45db2c99b0f617`, identical tree
`dccd6e5ca1d77ea087c1ec5ac5dc1589b6240c22`. The original combined run records
11 passed gates and a documentation cleanliness failure after an exit-0 command;
the separate documentation repair run records three passed gates on unchanged
source. [The integration checkpoint](../fifth-integration/README.md) retains both
original outcomes and explains their different source identities.

These eleven commits were published together with a non-force, expected-head
update from `132b5992` to `ae79a89c`. A fresh fetch verified every tree, original
object hash, message and mapped parent before the local branch moved to the
identical published tree. The previous local chain remains on a preservation
branch. Final report and documentation validation records follow separately.

## Final reports

`source-map-reports.json` retains the documentation/evidence commit verified in
`run-CgSk72`: original `ab81ae7983e1fd22e1fc7b5ce96b5643d089172f`, published
`6986b4db2804af6f02eaacd1dbd71d1a133e7dec`, identical tree
`a82fadf7df2eebfdb8993de8671d5d4abad570d7`. Its three documentation/build gates pass on
unchanged source; their original records are archived in the
[integration checkpoint](../fifth-integration/README.md#final-documentation-verification).
The subsequent archival commit only retains these completed results and this
source map; it does not claim another test run.

## Sixth continuation

`source-map-sixth-root.json` retains two Heading/List verification commits; final
original `d483be745b0bc00f40a89b823a12f993f1ae21f8` is published as
`220d4553b6d72396fddaeb15aa426a2f779c1744`. `source-map-sixth-agents.json` retains
twelve integrated Tools, Columns and Raw commits. The focused native source
`24cc569c2fdcb3f115417ae895a01084858cdf67` is published as
`0cceb84eceeb6299f2338ac4798ff40e9aa36ec8`, identical tree
`a3a77a3670e6b17f8000b4cd95720eec1a7edc2a`. Both batches advanced the remote branch
without force using the observed expected head. Fresh fetches verified all 14
trees, parent links, messages and original commit-object hashes before moving
the clean local branch to each identical published tree.

The [sixth integration checkpoint](../sixth-integration/README.md) records the
new focused verification and unchanged production-source relationship to the
previous full run. Later reporting fixes and documentation have separate source
identities; these maps do not add another test execution.

## Sixth completion and documentation repair

`source-map-sixth-completion.json` preserves five further exact-tree mappings:
Heading/List evidence, the comparison-reporting repair, the eight-row acceptance
report, integrated evidence and the Russian prose correction. The checked
documentation-repair source `65c3179840b9df3b50b6df680f88df929f3956e6` is
published as `d67229c08f5fae7101cb2a252f2d56385224da08`, identical tree
`93b95eff7a2511c5e4be209d561a980e610f62a3`. The non-force update used the
expected remote head; a fresh fetch verified all five trees, messages, mapped
parents and original object hashes.

The [documentation record](../sixth-integration/README.md#final-documentation-verification)
keeps the original translation-gate failure and the successful site-only repair
separate. Their publication mapping adds no new test result.
