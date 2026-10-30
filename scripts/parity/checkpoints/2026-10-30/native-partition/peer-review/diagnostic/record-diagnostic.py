import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

repo = Path(__file__).resolve().parents[2]
output = Path(__file__).resolve().parent
def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo)
def digest(data):
    return hashlib.sha256(data).hexdigest()
def write_json(name, value):
    temp = output / (name + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(output / name)
def source():
    diff = git('diff', '--binary', '--full-index')
    return {'head': git('rev-parse', 'HEAD').decode().strip(),
            'tree': git('rev-parse', 'HEAD^{tree}').decode().strip(),
            'trackedChanges': git('diff', '--name-only').decode().splitlines(),
            'overlaySha256': digest(diff)}

before = source()
expected = json.loads((output / 'diagnostic-input.json').read_text())
assert before['head'] == expected['base']
assert before['overlaySha256'] == expected['overlaySha256']
assert before['trackedChanges'] == ['tests/browser/physical-history.mjs']
environment = dict(os.environ)
environment.pop('EDITOR_NATIVE_FILTER', None)
environment.pop('EDITOR_VITE_PATH', None)
environment['EDITOR_CHROME_PATH'] = '/tmp/rector-chrome/opt/google/chrome/chrome'
environment['EDITOR_NATIVE_PAGE'] = 'native-plugin-parity.html'
command = ['node', 'tests/browser/physical-history.mjs']
meta = {'purpose': 'One-off monolithic capacity diagnosis; does not replace original run-ph5JBn 120-second FAILED gate',
        'sourceBefore': before, 'command': command, 'cwd': str(repo),
        'environment': {key: environment[key] for key in ['EDITOR_CHROME_PATH', 'EDITOR_NATIVE_PAGE']},
        'filter': None, 'node': subprocess.check_output(['node', '--version']).decode().strip(),
        'chrome': subprocess.check_output([environment['EDITOR_CHROME_PATH'], '--version']).decode().strip(),
        'startedAt': utc(), 'outcome': 'RUNNING',
        'diagnosticOnlyPageDeadlineMs': 360000, 'shippingPageDeadlineMs': 120000}
started = time.monotonic()
proc = subprocess.Popen(command, cwd=repo, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
meta['pid'] = proc.pid
write_json('monolithic.meta.json', meta)
lines = []
def record_stdout():
    with (output / 'monolithic.stdout.log').open('wb') as handle:
        for line in iter(proc.stdout.readline, b''):
            stamp = {'receivedAt': utc(), 'receivedEpochMs': time.time_ns() / 1_000_000,
                     'processElapsedMs': (time.monotonic() - started) * 1000,
                     'bytes': len(line), 'sha256': digest(line)}
            if line.startswith(b'Native '):
                stamp['text'] = line.decode().strip()
                print(stamp['text'], flush=True)
            handle.write(line)
            handle.flush()
            lines.append(stamp)
def record_stderr():
    with (output / 'monolithic.stderr.log').open('wb') as handle:
        for data in iter(lambda: proc.stderr.read(65536), b''):
            handle.write(data)
            handle.flush()
threads = [threading.Thread(target=record_stdout), threading.Thread(target=record_stderr)]
for thread in threads:
    thread.start()
observer = None
observer_log = None
while proc.poll() is None and time.monotonic() - started < 45:
    try:
        children = Path(f'/proc/{proc.pid}/task/{proc.pid}/children').read_text().split()
        for child in children:
            command_line = Path(f'/proc/{child}/cmdline').read_bytes().replace(b'\0', b' ')
            match = re.search(rb'--remote-debugging-port=(\d+)', command_line)
            if match:
                observer_log = (output / 'navigation-observer.log').open('wb')
                observer = subprocess.Popen(['node', str(output / 'navigation-clock.mjs'), match[1].decode(),
                                             str(output / 'navigation-clock.json')],
                                            cwd=repo, stdout=observer_log, stderr=subprocess.STDOUT)
                break
    except (FileNotFoundError, ProcessLookupError):
        pass
    if observer:
        break
    time.sleep(0.05)
actual_exit = proc.wait()
finished = time.monotonic()
for thread in threads:
    thread.join()
if observer:
    observer_exit = observer.wait(timeout=50)
    observer_log.close()
else:
    observer_exit = None
meta.update({'finishedAt': utc(), 'actualExitCode': actual_exit,
             'signal': -actual_exit if actual_exit < 0 else None,
             'elapsedMs': (finished - started) * 1000,
             'outcome': 'PASS' if actual_exit == 0 else 'FAIL',
             'sourceAfter': source(), 'observerExitCode': observer_exit,
             'stdoutEvents': lines})
meta['sourceAndDiagnosticOverlayUnchanged'] = meta['sourceBefore'] == meta['sourceAfter']
clock_path = output / 'navigation-clock.json'
completion = next((line for line in lines if line.get('text', '').startswith('Native native-plugin-parity.html: ')), None)
if clock_path.exists() and completion:
    clock = json.loads(clock_path.read_text())
    if 'timeOrigin' in clock:
        meta['pageNavigationToCompletionMs'] = completion['receivedEpochMs'] - clock['timeOrigin']
        meta['pageTimingDefinition'] = 'Browser performance.timeOrigin at navigation to supervisor receipt of Native completion line; includes load and terminal poll/CDP/stdout latency, excludes Vite/Chrome startup'
for name in ['monolithic.stdout.log', 'monolithic.stderr.log', 'navigation-clock.json', 'navigation-observer.log']:
    path = output / name
    if path.exists():
        meta.setdefault('files', {})[name] = {'bytes': path.stat().st_size, 'sha256': digest(path.read_bytes())}
try:
    json_lines = [json.loads(line) for line in (output / 'monolithic.stdout.log').read_text().splitlines() if line.startswith('{')]
    assert len(json_lines) == 1
    results = json_lines[0]['native-plugin-parity.html']
    meta['cases'] = len(results)
    meta['passed'] = sum(result['status'] == 'PASS' for result in results)
    meta['failed'] = [result for result in results if result['status'] != 'PASS']
    write_json('monolithic.results.json', results)
except Exception as error:
    meta['resultParseError'] = str(error)
write_json('monolithic.meta.json', meta)
print(json.dumps({key: meta.get(key) for key in ['actualExitCode', 'elapsedMs', 'pageNavigationToCompletionMs', 'cases', 'passed', 'sourceAndDiagnosticOverlayUnchanged']}), flush=True)
raise SystemExit(actual_exit)
