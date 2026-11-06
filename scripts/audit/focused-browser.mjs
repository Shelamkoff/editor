import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureNavigationDependencies, verifyNavigationDependencies } from '../parity/git-navigation-roots.mjs'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { FULL_CLIPBOARD_CASES, COMMIT_FOCUS_CASES, FONT_SIZE_RETAINED_CASES, STANDARD_CLIPBOARD_CASES,
  verifyClipboardRed, verifyFontSizeRetainedRed, verifyNativeGreen, verifyNavigationGreen } from './focused-browser-results.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
assert(process.env.EDITOR_RESULTS_DIR, 'Set EDITOR_RESULTS_DIR to a fresh results directory')
const output = resolve(process.env.EDITOR_RESULTS_DIR, 'focused-browser')
await mkdir(output, { recursive: true })
const baselineCommit = 'acabb24dc90fb98f2c38c2bc34069b043f4ba4fe'
const clipboardPath = 'core/ClipboardController.js'
const fontSizePath = 'inline-tools/fontSize.js'
const order = ['commit-focus-ownership', 'navigation-151', 'clipboard-red', 'clipboard-green', 'font-size-retained-red', 'font-size-retained-green']
const report = { kind: 'Maintained native browser verification with commit focus regressions and isolated F01 and F07 counterfactuals',
  startedAt: new Date().toISOString(), plannedOrder: order, retries: 0, baselineCommit,
  localEnvironmentLimitation: 'Local Chromium151 startup could not create its ProcessSingleton socket; no local browser assertions executed.',
  steps: Object.fromEntries(order.map(name => [name, { outcome: 'NOT_RUN' }])), pass: false }
await writeJson(join(output, 'plan.json'), { ...report,
  commitFocus: { page: 'native-core-behavior.html', cases: COMMIT_FOCUS_CASES, filter: 'commit-observer focus' },
  navigation: { comparisons: 72, contexts: 84, internalOutcomeDeadlineMs: 5000, filters: null },
  clipboardRed: { cases: STANDARD_CLIPBOARD_CASES, overlay: clipboardPath, description: 'Current candidate checkout with only the baseline ClipboardController restored' },
  clipboardGreen: { cases: FULL_CLIPBOARD_CASES, filters: null },
  fontSizeRed: { cases: FONT_SIZE_RETAINED_CASES, overlay: fontSizePath, description: 'Current candidate checkout with only the baseline FontSize restored' },
  fontSizeGreen: { cases: FONT_SIZE_RETAINED_CASES },
})
let sourceBefore, dependencyBefore, runtime
const counterfactuals = []
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

async function counterfactual(name, productPath, artifactName, reportKey, env, classify) {
  try {
    const parent = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), `rector-${name}-`))
    const owned = { parent, checkout: null }
    counterfactuals.push(owned)
    const checkout = join(parent, 'checkout')
    git(root, 'worktree', 'add', '--detach', checkout, sourceBefore.head)
    owned.checkout = checkout
    const oldProduct = git(root, 'show', `${baselineCommit}:${productPath}`)
    assert.notEqual(sha256(oldProduct), sourceBefore.files[productPath], 'Counterfactual has no product delta')
    await writeFile(join(checkout, productPath), oldProduct)
    await writeFile(join(output, `baseline-${productPath.split('/').at(-1)}`), oldProduct, { flag: 'wx' })
    await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir')
    const baselineSource = await sourceIdentity(checkout)
    assert.deepEqual(Object.keys(baselineSource.files), Object.keys(sourceBefore.files))
    for (const [path, hash] of Object.entries(sourceBefore.files)) {
      assert.equal(baselineSource.files[path], path === productPath ? sha256(oldProduct) : hash,
        `Unexpected counterfactual difference: ${path}`)
    }
    const metadata = { baselineCommit, candidateHead: sourceBefore.head, onlyChangedPath: productPath,
      baselineBlob: git(root, 'rev-parse', `${baselineCommit}:${productPath}`).toString().trim(),
      baselineSha256: sha256(oldProduct), candidateSha256: sourceBefore.files[productPath],
      dependencies: 'The same installed node_modules tree is shared by both worktrees', source: baselineSource }
    report[reportKey] = metadata
    await writeJson(join(output, `${artifactName}.json`), metadata)
    await attempt(name, checkout, env, [process.execPath, 'tests/browser/physical-history.mjs'], classify, baselineSource)
  } catch (error) {
    if (error.interrupted) throw error
    report.steps[name] = { outcome: 'FAIL', error: String(error.stack ?? error), classification: 'COUNTERFACTUAL_SETUP_FAILED' }
    await writeJson(join(output, `${artifactName}-failure.json`), report.steps[name])
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

  await attempt('commit-focus-ownership', root,
    { EDITOR_NATIVE_PAGE: 'native-core-behavior.html', EDITOR_NATIVE_FILTER: 'commit-observer focus' },
    [process.execPath, 'tests/browser/physical-history.mjs'],
    run => verifyNativeGreen(run, 'native-core-behavior.html', COMMIT_FOCUS_CASES), sourceBefore)

  await attempt('navigation-151', root, {}, [process.execPath, 'scripts/parity/html-content-navigation.mjs'],
    run => verifyNavigationGreen(run, sourceBefore.head), sourceBefore)

  await counterfactual('clipboard-red', clipboardPath, 'counterfactual', 'counterfactual',
    { EDITOR_NATIVE_PAGE: 'native-clipboard.html', EDITOR_NATIVE_FILTER: 'external standard clipboard' }, verifyClipboardRed)

  await attempt('clipboard-green', root, { EDITOR_NATIVE_PAGE: 'native-clipboard.html' },
    [process.execPath, 'tests/browser/physical-history.mjs'],
    run => verifyNativeGreen(run, 'native-clipboard.html', FULL_CLIPBOARD_CASES), sourceBefore)
  await counterfactual('font-size-retained-red', fontSizePath, 'font-size-counterfactual', 'fontSizeCounterfactual',
    { EDITOR_NATIVE_PAGE: 'native-tools.html', EDITOR_NATIVE_FILTER: 'native retained FontSize ' }, verifyFontSizeRetainedRed)
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
  for (const owned of counterfactuals) {
    try {
      if (owned.checkout) git(root, 'worktree', 'remove', '--force', owned.checkout)
      await rm(owned.parent, { recursive: true, force: true })
    } catch (error) {
      report.pass = false
      ;(report.cleanupErrors ??= []).push(String(error.stack ?? error))
    }
  }
  report.finishedAt = new Date().toISOString()
  await writeJson(join(output, 'result.json'), report)
}
console.log(JSON.stringify({ pass: report.pass, steps: Object.fromEntries(Object.entries(report.steps).map(([name, step]) => [name, step.outcome])), output }))
if (!report.pass) process.exitCode = 1
