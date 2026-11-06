import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createBrotliDecompress } from 'node:zlib'
import { captureNavigationDependencies, verifyNavigationDependencies } from '../parity/git-navigation-roots.mjs'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { NAVIGATION153, verifyNavigation153, verifyNavigationTimelines, verifyOriginalNavigation153 } from './navigation153-results.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)
assert(args.length === 0 || (args.length === 2 && args[0] === '--mode'
  && ['diagnostic', 'original-only'].includes(args[1])), 'Use --mode diagnostic or --mode original-only')
const mode = args[1] ?? 'diagnostic', originalOnly = mode === 'original-only'
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This diagnostic may launch Chromium only in hosted GitHub Actions')
assert.equal(process.env.GITHUB_REF, 'refs/heads/audit/navigation-153-probe-2026-11-06')
assert(process.env.EDITOR_RESULTS_DIR, 'Use an initialized current-run results directory')
const expectedHead = process.env.GITHUB_SHA
assert(/^[a-f0-9]{40}$/.test(expectedHead ?? ''), 'Exact published source SHA is required')
const baseHead = '0dd49e4c826e0d4c1f70cfd3746400d2c9a7391b'
const allowlist = [
  '.github/workflows/rector-v2-navigation153.yml',
  'scripts/audit/html-navigation-diagnostic.mjs',
  'scripts/audit/focused-browser-results.mjs',
  'scripts/audit/navigation-diagnostics.mjs',
  'scripts/audit/navigation153.mjs',
  'scripts/audit/navigation153-results.mjs',
  'scripts/audit/navigation153-results.test.mjs',
]
const output = resolve(process.env.EDITOR_RESULTS_DIR, 'navigation153')
await mkdir(output) // Preserve any earlier attempt.
const runtimeRoot = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-navigation153-'))
const binaryRoot = join(runtimeRoot, 'binary'), packageRoot = join(runtimeRoot, 'package')
await mkdir(binaryRoot); await mkdir(packageRoot)
const diagnosticOutput = join(runtimeRoot, 'diagnostic')
const sourceURL = 'https://registry.npmjs.org/@sparticuz/chromium/-/chromium-153.0.0.tgz'
const runnerPath = join(root, 'scripts/audit/html-navigation-diagnostic.mjs')
const helperPath = join(root, 'scripts/audit/navigation-diagnostics.mjs')
const result = {
  kind: 'Single hosted current-source check with the recovered historical Chromium153 binary', mode,
  startedAt: new Date().toISOString(), baseHead, expectedHead, output, runtimeRoot, sourceURL,
  plannedOriginalComparisons: 72, plannedCausalContexts: originalOnly ? 0 : 16, plannedCausalComparisons: originalOnly ? 0 : 12,
  plannedTotalContexts: originalOnly ? 84 : 100, navigationOutcomeDeadlineMs: 5000, diagnosticCommandTimeoutMs: 20 * 60_000,
  attempts: 1, retries: 0, launchOptions: { executablePath: join(binaryRoot, 'chromium'), headless: true },
  extraBrowserArgs: [], expected: NAVIGATION153, commands: [], pass: false,
  originalArchivedFailure: { head: 'e8ceb556d9ecc283f686e95c0c752ecf113a3031', passed: 70, total: 72, status: 'OPEN' },
  limitations: [
    'The archived e8 source object is unavailable. This is current product source derived from0dd, not an exact historical-source recreation.',
    'Only the Chromium binary and pinned Playwright package are reproduced; the hosted OS, libraries, fonts, scheduling and surrounding process history differ.',
    originalOnly ? 'This mode executes only the maintained runner; it adds no navigation observers, evaluations, control contexts or fallback run.'
      : 'The reviewed observer uses additional CDP sessions and Playwright evaluations which can refresh activation or alter scheduling.',
    'The retained diagnostic logger permits DOM event payloads to overwrite the event label; that mode requires interpreting raw stage/event fields.',
    'A current-source PASS cannot establish or erase the cause of the archived Chromium153 failure.',
  ],
}
await writeJson(join(output, 'plan.json'), result)
let binary, playwrightModule, playwrightPackage, browsersDescriptor, runtimeLock, runtimeFilesBefore
const successful = run => {
  assert.equal(run.exitCode, 0, 'Setup command failed: ' + run.name)
  assert(!run.signal && !run.receivedSignal && !run.timedOut && !run.spawnError, 'Setup was interrupted or unavailable')
  return run
}
async function command(name, args, options = {}) {
  const run = await recordCommand(output, name, args, { cwd: runtimeRoot, ...options })
  result.commands.push({ name, exitCode: run.exitCode, signal: run.signal, receivedSignal: run.receivedSignal,
    timedOut: run.timedOut, stdoutSha256: run.stdoutSha256, stderrSha256: run.stderrSha256 })
  return run
}
async function binaryFiles(directory, prefix = '') {
  const files = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name, path = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(files, await binaryFiles(path, relative + '/'))
    else {
      assert(entry.isFile(), 'Unexpected non-file runtime entry: ' + relative)
      files[relative] = await hashFile(path)
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
}
async function unpackSupport(name) {
  const archive = join(runtimeRoot, name + '.tar')
  await pipeline(createReadStream(join(packageRoot, 'package/bin/' + name + '.tar.br')), createBrotliDecompress(), createWriteStream(archive, { flags: 'wx' }))
  const listing = successful(await command('list-' + name, ['tar', '-tf', archive]))
  const members = listing.stdout.trim().split('\n')
  assert(members.length > 0 && members.every(name => !name.startsWith('/') && !name.split('/').includes('..')),
    'Unsafe runtime support archive path')
  successful(await command('extract-' + name, ['tar', '-xf', archive, '--no-same-owner', '-C', binaryRoot]))
}
try {
  result.sourceBefore = await sourceIdentity(root)
  assert.equal(result.sourceBefore.head, expectedHead)
  assert.equal(result.sourceBefore.diffSha256, sha256(''))
  assert.equal(git(root, 'status', '--porcelain').toString(), '')
  assert.deepEqual(git(root, 'diff', '--name-only', baseHead, expectedHead).toString().trim().split('\n').sort(), [...allowlist].sort(),
    'Probe lineage must contain only the seven approved automation files')
  assert.equal(await hashFile(runnerPath), '682e266e6e0470fc2bc614470daff7443e3d68a4f501adff93f63516ffd053c3')
  assert.equal(await hashFile(helperPath), 'bd90f33ea22be0c9e915dae0871258807901712adfe41502dc4d806dc3e4f1b2')
  assert.equal(await hashFile(join(root, 'scripts/parity/html-content-navigation.mjs')), NAVIGATION153.originalRunnerSha256)
  result.dependenciesBefore = await captureNavigationDependencies(root)
  const archivePath = join(runtimeRoot, 'chromium-153.0.0.tgz')
  successful(await command('download-chromium', ['curl', '--fail', '--location', '--silent', '--show-error',
    '--max-time', '120', '--output', archivePath, sourceURL], { timeoutMs: 150_000 }))
  const archive = await readFile(archivePath)
  const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64')
  assert.equal(integrity, NAVIGATION153.integrity)
  assert.equal(sha256(archive), NAVIGATION153.archiveSha256)
  successful(await command('extract-package', ['tar', '-xzf', archivePath, '--no-same-owner', '-C', packageRoot,
    'package/bin/chromium.br', 'package/bin/fonts.tar.br', 'package/bin/swiftshader.tar.br', 'package/package.json']))
  const packageInfo = JSON.parse(await readFile(join(packageRoot, 'package/package.json'), 'utf8'))
  assert.equal(packageInfo.name, '@sparticuz/chromium'); assert.equal(packageInfo.version, '153.0.0')
  binary = join(binaryRoot, 'chromium')
  await pipeline(createReadStream(join(packageRoot, 'package/bin/chromium.br')), createBrotliDecompress(), createWriteStream(binary, { flags: 'wx' }))
  assert.equal(await hashFile(binary), NAVIGATION153.binarySha256)
  await chmod(binary, 0o755)
  await unpackSupport('fonts'); await unpackSupport('swiftshader')
  successful(await command('npm-playwright', ['npm', 'install', '--prefix', runtimeRoot, '--ignore-scripts', '--no-audit',
    '--no-fund', '--save-exact', 'playwright@' + NAVIGATION153.playwright],
  { env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', npm_config_fetch_retries: '0' } }))
  playwrightModule = join(runtimeRoot, 'node_modules/playwright/index.mjs')
  playwrightPackage = join(runtimeRoot, 'node_modules/playwright/package.json')
  browsersDescriptor = join(runtimeRoot, 'node_modules/playwright-core/browsers.json')
  runtimeLock = join(runtimeRoot, 'package-lock.json')
  const playwrightInfo = JSON.parse(await readFile(playwrightPackage, 'utf8'))
  assert.equal(playwrightInfo.version, NAVIGATION153.playwright)
  assert.equal(await hashFile(playwrightModule), NAVIGATION153.playwrightModuleSha256)
  assert.equal(await hashFile(playwrightPackage), 'ca170ec143a88ed3043ac953eb3b2377b2b97304104f4e1e23316684ce2c35af')
  assert.equal(await hashFile(browsersDescriptor), 'f306eed529599b1eaf2f8a85db9de2b23e1a3fe36c2b66434b7c9434fb627a99')
  successful(await command('install-system-dependencies', [process.execPath, join(runtimeRoot, 'node_modules/playwright/cli.js'),
    'install-deps', 'chromium'], { timeoutMs: 15 * 60_000 }))
  const version = successful(await command('chromium-version', [binary, '--version'], { timeoutMs: 30_000 }))
  assert.equal(version.stdout.trim(), 'Chromium ' + NAVIGATION153.browser)
  runtimeFilesBefore = await binaryFiles(binaryRoot)
  result.runtimeBefore = {
    archiveBytes: archive.length, archiveSha256: sha256(archive), integrity, package: { name: packageInfo.name, version: packageInfo.version },
    binarySha256: await hashFile(binary), browserVersion: version.stdout.trim(), binaryFiles: runtimeFilesBefore,
    playwrightVersion: playwrightInfo.version, playwrightModuleSha256: await hashFile(playwrightModule),
    playwrightPackageSha256: await hashFile(playwrightPackage), browsersJsonSha256: await hashFile(browsersDescriptor),
    packageLockSha256: await hashFile(runtimeLock), node: process.version,
  }
  await writeJson(join(output, 'runtime-before.json'), result.runtimeBefore)
  await writeFile(join(output, 'runtime-package-lock.json'), await readFile(runtimeLock), { flag: 'wx' })
  await writeFile(join(output, 'browsers.json'), await readFile(browsersDescriptor), { flag: 'wx' })
  const run = await command(originalOnly ? 'original' : 'diagnostic', originalOnly
    ? [process.execPath, join(root, 'scripts/parity/html-content-navigation.mjs')]
    : [process.execPath, runnerPath, '--original-scope', 'full', '--out', diagnosticOutput],
    { cwd: root, timeoutMs: result.diagnosticCommandTimeoutMs, env: { ...process.env, EDITOR_CHROME_PATH: binary,
      EDITOR_PLAYWRIGHT_PATH: playwrightModule, EDITOR_DEPENDENCIES_ROOT: join(root, 'node_modules'),
      EDITOR_NAVIGATION_EXPECTED_HEAD: expectedHead } })
  result.nativeProcess = { exitCode: run.exitCode, signal: run.signal, receivedSignal: run.receivedSignal,
    timedOut: run.timedOut, spawnError: run.spawnError }
  if (originalOnly) {
    const report = JSON.parse(run.stdout)
    await writeJson(join(output, 'original-report.json'), report)
    assert.equal(report.browserExecutable, binary, 'Maintained runner selected a different binary')
    assert.deepEqual(report.dependencies, result.dependenciesBefore, 'Maintained runner dependencies differ')
    result.classification = verifyOriginalNavigation153(run, result.runtimeBefore, expectedHead)
  } else {
    const report = JSON.parse(await readFile(join(diagnosticOutput, 'diagnostic-results.json'), 'utf8'))
    result.classification = verifyNavigation153(run, report, result.runtimeBefore, expectedHead)
    assert.deepEqual(JSON.parse(run.stdout), report, 'Raw stdout differs from the saved diagnostic')
    const timelines = []
    for (const [name, hash] of Object.entries(report.artifacts)) {
      assert.equal(basename(name), name)
      assert.equal(await hashFile(join(diagnosticOutput, name)), hash, 'Timeline digest mismatch')
      if (name !== 'browser-target-timeline.json') timelines.push(JSON.parse(await readFile(join(diagnosticOutput, name), 'utf8')))
    }
    result.cutoffEvidence = verifyNavigationTimelines(timelines)
  }
  result.pass = true
} catch (error) {
  result.error = error.stack ?? String(error)
} finally {
  try {
    if (result.sourceBefore) {
      result.sourceAfter = await sourceIdentity(root)
      result.sourceUnchanged = JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter)
      assert.equal(result.sourceUnchanged, true, 'Source changed during diagnostic')
    }
    if (result.dependenciesBefore) {
      await verifyNavigationDependencies(root, result.dependenciesBefore)
      result.dependenciesUnchanged = true
    }
    if (result.runtimeBefore) {
      result.runtimeAfter = { binarySha256: await hashFile(binary), binaryFiles: await binaryFiles(binaryRoot),
        playwrightModuleSha256: await hashFile(playwrightModule), playwrightPackageSha256: await hashFile(playwrightPackage),
        browsersJsonSha256: await hashFile(browsersDescriptor), packageLockSha256: await hashFile(runtimeLock) }
      for (const [key, value] of Object.entries(result.runtimeAfter)) assert.deepEqual(value, result.runtimeBefore[key], 'Runtime changed: ' + key)
      result.runtimeUnchanged = true
    }
  } catch (error) { result.pass = false; result.integrityError = error.stack ?? String(error) }
  try {
    if (!originalOnly) await cp(diagnosticOutput, join(output, 'diagnostic'), { recursive: true,
      filter: path => path !== join(diagnosticOutput, 'vite-cache') && !path.startsWith(join(diagnosticOutput, 'vite-cache') + sep) })
  } catch (error) {
    if (result.pass || error.code !== 'ENOENT') { result.pass = false; result.copyError = String(error) }
  }
  result.finishedAt = new Date().toISOString()
  await writeJson(join(output, 'result.json'), result)
}
console.log(JSON.stringify({ pass: result.pass, output, classification: result.classification, error: result.error ?? result.integrityError ?? result.copyError ?? null }))
if (!result.pass) process.exitCode = 1
