import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { MEDIA_CASES, classifyMediaPage } from './native-media-diagnostic.mjs'

const BASE = '68575c89a8c9dadf5a651840e8a7695d5917c591'
const BROWSER = '156.0.8078.79'
const RUNNER = 'tests/browser/physical-history.mjs'
const FIXTURE = 'tests/browser/regressions/html-content-native.js'
const PAGE = 'native-html-content.html'
const ORDER = ['introduction', 'native-text-input.html', 'native-attaches-downloads.html', PAGE]
const HISTORY = ['native typing', 'structural Enter split', 'insert', 'move', 'convert', 'remove', 'clear', 'render', 'toolbar insert', 'keyboard undo/redo', 'read-only transition', 'pointer drag session', 'read-only host authority', 'direct/inverse transaction events']
const SCENARIOS = {
  enterScenario: ['beforeBold', 'afterBold', 'afterUndo', 'afterRedo', 'afterRemoveBold', 'afterUndoRemoval'],
  toolboxScenario: ['toolboxBeforeBold', 'toolboxAfterImmediateUndo', 'deleteLastImmediateUndo', 'deleteLastRedo', 'deleteLastUndoAgain', 'deleteMiddle', 'deleteMiddleUndo', 'inlineAfterDeleteUndo'],
}
export const MEDIA_CONTEXT_LABELS = Object.freeze(Array.from({ length: 4 }, (_, index) => `ordinary-prefix-${String(index + 1).padStart(2, '0')}`))
const PER_ATTEMPT_TIMEOUT_MS = 20 * 60_000
export const ORDINARY_COMPLETE = 'RECTOR_ORDINARY_COMPLETE_v1'
export const CONTEXT_COMMAND = '"$1" tests/browser/run.mjs && printf "%s\\n" RECTOR_ORDINARY_COMPLETE_v1 && "$1" tests/browser/physical-history.mjs'

export function mediaContextOutcome(attempts, sameRuntime) {
  assert.deepEqual(attempts.map(attempt => attempt.label), MEDIA_CONTEXT_LABELS, 'Expected all four planned ordinary/physical pairs exactly once in order')
  for (const attempt of attempts) if (attempt.complete === true) {
    assert.equal(attempt.cases, 28)
    assert.equal(attempt.ordinary?.visits, 69)
    assert.equal(attempt.ordinary?.uniquePages, 65)
    assert.equal(attempt.ordinary?.explicitPassed, 2034)
    assert(Number.isSafeInteger(attempt.failures) && attempt.failures >= 0 && attempt.failures <= 28)
    assert.equal(attempt.passed, attempt.failures === 0, 'Prefix verdict disagrees with its original case assertions')
  }
  const incompleteAttempts = attempts.filter(attempt => attempt.complete !== true).map(attempt => attempt.label)
  const productFailedAttempts = attempts.filter(attempt => attempt.complete === true && attempt.passed !== true).map(attempt => attempt.label)
  const collectionComplete = incompleteAttempts.length === 0
  return { pass: sameRuntime === true && collectionComplete && productFailedAttempts.length === 0,
    collectionComplete, plannedAttemptCount: MEDIA_CONTEXT_LABELS.length, collectedAttemptCount: attempts.length,
    passedAttemptCount: attempts.filter(attempt => attempt.complete === true && attempt.passed === true).length,
    productFailedAttempts, incompleteAttempts, sameRuntime, releaseAccepted: false }
}

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'Media prefix overlay anchor changed or is ambiguous')
  return source.replace(anchor, replacement)
}

// Registration only: callbacks are never invoked, imports are not executed, and
// a changed top-level fixture dependency fails instead of silently losing cases.
export async function loadPrefixCases(root) {
  const inventory = {}
  for (const [key, file, count] of [['nativeTextInput', 'native-text-input.js', 52], ['nativeAttachesDownloads', 'native-attaches-downloads.js', 13]]) {
    const original = await readFile(join(root, 'tests/browser', file), 'utf8')
    const code = replaceOnce(original, 'await run()', '').replace(/^import\s[\s\S]*?from\s*['"][^'"\n]+['"]\s*;?\s*$/gm, '')
    const names = []
    runInNewContext(code, { test(name, callback) {
      assert.equal(typeof name, 'string'); assert.equal(typeof callback, 'function'); names.push(name)
    } }, { filename: file, timeout: 1000 })
    assert.equal(names.length, count, 'The complete maintained prefix inventory changed')
    inventory[key] = names
  }
  return inventory
}

