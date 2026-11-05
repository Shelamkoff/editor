"""Restore exact archived comparison objects without changing the checkout/index/refs."""
import gzip
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

checkpoint = Path('scripts/parity/checkpoints/2026-10-30/table-keyboard')
manifest = json.loads((checkpoint / 'manifest.json').read_text())
restored = []
with tempfile.TemporaryDirectory(prefix='rector-reference-index-') as temporary:
    environment = os.environ.copy()
    environment['GIT_INDEX_FILE'] = str(Path(temporary) / 'index')
    environment['GIT_NO_REPLACE_OBJECTS'] = '1'

    def git(*args, data=None):
        return subprocess.check_output(['git', *args], input=data, env=environment).decode().strip()

    for record in manifest['preservedSources']:
        patch = gzip.decompress((checkpoint / record['patch']).read_bytes())
        assert hashlib.sha256(patch).hexdigest() == record['patchSha256']
        raw = record['rawCommit'].encode()
        assert hashlib.sha1(b'commit ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == record['sha']
        git('read-tree', manifest['base'])
        git('apply', '--cached', '--binary', '--whitespace=nowarn', '-', data=patch)
        assert git('write-tree') == record['tree']
        assert git('hash-object', '-w', '-t', 'commit', '--stdin', data=raw) == record['sha']
        restored.append(dict(sha=record['sha'], tree=record['tree']))
print(json.dumps(dict(base=manifest['base'], restored=restored, checkoutIndexAndRefsChanged=False), indent=2))
