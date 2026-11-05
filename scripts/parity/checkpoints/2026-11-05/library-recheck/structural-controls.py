import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

directory = Path(sys.argv[1]).resolve()
original = json.loads((directory / 'results.json').read_text())
mutations = [
    ('source', lambda d: d['sources'][1].update(sha='e981ff308000c1d92d7e820df95113c1e19bcee8')),
    ('sample-count', lambda d: d['timings'][0]['rawSamples'].pop()),
    ('distribution', lambda d: d['timings'][0]['summaries'][0]['metrics']['synchronousMs'].update(p50=-1)),
    ('trusted-native-input', lambda d: next(c for c in d['controls'] if c.get('kind') == 'native')['observations'][0].update(trustedNativeInput=False)),
    ('live-memory-control', lambda d: d['memory'][0]['observation'].update(livePositiveControl=False)),
    ('retained-memory', lambda d: d['memory'][0]['observation'].update(retainedReleasedObjects=1)),
    ('trace-reconstruction', lambda d: d['attribution'][0]['trace']['windows'][0]['totals']['Layout'].update(count=-1)),
]
positive = subprocess.run(['node', str(Path(__file__).with_name('structural-review.mjs')), str(directory), '8761946d', '125b3e22'], capture_output=True, text=True)
assert positive.returncode == 0 and json.loads(positive.stdout)['status'] == 'PASS', (positive.stdout, positive.stderr)
results = []
with tempfile.TemporaryDirectory(prefix='rector-structural-review-') as temporary:
    for name, mutate in mutations:
        changed = copy.deepcopy(original)
        mutate(changed)
        override = Path(temporary) / 'corrupt.json'
        override.write_text(json.dumps(changed))
        run = subprocess.run(['node', str(Path(__file__).with_name('structural-review.mjs')),
                              str(directory), '8761946d', '125b3e22ffc482cbddf76e746d85e5bc0cb32e17', str(override)],
                             capture_output=True, text=True)
        assert run.returncode != 0 and 'AssertionError' in run.stderr, (name, run.stdout, run.stderr)
        results.append(dict(corruption=name, rejected=True))
print(json.dumps(dict(rejectedCorruptions=len(results), results=results), indent=2))