export function ordinaryCaseInventory(source) {
  const start = 'const labels = ', end = 'const pages = '
  assert.equal(source.split(start).length, 2)
  assert.equal(source.split(end).length, 2)
  const labels = [...runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)) + '\nlabels', {}, { timeout: 1000 })]
  assert.equal(labels.length, 69)
  assert.equal(new Set(labels).size, 65)
  assert(labels.every(label => /^[a-z0-9-]+\.html?$/.test(label)))
  return labels
}

export function classifyOrdinaryOutput(stdout, inventory) {
  assert.equal(inventory.length, 69)
  assert.equal(new Set(inventory).size, 65)
  const matches = [...stdout.matchAll(/^([A-Za-z0-9_-]+\.html?): /gm)]
  assert.deepEqual(matches.map(match => match[1]), inventory, 'Missing, duplicated or substituted ordinary visits')
  const rows = matches.map((match, index) => {
    const text = stdout.slice(match.index + match[0].length, matches[index + 1]?.index ?? stdout.length).trim()
    let value
    if (match[1] === 'mention-session-race.html') {
      assert.equal(text, 'mention pagination and realm ownership remain isolated')
      value = text
    } else {
      value = JSON.parse(text)
      assert(value && typeof value === 'object')
    }
    const statuses = Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && Object.hasOwn(row, 'status')).map(row => row.status) : []
    assert(statuses.every(status => status === 'PASS'), 'An ordinary assertion failed or was skipped')
    if (match[1] === 'harness-contract.html') {
      assert.equal(value.correct, true)
      assert.deepEqual(value.outcomes.map(row => row.status), value.want, 'Deliberate harness failures were not detected')
    }
    if (match[1] === 'poll-state-contracts.html') {
      assert.equal(value.passed, value.total)
      assert.equal(value.results.length, value.total)
      assert(value.results.every(row => row.pass === true))
    }
    return { page: match[1], summary: value, explicitPassed: statuses.length }
  })
  const explicitPassed = rows.reduce((sum, row) => sum + row.explicitPassed, 0)
  assert.equal(explicitPassed, 2034, 'Incomplete ordinary assertion inventory')
  const environments = stdout.split(/\r?\n/).filter(line => line.startsWith('Browser environment: '))
  assert.equal(environments.length, 1)
  const browser = JSON.parse(environments[0].slice('Browser environment: '.length))
  assert.equal(browser.product, 'Chrome/' + BROWSER)
  return { visits: rows.length, uniquePages: new Set(rows.map(row => row.page)).size, explicitPassed, browser, rows }
}

export function classifyMediaContext(run, inventory) {
  const parts = run.stdout.split(ORDINARY_COMPLETE + '\n')
  assert.equal(parts.length, 2, 'Expected one successful ordinary runner followed by one physical prefix')
  const ordinary = classifyOrdinaryOutput(parts[0], inventory.ordinary)
  const media = classifyMediaPage({ ...run, stdout: parts[1] })
  const reports = parts[1].split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line)).filter(value => Object.hasOwn(value, 'mediaPrefix'))
  assert.equal(reports.length, 1, 'Expected exactly one completed physical prefix report')
  const prefix = reports[0].mediaPrefix
  assert.equal(prefix.version, 1)
  assert.deepEqual(prefix.order, ORDER)
  assert.deepEqual(prefix.introduction?.historyMatrix, { historyCases: HISTORY,
    publicEvents: ['transaction:committed', 'document:changed', 'history:changed'] })
  for (const [key, names] of Object.entries(SCENARIOS)) {
    assert.deepEqual(Object.keys(prefix.introduction[key]), names, 'Incomplete physical introduction')
    for (const name of names) assert(Array.isArray(prefix.introduction[key][name].blocks))
  }
  for (const [key, count] of [['nativeTextInput', 52], ['nativeAttachesDownloads', 13]]) {
    assert.equal(inventory[key].length, count)
    assert.deepEqual(prefix[key]?.map(row => row.name), inventory[key], 'Incomplete or substituted native prefix cases')
    assert(prefix[key].every(row => row.status === 'PASS'), 'The preceding native page did not pass')
  }
  return { ...media, ordinary, prefix }
}

