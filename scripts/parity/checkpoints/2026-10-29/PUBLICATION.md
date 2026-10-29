# Publication provenance — 2026-10-29

The user explicitly confirmed publication to `Shelamkoff/editor`, branch
`refactor/rector-v2-architecture`. CLI `git push` could not authenticate in the
session. The connected GitHub app published the frozen commits through the Git
Data API, using a normal fast-forward update with the expected remote SHA.

The API assigns commit metadata, so published commit IDs differ from the local
verification IDs. Every individual source tree and the ordered published parent
chain were compared after fetching the actual remote objects. No working files
were reset, no source changes were combined, and no remote history was forced.
The verified original IDs and exact trees are recorded in the publication map.
`Local-source-commit` and `Local-source-tree` trailers provide the same mapping
where present; three continuation publications (`7bfa26df`, `3f2c9acf`,
`97fad198`) omit those optional message trailers but retain verified map pairs.

`publication-map.json` records the verified pairs through the stated
`verifiedThrough` revision. Its base64 values contain only the original Git
commit objects: tree/parent headers, author/committer metadata and commit
messages. File contents are already reachable through the identical published
trees. This is source provenance, not a test-result log or a runtime format.

## Reconstructing historical verification IDs

After fetching the branch, run the following from the repository root to make
the original commit objects available to an archived probe. It validates both
tree identities and each original commit hash before retaining a checkpoint
ref. It does not switch branches, alter the index or change working files.

```python
import base64
import hashlib
import json
import subprocess
from pathlib import Path

manifest = json.loads(Path(
    'scripts/parity/checkpoints/2026-10-29/publication-map.json'
).read_text())
for entry in manifest['commits']:
    published_tree = subprocess.check_output([
        'git', 'rev-parse', entry['published'] + '^{tree}'
    ]).decode().strip()
    assert published_tree == entry['tree']
    raw = base64.b64decode(entry['originalCommitBase64'], validate=True)
    digest = hashlib.sha1(b'commit ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert digest == entry['original']
    restored = subprocess.check_output([
        'git', 'hash-object', '-t', 'commit', '-w', '--stdin'
    ], input=raw).decode().strip()
    assert restored == entry['original']
    source_tree = subprocess.check_output([
        'git', 'rev-parse', restored + '^{tree}'
    ]).decode().strip()
    assert source_tree == published_tree
    subprocess.run([
        'git', 'update-ref', 'refs/rector-checkpoints/source-' + restored, restored
    ], check=True)
```

The original v1 and specification-baseline objects predate this map and must
also be present. Their identities and the browser/dependency requirements are
listed in the adjacent checkpoint README. Matching trees preserve the meaning
of recorded source checks; publication itself does not create a new test run.
