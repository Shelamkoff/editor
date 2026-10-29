import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const helper = fileURLToPath(new URL('./verification-results.mjs', import.meta.url))

async function repository(t, ignoreResults = true) {
  const cwd = await mkdtemp(join(tmpdir(), 'rector-verification-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await writeFile(join(cwd, '.gitignore'), ignoreResults ? '/test-results/\n' : '')
  await writeFile(join(cwd, 'source.js'), 'export const value = 1\n')
  execFileSync('git', ['init', '--quiet'], { cwd })
  execFileSync('git', ['add', '.'], { cwd })
  execFileSync('git', ['-c', 'user.name=Verification fixture', '-c', 'user.email=verification@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture source'], { cwd })
  const env = { ...process.env, EDITOR_RESULTS_DIR: undefined, GITHUB_ENV: undefined, GITHUB_OUTPUT: undefined }
  const cli = (args, directory, extra = {}) => spawnSync(process.execPath, [helper, ...args], {
    cwd, encoding: 'utf8', env: { ...env, ...extra, EDITOR_RESULTS_DIR: directory }, timeout: 15_000,
  })
  const initialize = (...gates) => {
    const result = cli(['init', ...gates])
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  return { cwd, env, cli, initialize }
}

const manifest = async directory => JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))

test('a fresh run cannot inherit a historical PASS or its output files', async t => {
  const { cwd, cli, initialize } = await repository(t)
  const historical = join(cwd, 'test-results')
  await mkdir(historical)
  await writeFile(join(historical, 'manifest.json'), JSON.stringify({ gates: { unit: { outcome: 'passed' } } }))
  await writeFile(join(historical, 'unit.log'), 'OLD SUCCESS\n')

  const directory = initialize('unit')
  assert.notEqual(directory, historical)
  assert.deepEqual(await readdir(directory), ['manifest.json'])
  assert.equal((await manifest(directory)).gates.unit.outcome, 'not-run')
  assert.equal(await readFile(join(historical, 'unit.log'), 'utf8'), 'OLD SUCCESS\n')

  const result = cli(['run', 'unit', '--', process.execPath, '-e', 'console.log("ACTUAL NEW RUN")'], directory)
  assert.equal(result.status, 0, result.stderr)
  assert.equal((await manifest(directory)).gates.unit.outcome, 'passed')
  assert.equal(await readFile(join(directory, 'unit.log'), 'utf8'), 'ACTUAL NEW RUN\n')
  const next = initialize('unit')
  assert.notEqual(next, directory)
  assert.equal((await manifest(next)).gates.unit.outcome, 'not-run')
})

test('a failed build leaves the dependent gate not-run even when an old successful log exists', async t => {
  const { cli, initialize } = await repository(t)
  const directory = initialize('build', 'package')
  await writeFile(join(directory, 'package.log'), 'OLD PACKAGE PASS\n')

  const build = cli(['run', 'build', '--', process.execPath, '-e', 'console.error("BUILD FAILED"); process.exit(7)'], directory)
  assert.equal(build.status, 7, build.stderr)
  const dependent = cli(['run', 'package', '--require', 'build', '--', process.execPath, '-e',
    'require("node:fs").writeFileSync(process.env.EDITOR_RESULTS_DIR + "/package-started", "yes")'], directory)
  assert.equal(dependent.status, 1, dependent.stderr)
  assert.equal((await readdir(directory)).includes('package-started'), false)
  const results = await manifest(directory)
  assert.equal(results.gates.build.outcome, 'failed')
  assert.equal(results.gates.build.exitCode, 7)
  assert.equal(results.gates.package.outcome, 'not-run')
  assert.equal(results.gates.package.startedAt, null)
  assert.match(results.gates.package.reason, /build.*failed/)
  assert.equal(cli(['finish'], directory).status, 1)
  assert.equal((await manifest(directory)).outcome, 'failed')
})

test('source identity excludes only this run output and covers dirty tracked and untracked source bytes', async t => {
  const { cwd, cli, initialize } = await repository(t, false)
  await writeFile(join(cwd, 'source.js'), 'export const value = 2\n')
  await writeFile(join(cwd, 'new-source.js'), 'export const extra = 1\n')
  const directory = initialize('stable', 'changed')
  const initial = await manifest(directory)
  assert.equal(initial.source.head, execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim())
  assert.equal(initial.source.tree, execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd, encoding: 'utf8' }).trim())
  assert.deepEqual(initial.source.untracked.map(file => file.path), ['new-source.js'])
  assert.equal(initial.source.dirty, true)

  const stable = cli(['run', 'stable', '--', process.execPath, '-e',
    'require("node:fs").writeFileSync(process.env.EDITOR_RESULTS_DIR + "/diagnostic.json", "{}"); console.log("verified")'], directory)
  assert.equal(stable.status, 0, stable.stderr)
  const stableGate = (await manifest(directory)).gates.stable
  assert.equal(stableGate.sourceBefore.identity, initial.source.identity)
  assert.equal(stableGate.sourceAfter.identity, initial.source.identity)
  assert.equal(stableGate.sourceUnchanged, true)

  const changed = cli(['run', 'changed', '--', process.execPath, '-e',
    'require("node:fs").writeFileSync("new-source.js", "export const extra = 2\\n")'], directory)
  assert.equal(changed.status, 1, changed.stderr)
  const changedGate = (await manifest(directory)).gates.changed
  assert.equal(changedGate.exitCode, 0)
  assert.equal(changedGate.outcome, 'failed')
  assert.equal(changedGate.sourceUnchanged, false)
  assert.notEqual(changedGate.sourceAfter.identity, initial.source.identity)
  assert.match(changedGate.reason, /source.*changed/i)
})

