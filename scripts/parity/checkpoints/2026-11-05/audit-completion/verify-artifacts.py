import hashlib
import json
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
members = json.loads((root / 'artifact-members.json').read_text())
checked = 0
for name, record in manifest['files'].items():
    data = (root / name).read_bytes()
    assert len(data) == record['bytes'], name
    assert hashlib.sha256(data).hexdigest() == record['sha256'], name
for archive, expected in members.items():
    actual = {}
    with tarfile.open(root / archive, 'r:gz') as stream:
        for member in stream:
            assert member.isfile() and not member.name.startswith('/') and '..' not in Path(member.name).parts
            assert member.name not in actual
            data = stream.extractfile(member).read()
            actual[member.name] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    assert actual == expected, archive
    checked += len(actual)
print(json.dumps(dict(status='PASS', files=len(manifest['files']), archiveMembers=checked)))
