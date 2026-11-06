import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, createReadStream, openSync, writeSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
export async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}

export async function sourceIdentity(root) {
  const files = {}
  for (const path of git(root, 'ls-files', '-z').toString().split('\0').filter(Boolean).sort()) {
    files[path] = sha256(await readFile(join(root, path)))
  }
  return {
    head: git(root, 'rev-parse', 'HEAD').toString().trim(),
    tree: git(root, 'rev-parse', 'HEAD^{tree}').toString().trim(),
    diffSha256: sha256(git(root, 'diff', '--binary', '--no-ext-diff', '--no-textconv', 'HEAD')),
    files,
  }
}

/** Record one planned invocation. A timeout is an unavailable/failed run,
 * never an expected product regression. No command is retried here. */
export async function recordCommand(directory, name, command, { cwd, env = process.env, timeoutMs = 10 * 60_000 } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError('Invalid audit command name')
  await mkdir(directory, { recursive: true })
  const stdoutPath = join(directory, name + '.stdout.log'), stderrPath = join(directory, name + '.stderr.log')
  const stdoutFd = openSync(stdoutPath, 'wx'), stderrFd = openSync(stderrPath, 'wx')
  const receipt = { name, command, cwd: resolve(cwd ?? process.cwd()), startedAt: new Date().toISOString(),
    timeoutMs, exitCode: null, signal: null, timedOut: false, spawnError: null, receivedSignal: null }
  const start = performance.now()
  let child, timeout, killTimeout
  const terminate = signal => {
    if (!child?.pid) return
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) { if (error.code !== 'ESRCH') receipt.terminationError = String(error) }
  }
  const interrupt = signal => { receipt.receivedSignal = signal; terminate(signal) }
  const onSigint = () => interrupt('SIGINT'), onSigterm = () => interrupt('SIGTERM')
  process.on('SIGINT', onSigint); process.on('SIGTERM', onSigterm)
  try {
    child = spawn(command[0], command.slice(1), { cwd: receipt.cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', bytes => writeSync(stdoutFd, bytes))
    child.stderr.on('data', bytes => writeSync(stderrFd, bytes))
    child.on('error', error => { receipt.spawnError = String(error) })
    timeout = setTimeout(() => {
      receipt.timedOut = true
      terminate('SIGTERM')
      killTimeout = setTimeout(() => terminate('SIGKILL'), 5000)
    }, timeoutMs)
    const result = await new Promise(resolveClose => child.once('close', (exitCode, signal) => resolveClose({ exitCode, signal })))
    Object.assign(receipt, result)
  } finally {
    clearTimeout(timeout); clearTimeout(killTimeout)
    process.off('SIGINT', onSigint); process.off('SIGTERM', onSigterm)
    closeSync(stdoutFd); closeSync(stderrFd)
  }
  receipt.finishedAt = new Date().toISOString()
  receipt.durationMs = Math.round(performance.now() - start)
  receipt.stdoutSha256 = await hashFile(stdoutPath); receipt.stderrSha256 = await hashFile(stderrPath)
  await writeJson(join(directory, name + '.command.json'), receipt)
  return { ...receipt, stdout: await readFile(stdoutPath, 'utf8'), stderr: await readFile(stderrPath, 'utf8') }
}
