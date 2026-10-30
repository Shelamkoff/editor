"""Observe the existing native parity page with diagnostic-only progress and deadline."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

BASE = Path('/workspace/scratch/61a2ad7355f4')
ROOT = BASE / 'worktrees/continuation-native-final2'
OUT = BASE / 'tools/native-parity-budget-diagnostic'
FROZEN = 'c6e537e5d7433f0d902749719c8af265c6ae8591'

def sha(data): return hashlib.sha256(data).hexdigest()
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT)
def write(name,value): (OUT/name).write_text(json.dumps(value,indent=2)+'\n')

OUT.mkdir(exist_ok=False)
assert git('rev-parse','HEAD').decode().strip()==FROZEN
assert not git('status','--porcelain=v1')
original_runner=(ROOT/'tests/browser/physical-history.mjs').read_text()
original_harness=(ROOT/'tests/browser/regressions/harness.js').read_text()
runner=original_runner.replace("from './environment.mjs'", "from '"+(ROOT/'tests/browser/environment.mjs').as_uri()+"'")
runner=runner.replace("import { mkdtemp, rm } from 'node:fs/promises'", "import { mkdtemp, rm, readFile } from 'node:fs/promises'")
harness=original_harness.replace('  const results = []\n', '  const results = []\n  window.__diagnosticNativeProgress = { startedAt: performance.now(), completed: [], current: null }\n')
loop="  for (const { name, run } of cases.filter(entry => !filter || entry.name.includes(filter))) {\n"
assert original_harness.count(loop)==1
harness=harness.replace(loop,loop+'    window.__diagnosticNativeProgress.current = { name, startedAt: performance.now() }\n')
end="      : { name, status: 'PASS' })\n"
assert original_harness.count(end)==1
harness=harness.replace(end,end+'    window.__diagnosticNativeProgress.completed.push({ ...results.at(-1), elapsedMs: performance.now() - window.__diagnosticNativeProgress.current.startedAt })\n')
(OUT/'diagnostic-harness.js').write_text(harness)
start=runner.index('async function waitForHistoryMatrix(client) {')
finish=runner.index('\nasync function click(',start)
runner=runner[:start]+'''async function waitForHistoryMatrix(client) {
  const startedAt = Date.now()
  const deadline = startedAt + 240_000
  let printed = 0, originalDeadlineObserved = false
  while (Date.now() < deadline) {
    const result = await evaluate(client, `({
      status: document.body?.dataset.status ?? 'loading',
      summary: document.querySelector('#result')?.textContent ?? '',
      progress: window.__diagnosticNativeProgress,
      now: performance.now(),
    })`)
    for (const entry of result.progress?.completed.slice(printed) ?? []) {
      console.log(JSON.stringify({ diagnosticCase: entry, pageElapsedMs: Date.now() - startedAt }))
      printed++
    }
    if (!originalDeadlineObserved && Date.now() - startedAt >= 120_000) {
      originalDeadlineObserved = true
      console.log(JSON.stringify({ originalDeadlineObservation: {
        elapsedMs: Date.now() - startedAt, status: result.status,
        completed: printed, current: result.progress?.current,
        currentElapsedMs: result.progress?.current ? result.now - result.progress.current.startedAt : null,
      } }))
    }
    if (result.status === 'pass' || result.status === 'fail') {
      console.log(JSON.stringify({ diagnosticFinal: { elapsedMs: Date.now() - startedAt, status: result.status, completed: printed } }))
      if (result.status === 'fail') throw new Error(`History matrix failed: ${result.summary}`)
      await waitForNativeInput()
      return result.summary
    }
    await delay(100)
  }
  throw new Error('Diagnostic observation stopped after 240000ms; original acceptance deadline remains 120000ms')
}
''' + runner[finish:]
install="  await installNativeInput(client)\n"
assert runner.count(install)==1
intercept="""  // Diagnostic only: instrument harness progress; assertions and per-case timers are unchanged.
  const diagnosticHarness = await readFile(DIAGNOSTIC_HARNESS_PATH, 'utf8')
  client.on('Fetch.requestPaused', async request => {
    await client.send('Fetch.fulfillRequest', {
      requestId: request.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }],
      body: Buffer.from(diagnosticHarness).toString('base64'),
    })
  })
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*://*/tests/browser/regressions/harness.js*', requestStage: 'Request' }] })
""".replace('DIAGNOSTIC_HARNESS_PATH',json.dumps(str(OUT/'diagnostic-harness.js')))
runner=runner.replace(install,intercept+install)
(OUT/'diagnostic-runner.mjs').write_text(runner)
metadata={'source':FROZEN,'scope':'diagnostic-only; not acceptance; external runner observes beyond original120000ms deadline and external served harness adds only progress/timing; original assertions, per-case timers and selected cases unchanged',
          'originalRunnerSha256':sha(original_runner.encode()),'diagnosticRunnerSha256':sha(runner.encode()),'originalHarnessSha256':sha(original_harness.encode()),'diagnosticHarnessSha256':sha(harness.encode()),
          'page':'native-plugin-parity.html','originalPageDeadlineMs':120000,'diagnosticObservationDeadlineMs':240000}
write('metadata.json',metadata)
environment=dict(os.environ)
for key in list(environment):
    if key.startswith('EDITOR_') or key in ['GITHUB_ENV','GITHUB_OUTPUT']:
        environment.pop(key)
environment.update(json.loads((BASE/'tools/native-continuation-final2-retry/preflight.json').read_text())['editorEnvironment'])
environment['EDITOR_NATIVE_PAGE']='native-plugin-parity.html'
recorder=['node','scripts/verification-results.mjs']
initialized=subprocess.run([*recorder,'init','diagnostic'],cwd=ROOT,env=environment,capture_output=True,check=True)
(OUT/'init.stdout.log').write_bytes(initialized.stdout)
(OUT/'init.stderr.log').write_bytes(initialized.stderr)
directory=Path(initialized.stdout.decode().strip().splitlines()[-1])
environment['EDITOR_RESULTS_DIR']=str(directory)
write('status.json',{'outcome':'running','directory':str(directory),'source':FROZEN,'diagnosticOnly':True})
with (OUT/'run.wrapper.log').open('xb') as output:
    result=subprocess.run([*recorder,'run','diagnostic','--','node',str(OUT/'diagnostic-runner.mjs')],cwd=ROOT,env=environment,stdout=output,stderr=subprocess.STDOUT)
with (OUT/'finish.wrapper.log').open('xb') as output:
    finished=subprocess.run([*recorder,'finish'],cwd=ROOT,env=environment,stdout=output,stderr=subprocess.STDOUT)
manifest=json.loads((directory/'manifest.json').read_text())
write('status.json',{'outcome':manifest['outcome'],'directory':str(directory),'source':FROZEN,'diagnosticOnly':True,'exitCode':result.returncode,'sourceUnchanged':manifest.get('sourceUnchanged')})
