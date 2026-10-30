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
const map = JSON.parse(readFileSync('scripts/parity/checkpoints/2026-10-30/publication/source-map-first-batch.json', 'utf8'))
for (const entry of map.commits) {
  const actual = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    input: entry.rawCommit, encoding: 'utf8',
  }).trim()
  if (actual !== entry.local) throw new Error('Recorded commit hash mismatch: ' + entry.local)
}
JS
```

This map establishes exact source equivalence. It does not add a new test run,
accept a preservation row or claim that original author/committer metadata was
retained by the GitHub API.
