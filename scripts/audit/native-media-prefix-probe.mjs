import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { MEDIA_CASES, classifyMediaPage, mediaOutcome, instrumentMediaFixture, installPlaybackDiagnostics } from './native-media-diagnostic.mjs'

const BASE = '3ff2774bf5fca67178fea733836b965f1d4ca188'
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

export function classifyMediaPrefix(run, inventory, instrumented = false) {
  const media = classifyMediaPage(run, instrumented)
  const reports = run.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line)).filter(value => Object.hasOwn(value, 'mediaPrefix'))
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
  assert(Array.isArray(prefix.downloads) && Array.isArray(prefix.frames), 'Missing prefix event collection')
  return { ...media, prefix }
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
    + '      introduction, nativeTextInput, nativeAttachesDownloads, ...__mediaPrefixEvents } }))\n'
    + '  }' + suffix
  const collected = replaceOnce(bounded, 'const downloadNames = new Map()\n',
    'const downloadNames = new Map()\nconst __mediaPrefixEvents = { downloads: [], frames: [] }\n')
  const anchor = '  browserClient = await CdpClient.connect(browserVersion.webSocketDebuggerUrl)\n'
  return replaceOnce(collected, anchor, anchor
    + "  for (const method of ['Browser.downloadWillBegin', 'Browser.downloadProgress']) browserClient.on(method, params => {\n"
    + '    __mediaPrefixEvents.downloads.push({ method, hostEpochMs: Date.now(), params })\n  })\n'
    + "  for (const method of ['Page.frameAttached', 'Page.frameNavigated', 'Page.frameDetached', 'Page.frameStartedLoading', 'Page.frameStoppedLoading']) client.on(method, params => {\n"
    + '    __mediaPrefixEvents.frames.push({ method, hostEpochMs: Date.now(), params })\n  })\n')
}

export function prefixPlaybackDiagnosticSource() {
  let code = installPlaybackDiagnostics.toString()
  code = replaceOnce(code, 'const state = () => ({ elapsedMs:', 'const state = () => ({ epochMs: Date.now(), parentTimeOrigin: performance.timeOrigin, childTimeOrigin: child.defaultView?.performance?.timeOrigin ?? null, elapsedMs:')
  code = replaceOnce(code, 'parentActive: node(frame.ownerDocument.activeElement),',
    'parentHasFocus: frame.ownerDocument.hasFocus(), parentVisibility: frame.ownerDocument.visibilityState, parentHidden: frame.ownerDocument.hidden, childHidden: child.hidden, parentActive: node(frame.ownerDocument.activeElement),')
  code = replaceOnce(code, "beforeKey: () => sample('before-key', { frameRect: frame.getBoundingClientRect().toJSON(), videoRect: video.getBoundingClientRect().toJSON() }),",
    "beforeKey: () => sample('before-key'),")
  code = replaceOnce(code, '      record.snapshots.push({ phase, ...state(), ...extra })',
    "      const geometry = phase === 'original-100ms' || phase === 'post-verdict-300ms'\n"
    + '        ? { frameRect: frame.getBoundingClientRect().toJSON(), videoRect: video.getBoundingClientRect().toJSON(),\n'
    + '          parentViewport: { width: frame.ownerDocument.defaultView.innerWidth, height: frame.ownerDocument.defaultView.innerHeight, scrollX: frame.ownerDocument.defaultView.scrollX, scrollY: frame.ownerDocument.defaultView.scrollY },\n'
    + '          childViewport: { width: child.defaultView?.innerWidth ?? null, height: child.defaultView?.innerHeight ?? null, scrollX: child.defaultView?.scrollX ?? null, scrollY: child.defaultView?.scrollY ?? null } } : {}\n'
    + '      record.snapshots.push({ phase, ...state(), ...geometry, ...extra })')
  code = replaceOnce(code, "      listen(child.defaultView, type, false, 'child-bubble')",
    "      listen(child.defaultView, type, false, 'child-bubble')\n      listen(frame.ownerDocument.defaultView, type, true, 'parent-capture')\n      listen(frame.ownerDocument.defaultView, type, false, 'parent-bubble')")
  return code
}

