"""Fault controls for the convergence reviewer, separate from scenario-oracle controls."""
import copy
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit_review', Path(__file__).with_name('common.py'))
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)
raw = json.loads((Path(sys.argv[1]) / 'corpora/columns-rich-fields.mjs.json').read_text())


def current(d):
    return next(r for r in d['results'] if r['source'] == 'candidate')


mutations = [
    ('candidate-verdict', lambda d: d.update(candidatePass=False)),
    ('source-identity', lambda d: d.update(headAfter='old-source')),
    ('partial-filter', lambda d: d.update(filter=['selected-only'])),
    ('missing-current-body', lambda d: current(d).update(cases=[])),
    ('missing-policy-execution', lambda d: d['results'].remove(next(r for r in d['results'] if r.get('source') == 'candidate' and r.get('trustedPolicy') is True))),
    ('missing-phase', lambda d: current(d)['cases'][0]['completedPhases'].pop()),
    ('unsupported-current', lambda d: current(d)['cases'][0].update(unsupported=['not-executed'])),
    ('body-error', lambda d: current(d)['cases'][0].update(error='failed actual input')),
    ('wrong-literal', lambda d: current(d)['cases'][0]['observations'][0].update(actual='wrong')),
    ('hidden-failure', lambda d: current(d)['cases'][0]['observations'][0].update(status='FAIL')),
    ('page-error', lambda d: current(d).update(pageErrors=['uncaught'])),
    ('wrong-module-identity', lambda d: next(s for s in d['sources'] if s['label'] == 'candidate').update(sha='old-source')),
]
reviewer.corpus('columns-rich-fields.mjs', raw, False)
results = []
for name, mutate in mutations:
    damaged = copy.deepcopy(raw)
    mutate(damaged)
    try:
        reviewer.corpus('columns-rich-fields.mjs', damaged, False)
    except AssertionError:
        results.append(dict(corruption=name, rejected=True))
    else:
        raise AssertionError('Accepted corrupt evidence: ' + name)
assert not reviewer.equal(True, 1)
assert not reviewer.equal({'x': None}, {})
print(json.dumps(dict(rejectedCorruptions=len(results), results=results), indent=2))