export function buildPrefixRunner(original) {
  const cutoff = "  const nativeHtmlContent = await runNativePage(client, pageUrl, 'native-html-content.html')\n"
  const cleanup = '\n  }\n  }\n} finally {\n  client?.close()'
  assert.equal(original.split(cutoff).length, 2)
  assert.equal(original.split(cleanup).length, 2)
  const prefix = original.slice(0, original.indexOf(cutoff))
  const suffix = original.slice(original.indexOf(cleanup))
  const bounded = prefix + '  try {\n' + cutoff
    + `  console.log(JSON.stringify({ '${PAGE}': nativeHtmlContent }))\n`
    + '  } finally {\n'
    + `    console.log(JSON.stringify({ mediaPrefix: { version: 1, order: ${JSON.stringify(ORDER)},\n`
    + '      introduction, nativeTextInput, nativeAttachesDownloads } }))\n'
    + '  }' + suffix
  return bounded
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  assert(process.env.EDITOR_RESULTS_DIR && process.env.EDITOR_CHROME_PATH, 'Set a fresh EDITOR_RESULTS_DIR and the runner browser path')
  const output = resolve(process.env.EDITOR_RESULTS_DIR, 'native-media-context')
  await mkdir(output, { recursive: true })
  const report = { kind: 'Fixed four ordinary-to-physical-prefix media contexts', startedAt: new Date().toISOString(), productionBase: BASE,
    plannedOrder: MEDIA_CONTEXT_LABELS, plannedAttemptCount: MEDIA_CONTEXT_LABELS.length,
    prefixOrder: ORDER, expectedMediaCases: MEDIA_CASES, attempts: [], perAttemptTimeoutMs: PER_ATTEMPT_TIMEOUT_MS,
    retries: 0, stopOnGreen: false, originalPlaybackPauseMs: 100, postVerdictObservationMs: 0, observedFailureBrowser: BROWSER,
    pass: false, releaseAccepted: false,
    qualification: 'Exactly four planned ordinary-to-physical pairs execute in fixed order, including after a product failure. Each pair preserves the maintained ordinary shell-success dependency, independent maintained browser profiles, all 69 ordinary visits and all physical pages through HTML28. Only the copied physical runner tail is omitted after HTML. The original fixture and its failure-only observer remain unchanged: no diagnostic listener, extra DOM evaluation, geometry read or wait is added before the original video verdict. A host-only printf completion marker separates the two maintained commands. This finite context diagnostic cannot establish release acceptance; no failure is replaced by another attempt.' }
  await writeJson(join(output, 'plan.json'), report)
  const environment = { ...process.env }
  for (const key of ['EDITOR_NATIVE_PAGE', 'EDITOR_NATIVE_FILTER', 'EDITOR_BROWSER_PAGE', 'EDITOR_BROWSER_ROOT', 'EDITOR_VITE_PATH', 'EDITOR_CHROME_HEADLESS']) delete environment[key]
  let temporary
  const checkouts = []
  try {
    const before = await sourceIdentity(root)
    assert.equal(process.env.GITHUB_ACTIONS, 'true')
    assert.equal(process.env.GITHUB_REF, 'refs/heads/audit/media-context-probe-2026-11-06')
    assert.equal(before.head, process.env.GITHUB_SHA)
    assert.equal(before.diffSha256, sha256(''), 'Require a committed candidate')
    assert.equal(git(root, 'ls-files', '--others', '--exclude-standard').toString().trim(), '')
    const allowed = ['.github/workflows/rector-v2-audit.yml', 'scripts/audit/native-media-context-probe.mjs', 'scripts/audit/native-media-context-probe.test.mjs']
    const changed = git(root, 'diff', '--name-only', BASE, before.head).toString().trim().split('\n')
    assert.deepEqual(changed.sort(), allowed.sort(), 'Probe branch must change only its three automation files')
    report.sourceBefore = before
    report.expectedPrefixCases = await loadPrefixCases(root)
    report.expectedPrefixCases.ordinary = ordinaryCaseInventory(await readFile(join(root, 'tests/browser/run.mjs'), 'utf8'))
    const executable = await realpath(process.env.EDITOR_CHROME_PATH)
    const version = await recordCommand(output, 'browser-version', [process.env.EDITOR_CHROME_PATH, '--version'], { cwd: root, timeoutMs: 30_000 })
    assert(!version.receivedSignal && !version.signal && !version.timedOut && !version.spawnError)
    assert.equal(version.exitCode, 0)
    report.runtime = { executable: process.env.EDITOR_CHROME_PATH, resolvedExecutable: executable, version: version.stdout.trim(),
      matchesObserved: version.stdout.includes(BROWSER), executableSha256: await hashFile(executable), node: process.version }
    try { report.runtime.installedChromeBinarySha256 = await hashFile(join(dirname(executable), 'chrome')) } catch { /* Non-wrapper executables are already hashed. */ }
    await writeJson(join(output, 'runtime.json'), report.runtime)
    temporary = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-media-context-'))
    const originalRunner = await readFile(join(root, RUNNER), 'utf8')
    const runner = buildPrefixRunner(originalRunner)
    const originalFixture = await readFile(join(root, FIXTURE), 'utf8')
    report.fixtureSha256 = sha256(originalFixture)
    report.fixtureUnchanged = true
    const attempt = async label => {
      const directory = join(output, label), checkout = join(temporary, label)
      await mkdir(directory)
      git(root, 'worktree', 'add', '--detach', checkout, before.head)
      checkouts.push(checkout)
      await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir')
      await writeFile(join(checkout, RUNNER), runner)
      const expected = { [RUNNER]: sha256(runner) }
      assert.deepEqual(git(checkout, 'diff', '--name-only', 'HEAD').toString().trim().split('\n').sort(), Object.keys(expected).sort())
      const overlay = await sourceIdentity(checkout)
      for (const [path, hash] of Object.entries(before.files)) assert.equal(overlay.files[path], expected[path] ?? hash)
      await writeFile(join(directory, 'overlay.diff'), git(checkout, 'diff', '--binary', 'HEAD'), { flag: 'wx' })
      await writeFile(join(directory, 'physical-history.mjs'), runner, { flag: 'wx' })
      await writeFile(join(directory, 'html-content-native.js'), originalFixture, { flag: 'wx' })
      await writeJson(join(directory, 'overlay.json'), { source: overlay, onlyChangedPaths: Object.keys(expected), hashes: expected })
      const run = await recordCommand(directory, 'run', ['bash', '-c', CONTEXT_COMMAND, 'rector-media-context', process.execPath],
        { cwd: checkout, env: { ...environment, EDITOR_RESULTS_DIR: directory }, timeoutMs: PER_ATTEMPT_TIMEOUT_MS })
      let outcome
      try {
        outcome = classifyMediaContext(run, report.expectedPrefixCases)
        outcome.browser = JSON.parse(await readFile(join(directory, 'physical-browser-environment.json'), 'utf8'))
        assert.equal(outcome.browser.executable, process.env.EDITOR_CHROME_PATH)
        assert.equal(outcome.ordinary.browser.executable, process.env.EDITOR_CHROME_PATH)
        assert.equal(outcome.browser.browser, `Chrome/${BROWSER}`, 'Different browser environment from the observed failure')
      } catch (error) { outcome = { complete: false, passed: false, physicalPrefix: run.stdout.includes(ORDINARY_COMPLETE + '\n') ? 'INCOMPLETE_OR_INVALID' : 'NOT_RUN', error: String(error.stack ?? error) } }
      await writeJson(join(directory, 'classification.json'), outcome)
      assert.deepEqual(await sourceIdentity(checkout), overlay)
      assert.deepEqual(await sourceIdentity(root), before)
      if (run.receivedSignal) throw new Error('Interrupted ordinary-to-physical diagnostic: ' + run.receivedSignal)
      return outcome
    }
    for (const label of MEDIA_CONTEXT_LABELS) {
      report.activeAttempt = label
      report.attempts.push({ label, ...await attempt(label) })
      delete report.activeAttempt
    }
    report.sourceAfter = await sourceIdentity(root)
    assert.deepEqual(report.sourceAfter, before)
    report.sourceUnchanged = true
    Object.assign(report, mediaContextOutcome(report.attempts, report.runtime.matchesObserved))
    assert.equal(await hashFile(executable), report.runtime.executableSha256)
    if (report.runtime.installedChromeBinarySha256) assert.equal(await hashFile(join(dirname(executable), 'chrome')), report.runtime.installedChromeBinarySha256)
  } catch (error) { report.pass = false; report.error = String(error.stack ?? error) }
  finally {
    for (const checkout of checkouts) {
      try { git(root, 'worktree', 'remove', '--force', checkout) }
      catch (error) { report.pass = false; (report.cleanupErrors ??= []).push(String(error.stack ?? error)) }
    }
    if (temporary && !report.cleanupErrors) await rm(temporary, { recursive: true, force: true })
    report.collectedAttemptCount = report.attempts.length
    report.uncollectedAttempts = MEDIA_CONTEXT_LABELS.filter(label => !report.attempts.some(attempt => attempt.label === label))
    report.finishedAt = new Date().toISOString()
    await writeJson(join(output, 'result.json'), report)
  }
  console.log(JSON.stringify({ pass: report.pass, collectionComplete: report.collectionComplete ?? false,
    collectedAttempts: report.collectedAttemptCount, passedAttempts: report.passedAttemptCount ?? 0,
    productFailedAttempts: report.productFailedAttempts ?? [], incompleteAttempts: report.incompleteAttempts ?? [],
    releaseAccepted: false, output }))
  if (!report.pass) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