test('SIGTERM reaches the owned command and records interrupted even if that command handles it with exit zero', { skip: process.platform === 'win32', timeout: 10_000 }, async t => {
  const { cwd, env, cli, initialize } = await repository(t)
  const directory = initialize('before', 'waiting', 'after')
  assert.equal(cli(['run', 'before', '--', process.execPath, '-e', 'console.log("completed")'], directory).status, 0)
  const program = `const fs = require('node:fs');
    process.on('SIGTERM', () => { fs.writeFileSync(process.env.EDITOR_RESULTS_DIR + '/signal-observed', 'SIGTERM'); process.exit(0) });
    fs.writeFileSync(process.env.EDITOR_RESULTS_DIR + '/ready', 'ready');
    setTimeout(() => process.exit(99), 4000)`
  const child = spawn(process.execPath, [helper, 'run', 'waiting', '--', process.execPath, '-e', program], {
    cwd, env: { ...env, EDITOR_RESULTS_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
  const deadline = Date.now() + 3000
  while (!(await readdir(directory)).includes('ready')) {
    assert.ok(Date.now() < deadline, 'the command must start before this test sends its signal')
    await pause(10)
  }
  child.kill('SIGTERM')
  const result = await closed
  const results = await manifest(directory)
  assert.equal(results.gates.waiting.outcome, 'interrupted')
  assert.equal(results.gates.waiting.receivedSignal, 'SIGTERM')
  assert.equal(results.gates.waiting.exitCode, 0)
  assert.equal(result.code, 143)
  assert.equal(await readFile(join(directory, 'signal-observed'), 'utf8'), 'SIGTERM')
  assert.equal(results.gates.before.outcome, 'passed')
  assert.equal(results.gates.after.outcome, 'not-run')
  assert.equal(cli(['finish'], directory).status, 1)
  assert.equal((await manifest(directory)).outcome, 'interrupted')
})

test('a completed command records exact argv, times, source, lock and a safe environment whitelist', async t => {
  const { cwd, cli } = await repository(t)
  const lock = '{"lockfileVersion":3}\n'
  await writeFile(join(cwd, 'package-lock.json'), lock)
  const extra = { GITHUB_SHA: 'trigger-is-not-the-checked-out-source', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_TOKEN: 'SECRET-TOKEN-MUST-NOT-BE-RECORDED', C11_PASSWORD: 'SECRET-PASSWORD-MUST-NOT-BE-RECORDED',
    EDITOR_BROWSER_PAGE: 'public-extension-contracts.html' }
  const initialized = cli(['init', 'check'], undefined, extra)
  assert.equal(initialized.status, 0, initialized.stderr)
  const directory = initialized.stdout.trim()
  const command = [process.execPath, '-e', 'console.log("actual stdout"); console.error("actual stderr")']
  const started = Date.now()
  const completed = cli(['run', 'check', '--', ...command], directory, extra)
  const finished = Date.now()
  assert.equal(completed.status, 0, completed.stderr)
  assert.equal(cli(['finish'], directory).status, 0)
  const results = await manifest(directory)
  assert.equal(results.outcome, 'passed')
  assert.equal(results.environment.node, process.version)
  assert.equal(results.environment.platform, process.platform)
  assert.equal(results.environment.architecture, process.arch)
  assert.match(results.environment.npm, /^\d+\.\d+\.\d+/)
  assert.deepEqual(results.gates.check.command, command)
  assert.equal(results.gates.check.cwd, cwd)
  assert.equal(results.gates.check.exitCode, 0)
  assert.equal(results.gates.check.signal, null)
  assert.equal(results.gates.check.sourceUnchanged, true)
  assert.ok(Date.parse(results.gates.check.startedAt) >= started)
  assert.ok(Date.parse(results.gates.check.finishedAt) <= finished)
  assert.ok(results.gates.check.elapsedMs >= 0)
  assert.equal(results.environment.selection.EDITOR_BROWSER_PAGE, 'public-extension-contracts.html')
  assert.equal(results.context.GITHUB_SHA, extra.GITHUB_SHA)
  assert.notEqual(results.source.head, results.context.GITHUB_SHA)
  assert.equal(results.source.lockSha256, createHash('sha256').update(lock).digest('hex'))
  assert.doesNotMatch(JSON.stringify(results), /SECRET-TOKEN|SECRET-PASSWORD|GITHUB_TOKEN|C11_PASSWORD/)
  assert.match(await readFile(join(directory, 'check.log'), 'utf8'), /actual stdout/)
  assert.match(await readFile(join(directory, 'check.log'), 'utf8'), /actual stderr/)
})

test('finalizing after loss of the owned helper cannot turn an incomplete attempt into PASS', { skip: process.platform === 'win32' }, async t => {
  const { cli, initialize } = await repository(t)
  const directory = initialize('killed', 'later')
  const killed = cli(['run', 'killed', '--', process.execPath, '-e', 'process.kill(process.ppid, "SIGKILL")'], directory)
  assert.equal(killed.signal, 'SIGKILL')
  assert.equal((await manifest(directory)).gates.killed.finishedAt, null)
  assert.equal(cli(['finish'], directory).status, 1)
  const results = await manifest(directory)
  assert.equal(results.gates.killed.outcome, 'interrupted')
  assert.equal(results.gates.killed.exitCode, null)
  assert.equal(results.gates.killed.finishedAt, null)
  assert.equal(results.gates.later.outcome, 'not-run')
  assert.equal(results.outcome, 'interrupted')
})

test('interruption also reaches owned npm-like descendants with inherited stdout', { skip: process.platform === 'win32', timeout: 10_000 }, async t => {
  const { cwd, env, initialize } = await repository(t)
  const directory = initialize('browser')
  const grandchild = `const fs = require('node:fs');
    process.on('SIGTERM', () => { fs.writeFileSync(process.env.EDITOR_RESULTS_DIR + '/descendant-stopped', 'SIGTERM'); process.exit(0) });
    fs.writeFileSync(process.env.EDITOR_RESULTS_DIR + '/descendant-ready', 'ready');
    setTimeout(() => process.exit(99), 3000)`
  const launcher = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' })`
  const child = spawn(process.execPath, [helper, 'run', 'browser', '--', process.execPath, '-e', launcher], {
    cwd, env: { ...env, EDITOR_RESULTS_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
  const deadline = Date.now() + 3000
  while (!(await readdir(directory)).includes('descendant-ready')) {
    assert.ok(Date.now() < deadline, 'the owned descendant must be ready before interruption')
    await pause(10)
  }
  child.kill('SIGTERM')
  assert.equal((await closed).code, 143)
  assert.ok((await readdir(directory)).includes('descendant-stopped'), 'SIGTERM must reach the owned descendant, not only its launcher')
  assert.equal((await manifest(directory)).gates.browser.outcome, 'interrupted')
})

test('restoring source after a rejected attempt cannot erase its failure in the same run', async t => {
  const { cwd, cli, initialize } = await repository(t)
  const directory = initialize('check')
  await writeFile(join(cwd, 'source.js'), 'export const value = 99\n')
  const command = ['run', 'check', '--', process.execPath, '-e', 'require("node:fs").writeFileSync(process.env.EDITOR_RESULTS_DIR + "/unexpected-start", "started")']
  assert.equal(cli(command, directory).status, 1)
  const first = (await manifest(directory)).gates.check
  assert.equal(first.outcome, 'failed')
  assert.equal(first.startedAt, null)
  assert.equal((await readdir(directory)).includes('unexpected-start'), false)

  await writeFile(join(cwd, 'source.js'), 'export const value = 1\n')
  const repeated = cli(command, directory)
  assert.equal(repeated.status, 1, 'a recorded failure requires a fresh run even after its source is restored')
  assert.match(repeated.stderr, /fresh run/)
  assert.deepEqual((await manifest(directory)).gates.check, first)
  assert.equal((await readdir(directory)).includes('unexpected-start'), false)
  assert.equal(cli(['finish'], directory).status, 1)
})
