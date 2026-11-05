"""Reuse the committed completeness checks with this immutable candidate."""
import importlib.util
from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'audit-completion/review.py'
spec = importlib.util.spec_from_file_location('prior_audit_completeness', path)
implementation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(implementation)
CANDIDATE = '125b3e22ffc482cbddf76e746d85e5bc0cb32e17'
implementation.CANDIDATE = CANDIDATE
digest = implementation.digest
equal = implementation.equal
git_bytes = implementation.git_bytes
records = implementation.records
corpus = implementation.corpus
historical_differences = implementation.historical_differences

def use_candidate(candidate):
    global CANDIDATE
    CANDIDATE = candidate
    implementation.CANDIDATE = candidate
