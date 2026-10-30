import subprocess, os, json, sys, datetime, traceback
from pathlib import Path
job = json.loads(Path(sys.argv[1]).read_text())
status = Path(job['status'])
def write(**values):
    snapshot.update(values)
    temporary = status.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, indent=2) + '\n')
    temporary.replace(status)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
snapshot = {'startedAt': now(), 'state': 'initializing', 'cwd': job['cwd'], 'gates': []}
write()
env = os.environ.copy(); env.update(job.get('env', {}))
try:
    init = subprocess.run(['node', 'scripts/verification-results.mjs', 'init', *[gate['name'] for gate in job['gates']]], cwd=job['cwd'], env=env, text=True, capture_output=True)
    print(init.stdout, end='', flush=True); print(init.stderr, end='', file=sys.stderr, flush=True)
    if init.returncode: raise RuntimeError('C11 initialization failed: ' + str(init.returncode))
    directory = init.stdout.strip().splitlines()[-1]
    env['EDITOR_RESULTS_DIR'] = directory
    write(state='running', resultsDirectory=directory)
    for gate in job['gates']:
        started = now()
        gate_env = env.copy(); gate_env.update(gate.get('env', {}))
        command = [part.replace('{results}', directory) for part in gate['command']]
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', gate['name'], '--', *command], cwd=job['cwd'], env=gate_env)
        snapshot['gates'].append({'name': gate['name'], 'command': command, 'selectedEnvironment': gate.get('env', {}), 'startedAt': started, 'finishedAt': now(), 'exitCode': result.returncode})
        write()
    result = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=job['cwd'], env=env)
    write(state='finished', finishedAt=now(), exitCode=result.returncode)
except BaseException as error:
    traceback.print_exc()
    write(state='failed', finishedAt=now(), error=str(error))
    raise
