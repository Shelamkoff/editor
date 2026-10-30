# Reconstructing the isolated validation sources

Every patch in this directory is a full-index, binary-capable Git diff from
`355577fce341e77bead7d69705744db724f1b79f` to one isolated validation source.
Gzip timestamps are fixed to zero. `manifest.json` records compressed and
decoded hashes, exact source trees and the corresponding integration commits.

All seven patches were applied independently using a fresh temporary Git index:
`read-tree` of the common base, `apply --cached`, then `write-tree`. Every
result exactly matched its recorded original source tree. The working tree and
index of the integration branch were not changed. The created Git tree/blob
objects are normal reconstruction output.

An integration mapping identifies the incorporated change. It does **not**
assert equality between an isolated source tree and the full integration tree,
which may contain other changes.

## Recheck a patch without changing a checkout

Run from a repository containing the common base. Replace the two arguments
with the selected compressed patch and the `sourceTree` from the manifest:

```sh
python - /absolute/path/to/source.patch.gz EXPECTED_SOURCE_TREE <<'PY'
import gzip, os, pathlib, subprocess, sys, tempfile

base = '355577fce341e77bead7d69705744db724f1b79f'
patch = gzip.decompress(pathlib.Path(sys.argv[1]).read_bytes())
with tempfile.TemporaryDirectory(prefix='rector-source-index-') as temporary:
    env = dict(os.environ, GIT_INDEX_FILE=str(pathlib.Path(temporary) / 'index'))
    subprocess.run(['git', 'read-tree', base], env=env, check=True)
    subprocess.run(['git', 'apply', '--cached', '--binary', '--whitespace=nowarn', '-'],
                   input=patch, env=env, check=True)
    actual = subprocess.check_output(['git', 'write-tree'], env=env, text=True).strip()
    assert actual == sys.argv[2], (actual, sys.argv[2])
    print(actual)
PY
```

These patches restore exact tracked source trees. They do not recreate the
original author/committer metadata or original commit history. For a fresh
execution, use a temporary commit of the verified reconstructed tree and record
its own commit identity plus the identical original source-tree identity. Pass
that temporary commit through the differential runner's candidate-SHA option
where applicable; do not claim that the new execution occurred on the original
commit object.
