import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, writeSync } from 'node:fs'
import { appendFile, lstat, mkdir, mkdtemp, readFile, readlink, rename, writeFile } from 'node:fs/promises'
import { constants, release } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

// This records existing verification commands. It does not select or implement gates.
const now = () => new Date().toISOString()
const manifestPath = directory => join(directory, 'manifest.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const selectedEnvironment = names => Object.fromEntries(names.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
function environment() {
  let npm = null
  try { npm = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim() } catch { /* No version was observed. */ }
  return {
    node: process.version, nodeExecutable: process.execPath, npm, platform: process.platform, architecture: process.arch, release: release(),
    runner: selectedEnvironment(['RUNNER_OS', 'RUNNER_ARCH', 'ImageOS', 'ImageVersion']),
    selection: selectedEnvironment(['EDITOR_BROWSER_PAGE', 'EDITOR_BROWSER_ROOT', 'EDITOR_NATIVE_PAGE', 'EDITOR_NATIVE_FILTER', 'EDITOR_CHROME_PATH', 'EDITOR_VITE_PATH', 'DOCS_BASE']),
  }
}

async function sourceIdentity(directory) {
  const git = (...args) => execFileSync('git', args, { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const root = git('rev-parse', '--show-toplevel').toString().trim()
  const output = relative(root, directory).split(sep).join('/') + '/'
  const untracked = []
  const paths = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean).sort()
  for (const path of paths) {
    if (path.startsWith(output)) continue
    const file = join(root, path)
    const stat = await lstat(file)
    const bytes = stat.isSymbolicLink() ? await readlink(file) : await readFile(file)
    untracked.push({ path, mode: stat.mode, sha256: hash(bytes) })
  }
  const patchSha256 = hash(git('diff', '--binary', '--no-ext-diff', '--no-textconv', 'HEAD'))
  let lockSha256 = null
  try { lockSha256 = hash(await readFile(join(root, 'package-lock.json'))) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const source = {
    head: git('rev-parse', 'HEAD').toString().trim(), tree: git('rev-parse', 'HEAD^{tree}').toString().trim(),
    patchSha256, lockSha256, untracked,
  }
  return { ...source, dirty: patchSha256 !== hash('') || untracked.length > 0, identity: hash(JSON.stringify(source)) }
}

async function save(directory, manifest) {
  const temporary = join(directory, 'manifest.tmp')
  await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n')
  await rename(temporary, manifestPath(directory))
}

async function initialize(gates) {
  if (!gates.length || new Set(gates).size !== gates.length || gates.some(gate => !/^[a-z][a-z0-9-]*$/.test(gate))) {
    throw new Error('init requires distinct gate names containing lowercase letters, digits or hyphens')
  }
  const parent = join(process.cwd(), 'test-results')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'run-'))
  await save(directory, {
    schemaVersion: 1, cwd: process.cwd(), startedAt: now(), finishedAt: null, outcome: 'not-run',
    source: await sourceIdentity(directory), environment: environment(),
    context: selectedEnvironment(['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_WORKFLOW', 'GITHUB_REF']),
    gates: Object.fromEntries(gates.map(gate => [gate, {
      outcome: 'not-run', startedAt: null, finishedAt: null, exitCode: null, signal: null,
    }])),
  })
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `EDITOR_RESULTS_DIR=${directory}\n`)
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `directory=${directory}\n`)
  console.log(directory)
}

