import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

repo = Path('/workspace/scratch/2231de9d6b0d/work-runner-reporting')
stage = sys.argv[1]
out = Path('/workspace/scratch/2231de9d6b0d/runner-reporting-evidence') / stage
out.mkdir(parents=True, exist_ok=True)
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip()
tasks = [
    ('columns', 'columns-layout-parity.mjs', 'EDITOR_COLUMNS_LAYOUT_FILTER'),
    ('text', 'text-block-settings.mjs', 'EDITOR_TEXT_BLOCK_SETTINGS_FILTER'),
    ('raw', 'raw-source-preview.mjs', 'EDITOR_RAW_FILTER'),
]
positive_filters = {'columns': 'direct/empty-removed', 'text': 'LIST_STYLE/unordered/ordered', 'raw': 'RAW_SOURCE/tab-caret', 'tools': None}
if stage == 'positive':
    tasks.append(('tools', 'tool-actions.mjs', None))
env = {**os.environ,
    'EDITOR_CHROME_PATH': '/tmp/rector-chrome/opt/google/chrome/chrome',
    'EDITOR_PLAYWRIGHT_PATH': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    'EDITOR_DEPENDENCIES_ROOT': '/workspace/scratch/2231de9d6b0d/editor/node_modules',
}

def run(task):
    name, script, variable = task
    command = ['node', 'scripts/parity/' + script]
    selected_filter = positive_filters[name] if stage == 'positive' else '__no_matching_reporting_case__'
    started = datetime.now(timezone.utc).isoformat()
    result = subprocess.run(command, cwd=repo, env={**env, **({variable: selected_filter} if variable else {})}, capture_output=True, timeout=180)
    (out / (name + '.stdout')).write_bytes(result.stdout)
    (out / (name + '.stderr')).write_bytes(result.stderr)
    try:
        data = json.loads(result.stdout)
    except ValueError:
        data = None
    row = {'name': name, 'command': command, 'filterVariable': variable, 'filter': selected_filter,
        'startedAt': started, 'completedAt': datetime.now(timezone.utc).isoformat(), 'source': source,
        'runnerSha256': hashlib.sha256((repo / command[1]).read_bytes()).hexdigest(),
        'exitCode': result.returncode, 'jsonReport': data is not None, 'candidatePass': data.get('candidatePass') if data else None,
        'caseCounts': {r['source']: len(r['cases']) for r in data['results']} if data else None,
        'failureCounts': {r['source']: sum(sum(o['status'] != 'PASS' for o in c['observations']) for c in r['cases']) for r in data['results']} if data else None,
        'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(), 'stderrSha256': hashlib.sha256(result.stderr).hexdigest()}
    return row

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(run, tasks))
(out / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
if stage == 'green':
    assert all(r['exitCode'] == 1 and r['jsonReport'] and r['candidatePass'] is False and all(n == 0 for n in r['caseCounts'].values()) for r in results)
if stage == 'positive':
    assert all(r['jsonReport'] and r['candidatePass'] is True and r['failureCounts']['candidate'] == 0 for r in results)
