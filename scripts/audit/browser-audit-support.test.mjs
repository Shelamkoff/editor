import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { FONT_SIZE_RETAINED_CASES, verifyNativeGreen } from './focused-browser-results.mjs'

// Exercise actual process signals: a child may handle SIGTERM and exit zero.
// Its interrupted receipt must still reject GREEN.
test('owned-process SIGTERM is forwarded and recorded even when the child exits zero', { timeout: 15_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rector-audit-signal-test-'))
  const moduleUrl = new URL('./browser-audit-support.mjs', import.meta.url).href
  const childCode = "process.on('SIGTERM', () => { console.log('CHILD_TERMINATED'); process.exit(0) }); console.log('CHILD_READY'); setInterval(() => {}, 1000)"
  const supervisorCode = `import { recordCommand } from ${JSON.stringify(moduleUrl)}; const result = await recordCommand(process.argv[1], 'signal', [process.execPath, '-e', process.argv[2]], { timeoutMs: 10_000 }); console.log(JSON.stringify(result))`
  const supervisor = spawn(process.execPath, ['--input-type=module', '-e', supervisorCode, directory, childCode], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  supervisor.stdout.on('data', bytes => { stdout += bytes })
  supervisor.stderr.on('data', bytes => { stderr += bytes })
  const closed = new Promise(resolve => supervisor.once('close', (code, signal) => resolve({ code, signal })))
  t.after(async () => {
    if (supervisor.exitCode === null && supervisor.signalCode === null) supervisor.kill('SIGTERM')
    await closed
    await rm(directory, { recursive: true, force: true })
  })
  const deadline = Date.now() + 5000
  let ready = false
  while (Date.now() < deadline) {
    try { ready = (await readFile(join(directory, 'signal.stdout.log'), 'utf8')).includes('CHILD_READY') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (ready) break
    await pause(10)
  }
  assert(ready, `Owned child did not reach its signal-ready state: ${stderr}`)
  assert(supervisor.kill('SIGTERM'))
  assert.deepEqual(await closed, { code: 0, signal: null }, stderr)
  const result = JSON.parse(stdout.trim())
  assert.equal(result.receivedSignal, 'SIGTERM')
  assert.equal(result.exitCode, 0)
  assert.equal(result.signal, null)
  assert.equal(result.timedOut, false)
  assert.match(result.stdout, /CHILD_TERMINATED/)
  const saved = JSON.parse(await readFile(join(directory, 'signal.command.json'), 'utf8'))
  assert.equal(saved.receivedSignal, 'SIGTERM')
  assert.throws(() => verifyNativeGreen({ ...result, stdout: JSON.stringify({ 'native-tools.html': FONT_SIZE_RETAINED_CASES.map(name => ({ name, status: 'PASS' })) }) },
    'native-tools.html', FONT_SIZE_RETAINED_CASES), /interrupted process/)
})