async function run(directory, manifest, args) {
  const [name, ...options] = args
  const separator = options.indexOf('--')
  const prerequisite = separator === 2 && options[0] === '--require' ? options[1] : null
  if ((separator !== 0 && !prerequisite) || !options[separator + 1]) throw new Error('run requires a gate, optional --require gate, and -- command arguments')
  const gate = manifest.gates[name]
  if (!Object.hasOwn(manifest.gates, name)) throw new Error(`Unplanned gate: ${name}`)
  if (manifest.finishedAt || gate.startedAt || gate.outcome !== 'not-run') throw new Error('A finished or attempted gate requires a fresh run')
  gate.command = options.slice(separator + 1)
  gate.cwd = process.cwd()
  gate.environment = environment()
  gate.sourceBefore = await sourceIdentity(directory)
  if (gate.sourceBefore.identity !== manifest.source.identity) {
    gate.outcome = 'failed'
    gate.reason = 'Source changed since this run was initialized; command was not started'
    await save(directory, manifest)
    return 1
  }
  if (prerequisite) {
    if (!Object.hasOwn(manifest.gates, prerequisite)) throw new Error(`Unplanned prerequisite: ${prerequisite}`)
    if (manifest.gates[prerequisite].outcome !== 'passed') {
      gate.reason = `Prerequisite ${prerequisite} is ${manifest.gates[prerequisite].outcome}`
      await save(directory, manifest)
      return 1
    }
  }
  gate.startedAt = now()
  gate.outcome = null
  await save(directory, manifest)
  const started = performance.now()
  const log = openSync(join(directory, `${name}.log`), 'wx')
  let failure
  let interrupt
  try {
    const grouped = process.platform !== 'win32'
    const child = spawn(gate.command[0], gate.command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: grouped })
    interrupt = signal => {
      gate.receivedSignal ??= signal
      // npm/shell launchers can exit before descendants release their output pipes.
      // Signal only the process group created for this command, never the caller's.
      try {
        if (grouped && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (error) { if (error.code !== 'ESRCH') failure ??= error.message }
    }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', interrupt)
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', chunk => { writeSync(log, chunk); output.write(chunk) })
    }
    child.on('error', error => { failure = error.message })
    const result = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
    gate.exitCode = result.code
    gate.signal = result.signal
  } finally {
    if (interrupt) {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
    closeSync(log)
  }
  gate.finishedAt = now()
  gate.elapsedMs = performance.now() - started
  gate.sourceAfter = await sourceIdentity(directory)
  gate.sourceUnchanged = gate.sourceBefore.identity === gate.sourceAfter.identity
  const interrupted = gate.receivedSignal || ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGKILL'].includes(gate.signal)
  gate.outcome = interrupted ? 'interrupted' : gate.exitCode === 0 && !failure && gate.sourceUnchanged ? 'passed' : 'failed'
  if (failure) gate.reason = failure
  else if (!gate.sourceUnchanged) gate.reason = 'Source changed during the command'
  await save(directory, manifest)
  return interrupted ? 128 + (constants.signals[gate.receivedSignal ?? gate.signal] ?? 1)
    : gate.outcome === 'passed' ? 0 : gate.exitCode > 0 ? gate.exitCode : 1
}

async function finish(directory, manifest) {
  for (const gate of Object.values(manifest.gates)) {
    if (gate.startedAt && !gate.finishedAt) {
      gate.outcome = 'interrupted'
      gate.reason = 'The command started without a recorded completion'
    }
  }
  const outcomes = Object.values(manifest.gates).map(gate => gate.outcome)
  manifest.sourceAfter = await sourceIdentity(directory)
  manifest.sourceUnchanged = manifest.source.identity === manifest.sourceAfter.identity
  manifest.outcome = !manifest.sourceUnchanged || outcomes.includes('failed') ? 'failed' : outcomes.includes('interrupted') ? 'interrupted'
    : outcomes.every(outcome => outcome === 'passed') ? 'passed' : 'not-run'
  manifest.finishedAt = now()
  await save(directory, manifest)
  return manifest.outcome === 'passed' ? 0 : 1
}

try {
  const [action, ...args] = process.argv.slice(2)
  if (action === 'init') await initialize(args)
  else {
    if (!process.env.EDITOR_RESULTS_DIR) throw new Error('Initialize a run and set EDITOR_RESULTS_DIR before running or finishing gates')
    const directory = resolve(process.env.EDITOR_RESULTS_DIR)
    const manifest = JSON.parse(await readFile(manifestPath(directory), 'utf8'))
    if (action === 'run') process.exitCode = await run(directory, manifest, args)
    else if (action === 'finish') process.exitCode = await finish(directory, manifest)
    else throw new Error(`Unknown result operation: ${action}`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
