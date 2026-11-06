import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureNavigationDependencies, verifyNavigationDependencies } from '../parity/git-navigation-roots.mjs'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { FULL_CLIPBOARD_CASES, FONT_SIZE_RETAINED_CASES, STANDARD_CLIPBOARD_CASES,
  verifyClipboardRed, verifyNativeGreen, verifyNavigationGreen } from './focused-browser-results.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
assert(process.env.EDITOR_RESULTS_DIR, 'Set EDITOR_RESULTS_DIR to a fresh results directory')
const output = resolve(process.env.EDITOR_RESULTS_DIR, 'focused-browser')
await mkdir(output, { recursive: true })
const baselineCommit = 'acabb24dc90fb98f2c38c2bc34069b043f4ba4fe'
const clipboardPath = 'core/ClipboardController.js'
const order = ['navigation-151', 'clipboard-red', 'clipboard-green', 'font-size-retained-green']
const report = { kind: 'Maintained native browser verification with one controlled F01 counterfactual',
  startedAt: new Date().toISOString(), plannedOrder: order, retries: 0, baselineCommit,
  localEnvironmentLimitation: 'Local Chromium151 startup could not create its ProcessSingleton socket; no local browser assertions executed.',
  steps: Object.fromEntries(order.map(name => [name, { outcome: 'NOT_RUN' }])), pass: false }
await writeJson(join(output, 'plan.json'), { ...report,
  navigation: { comparisons: 72, contexts: 84, internalOutcomeDeadlineMs: 5000, filters: null },
  clipboardRed: { cases: STANDARD_CLIPBOARD_CASES, overlay: clipboardPath, description: 'Current candidate checkout with only the baseline ClipboardController restored' },
  clipboardGreen: { cases: FULL_CLIPBOARD_CASES, filters: null },
  fontSizeGreen: { cases: FONT_SIZE_RETAINED_CASES },
})
let sourceBefore, dependencyBefore, runtime, baseline, baselineParent
const baseEnvironment = { ...process.env }
for (const name of ['EDITOR_NATIVE_FILTER', 'EDITOR_NATIVE_PAGE', 'EDITOR_BROWSER_PAGE', 'EDITOR_BROWSER_ROOT']) delete baseEnvironment[name]

async function attempt(name, cwd, env, command, classify, expectedSource) {
  const directory = join(output, name)
  await mkdir(directory, { recursive: true })
  const step = { outcome: 'FAIL', sourceBefore: await sourceIdentity(cwd) }
  report.steps[name] = step
  try {
    assert.deepEqual(step.sourceBefore, expectedSource, 'Source changed before planned browser command')
    const result = await recordCommand(directory, 'run', command, { cwd, env: { ...baseEnvironment, ...env, EDITOR_RESULTS_DIR: directory } })
    step.process = { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut,
      spawnError: result.spawnError, receivedSignal: result.receivedSignal,
      stdoutSha256: result.stdoutSha256, stderrSha256: result.stderrSha256 }
    step.classification = classify(result)
    if (env.EDITOR_NATIVE_PAGE) {
      const observed = JSON.parse(await readFile(join(directory, 'physical-browser-environment.json'), 'utf8'))
      assert.equal(observed.executable, process.env.EDITOR_CHROME_PATH)
      assert(observed.browser.endsWith('/151.0.7922.34'), 'Native page used an unpaired browser')
      step.browser = observed
    }
    step.outcome = 'PASS'
  } catch (error) {
    step.error = String(error.stack ?? error)
  } finally {
    try {
      step.sourceAfter = await sourceIdentity(cwd)
      assert.deepEqual(step.sourceAfter, step.sourceBefore, 'Source changed during browser command')
    } catch (error) { step.outcome = 'FAIL'; step.sourceError = String(error.stack ?? error) }
    await writeJson(join(directory, 'classification.json'), step)
  }
  console.log(`${name}: ${step.outcome}`)
  if (step.process?.receivedSignal) {
    throw Object.assign(new Error(`Audit interrupted by ${step.process.receivedSignal}; later stages were not started`), { interrupted: true })
  }
}