export function instrumentPrefixMediaFixture(original) {
  return replaceOnce(instrumentMediaFixture(original), installPlaybackDiagnostics.toString(), prefixPlaybackDiagnosticSource())
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  assert(process.env.EDITOR_RESULTS_DIR && process.env.EDITOR_CHROME_PATH, 'Set a fresh EDITOR_RESULTS_DIR and the runner browser path')
  const output = resolve(process.env.EDITOR_RESULTS_DIR, 'native-media-prefix')
  await mkdir(output, { recursive: true })
  const report = { kind: 'Bounded physical-prefix native media probe', startedAt: new Date().toISOString(), productionBase: BASE,
    plannedOrder: ['original-prefix', 'instrumented-prefix'], prefixOrder: ORDER, expectedMediaCases: MEDIA_CASES,
    retries: 0, originalPlaybackPauseMs: 100, postVerdictObservationMs: 300, observedFailureBrowser: BROWSER,
    pass: false, releaseAccepted: false,
    qualification: 'These two independent browser profiles reproduce the maintained physical prefix through HTML. Ordinary run.mjs pages use a different browser process. Instrumentation can perturb timing; diagnostic geometry reads occur only after the original 100ms verdict and at +300ms, never before Space. Successful diagnostic collection does not establish release readiness, and later playback never replaces the original 100ms verdict.' }
  await writeJson(join(output, 'plan.json'), report)
  const environment = { ...process.env }
  for (const key of ['EDITOR_NATIVE_PAGE', 'EDITOR_NATIVE_FILTER', 'EDITOR_BROWSER_PAGE', 'EDITOR_BROWSER_ROOT', 'EDITOR_VITE_PATH', 'EDITOR_CHROME_HEADLESS']) delete environment[key]
  let temporary
  const checkouts = []
  try {
    const before = await sourceIdentity(root)
    assert.equal(before.diffSha256, sha256(''), 'Require a committed candidate')
    assert.equal(git(root, 'ls-files', '--others', '--exclude-standard').toString().trim(), '')
    const allowed = ['.github/workflows/rector-v2-audit.yml', 'scripts/audit/native-media-prefix-probe.mjs', 'scripts/audit/native-media-prefix-probe.test.mjs']
    const changed = git(root, 'diff', '--name-only', BASE, before.head).toString().trim().split('\n')
    assert.deepEqual(changed.sort(), allowed.sort(), 'Probe branch must change only its three automation files')
    report.sourceBefore = before
    report.expectedPrefixCases = await loadPrefixCases(root)
    const executable = await realpath(process.env.EDITOR_CHROME_PATH)
    const version = await recordCommand(output, 'browser-version', [process.env.EDITOR_CHROME_PATH, '--version'], { cwd: root, timeoutMs: 30_000 })
    assert(!version.receivedSignal && !version.signal && !version.timedOut && !version.spawnError)
    assert.equal(version.exitCode, 0)
    report.runtime = { executable: process.env.EDITOR_CHROME_PATH, resolvedExecutable: executable, version: version.stdout.trim(),
      matchesObserved: version.stdout.includes(BROWSER), executableSha256: await hashFile(executable), node: process.version }
    try { report.runtime.installedChromeBinarySha256 = await hashFile(join(dirname(executable), 'chrome')) } catch { /* Non-wrapper executables are already hashed. */ }
    await writeJson(join(output, 'runtime.json'), report.runtime)
    temporary = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-media-prefix-'))
    const originalRunner = await readFile(join(root, RUNNER), 'utf8')
    const runner = buildPrefixRunner(originalRunner)
    const originalFixture = await readFile(join(root, FIXTURE), 'utf8')
    const fixture = instrumentPrefixMediaFixture(originalFixture)
    const attempt = async (label, instrumented) => {
      const directory = join(output, label), checkout = join(temporary, label)
      await mkdir(directory)
      git(root, 'worktree', 'add', '--detach', checkout, before.head)
      checkouts.push(checkout)
      await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir')
      await writeFile(join(checkout, RUNNER), runner)
      if (instrumented) await writeFile(join(checkout, FIXTURE), fixture)
      const expected = { [RUNNER]: sha256(runner), ...(instrumented ? { [FIXTURE]: sha256(fixture) } : {}) }
      assert.deepEqual(git(checkout, 'diff', '--name-only', 'HEAD').toString().trim().split('\n').sort(), Object.keys(expected).sort())
      const overlay = await sourceIdentity(checkout)
      for (const [path, hash] of Object.entries(before.files)) assert.equal(overlay.files[path], expected[path] ?? hash)
      await writeFile(join(directory, 'overlay.diff'), git(checkout, 'diff', '--binary', 'HEAD'), { flag: 'wx' })
      await writeFile(join(directory, 'physical-history.mjs'), runner, { flag: 'wx' })
      if (instrumented) await writeFile(join(directory, 'html-content-native.js'), fixture, { flag: 'wx' })
      await writeJson(join(directory, 'overlay.json'), { source: overlay, onlyChangedPaths: Object.keys(expected), hashes: expected })
      const run = await recordCommand(directory, 'run', [process.execPath, RUNNER],
        { cwd: checkout, env: { ...environment, EDITOR_RESULTS_DIR: directory } })
      let outcome
      try {
        outcome = classifyMediaPrefix(run, report.expectedPrefixCases, instrumented)
        outcome.browser = JSON.parse(await readFile(join(directory, 'physical-browser-environment.json'), 'utf8'))
        assert.equal(outcome.browser.executable, process.env.EDITOR_CHROME_PATH)
        assert.equal(outcome.browser.browser, `Chrome/${BROWSER}`, 'Different browser environment from the observed failure')
      } catch (error) { outcome = { complete: false, passed: false, error: String(error.stack ?? error) } }
      await writeJson(join(directory, 'classification.json'), outcome)
      assert.deepEqual(await sourceIdentity(checkout), overlay)
      assert.deepEqual(await sourceIdentity(root), before)
      if (run.receivedSignal) throw new Error('Interrupted media prefix diagnostic: ' + run.receivedSignal)
      return outcome
    }
    report.original = await attempt('original-prefix', false)
    report.diagnostic = await attempt('instrumented-prefix', true)
    report.sourceAfter = await sourceIdentity(root)
    assert.deepEqual(report.sourceAfter, before)
    report.sourceUnchanged = true
    Object.assign(report, mediaOutcome(report.original, report.diagnostic, report.runtime.matchesObserved))
    assert.equal(await hashFile(executable), report.runtime.executableSha256)
    if (report.runtime.installedChromeBinarySha256) assert.equal(await hashFile(join(dirname(executable), 'chrome')), report.runtime.installedChromeBinarySha256)
  } catch (error) { report.pass = false; report.error = String(error.stack ?? error) }
  finally {
    for (const checkout of checkouts) {
      try { git(root, 'worktree', 'remove', '--force', checkout) }
      catch (error) { report.pass = false; (report.cleanupErrors ??= []).push(String(error.stack ?? error)) }
    }
    if (temporary && !report.cleanupErrors) await rm(temporary, { recursive: true, force: true })
    report.finishedAt = new Date().toISOString()
    await writeJson(join(output, 'result.json'), report)
  }
  console.log(JSON.stringify({ pass: report.pass, collectionComplete: report.collectionComplete ?? false,
    originalPassed: report.original?.passed ?? false, instrumentedPassed: report.diagnostic?.passed ?? false, releaseAccepted: false, output }))
  if (!report.pass) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