try {
  runtime = JSON.parse(await readFile(process.env.EDITOR_AUDIT_RUNTIME_RECEIPT, 'utf8'))
  assert.equal(runtime.pass, true)
  assert.deepEqual(runtime.expected, { playwright: '1.62.1', chromium: '151.0.7922.34', revision: '1234' })
  assert.equal(process.env.EDITOR_CHROME_PATH, runtime.EDITOR_CHROME_PATH)
  assert.equal(process.env.EDITOR_PLAYWRIGHT_PATH, runtime.EDITOR_PLAYWRIGHT_PATH)
  assert.equal(await hashFile(process.env.EDITOR_CHROME_PATH), runtime.executableSha256)
  report.runtime = runtime
  sourceBefore = await sourceIdentity(root)
  assert.equal(sourceBefore.diffSha256, sha256(''), 'Hosted audit requires a committed, clean candidate')
  assert.equal(git(root, 'ls-files', '--others', '--exclude-standard').toString().trim(), '', 'Hosted audit requires no untracked source')
  report.sourceBefore = sourceBefore
  dependencyBefore = await captureNavigationDependencies(root)
  report.dependenciesBefore = dependencyBefore

  await attempt('navigation-151', root, {}, [process.execPath, 'scripts/parity/html-content-navigation.mjs'],
    run => verifyNavigationGreen(run, sourceBefore.head), sourceBefore)

  try {
    baselineParent = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-f01-counterfactual-'))
    baseline = join(baselineParent, 'checkout')
    git(root, 'worktree', 'add', '--detach', baseline, sourceBefore.head)
    const oldController = git(root, 'show', `${baselineCommit}:${clipboardPath}`)
    assert.notEqual(sha256(oldController), sourceBefore.files[clipboardPath], 'Counterfactual has no product delta')
    await writeFile(join(baseline, clipboardPath), oldController)
    await writeFile(join(output, 'baseline-ClipboardController.js'), oldController, { flag: 'wx' })
    await symlink(join(root, 'node_modules'), join(baseline, 'node_modules'), 'dir')
    const baselineSource = await sourceIdentity(baseline)
    assert.deepEqual(Object.keys(baselineSource.files), Object.keys(sourceBefore.files))
    for (const [path, hash] of Object.entries(sourceBefore.files)) {
      assert.equal(baselineSource.files[path], path === clipboardPath ? sha256(oldController) : hash,
        `Unexpected counterfactual difference: ${path}`)
    }
    report.counterfactual = { baselineCommit, candidateHead: sourceBefore.head, onlyChangedPath: clipboardPath,
      baselineBlob: git(root, 'rev-parse', `${baselineCommit}:${clipboardPath}`).toString().trim(),
      baselineSha256: sha256(oldController), candidateSha256: sourceBefore.files[clipboardPath],
      dependencies: 'The same installed node_modules tree is shared by both worktrees', source: baselineSource }
    await writeJson(join(output, 'counterfactual.json'), report.counterfactual)
    await attempt('clipboard-red', baseline, { EDITOR_NATIVE_PAGE: 'native-clipboard.html', EDITOR_NATIVE_FILTER: 'external standard clipboard' },
      [process.execPath, 'tests/browser/physical-history.mjs'], verifyClipboardRed, baselineSource)
  } catch (error) {
    if (error.interrupted) throw error
    report.steps['clipboard-red'] = { outcome: 'FAIL', error: String(error.stack ?? error), classification: 'COUNTERFACTUAL_SETUP_FAILED' }
    await writeJson(join(output, 'counterfactual-failure.json'), report.steps['clipboard-red'])
  }

  await attempt('clipboard-green', root, { EDITOR_NATIVE_PAGE: 'native-clipboard.html' },
    [process.execPath, 'tests/browser/physical-history.mjs'],
    run => verifyNativeGreen(run, 'native-clipboard.html', FULL_CLIPBOARD_CASES), sourceBefore)
  await attempt('font-size-retained-green', root, { EDITOR_NATIVE_PAGE: 'native-tools.html', EDITOR_NATIVE_FILTER: 'native retained FontSize ' },
    [process.execPath, 'tests/browser/physical-history.mjs'],
    run => verifyNativeGreen(run, 'native-tools.html', FONT_SIZE_RETAINED_CASES), sourceBefore)

  await verifyNavigationDependencies(root, dependencyBefore)
  report.dependenciesUnchanged = true
  assert.equal(await hashFile(process.env.EDITOR_CHROME_PATH), runtime.executableSha256, 'Browser binary changed during verification')
  assert.equal(await hashFile(process.env.EDITOR_PLAYWRIGHT_PATH), runtime.playwrightModuleSha256, 'Playwright entry changed during verification')
  report.sourceAfter = await sourceIdentity(root)
  assert.deepEqual(report.sourceAfter, sourceBefore, 'Candidate changed during focused audit')
  report.sourceUnchanged = true
  report.pass = order.every(name => report.steps[name]?.outcome === 'PASS')
} catch (error) {
  report.error = String(error.stack ?? error)
} finally {
  if (baseline) {
    try { git(root, 'worktree', 'remove', '--force', baseline) }
    catch (error) { report.pass = false; report.cleanupError = String(error.stack ?? error) }
  }
  if (baselineParent && !report.cleanupError) await rm(baselineParent, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  await writeJson(join(output, 'result.json'), report)
}
console.log(JSON.stringify({ pass: report.pass, steps: Object.fromEntries(Object.entries(report.steps).map(([name, step]) => [name, step.outcome])), output }))
if (!report.pass) process.exitCode = 1
