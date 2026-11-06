import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const safe = read => { try { return read() } catch (error) { return { unavailable: String(error) } } }

export async function createDiagnostics({ root, expectedHead, originalRunnerSha256, runnerPath }) {
  let output, originalScope = 'full'
  const args = process.argv.slice(2)
  while (args.length) {
    const option = args.shift(), value = args.shift()
    assert(value, 'Missing diagnostic option value: ' + option)
    if (option === '--out') output = resolve(value)
    else if (option === '--original-scope') originalScope = value
    else throw new Error('Unknown diagnostic option: ' + option)
  }
  assert(output, 'Provide a new --out directory')
  assert(['full', 'focused'].includes(originalScope), 'Scope must be full or focused')
  assert(output !== root && !output.startsWith(root + sep), 'Diagnostic artifacts must stay outside the source checkout')
  await mkdir(output) // Refuse to overwrite an earlier attempt.
  const git = (...args) => execFileSync('git', args, { cwd: root }).toString()
  const sourceIdentity = () => ({ head: git('rev-parse', 'HEAD').trim(), tree: git('rev-parse', 'HEAD^{tree}').trim(),
    trackedStatus: git('status', '--porcelain', '--untracked-files=no'), diffSha256: hash(git('diff', '--binary', 'HEAD')) })
  const before = sourceIdentity()
  assert.equal(before.head, expectedHead)
  assert.equal(before.trackedStatus, '')
  assert.equal(hash(await readFile(join(root, 'scripts/parity/html-content-navigation.mjs'))), originalRunnerSha256)
  const helperPath = fileURLToPath(import.meta.url)
  const instrumentationBefore = { runner: hash(await readFile(runnerPath)), helper: hash(await readFile(helperPath)) }
  const createdAt = new Date().toISOString(), traces = [], targets = [], targetContexts = new Map(), loggerErrors = []
  let discovery, origin = '', playwrightRuntime
  const clock = () => ({ nodeTime: Date.now(), nodeMonotonicMs: performance.now() })
  const noteError = error => loggerErrors.push({ ...clock(), error: String(error) })
  const diagnostic = {
    output, originalScope, cacheDir: join(output, 'vite-cache'),
    setOrigin(value) { origin = value },
    async capturePlaywright(moduleUrl) {
      const modulePath = fileURLToPath(moduleUrl)
      let directory = dirname(modulePath)
      while (true) {
        const packageJsonPath = join(directory, 'package.json')
        let bytes
        try { bytes = await readFile(packageJsonPath) }
        catch (error) { if (error.code !== 'ENOENT') throw error }
        if (bytes) {
          const metadata = JSON.parse(bytes)
          assert(['playwright', 'playwright-core'].includes(metadata.name), 'Imported module is not in a declared Playwright package')
          playwrightRuntime = { moduleUrl, modulePath, moduleSha256: hash(await readFile(modulePath)), packageJsonPath,
            packageJsonSha256: hash(bytes), packageName: metadata.name, version: metadata.version }
          return
        }
        assert(dirname(directory) !== directory, 'Cannot identify the imported Playwright package')
        directory = dirname(directory)
      }
    },
    async attachBrowser(browser) {
      discovery = await browser.newBrowserCDPSession()
      for (const method of ['Target.targetCreated', 'Target.targetInfoChanged', 'Target.targetDestroyed', 'Target.targetCrashed']) {
        discovery.on(method, params => {
          const info = params.targetInfo, id = info?.targetId ?? params.targetId
          if (info?.browserContextId) targetContexts.set(id, info.browserContextId)
          targets.push({ ...clock(), method, browserContextId: info?.browserContextId ?? targetContexts.get(id) ?? null, params })
        })
      }
      await discovery.send('Target.setDiscoverTargets', { discover: true })
    },
    beginCase(context, id, specification, kind, phase) {
      const trace = { id, phase, kind, specification, startedAt: new Date().toISOString(), events: [], browserContextId: null }
      traces.push(trace)
      const pages = new Map()
      const record = (event, data = {}) => trace.events.push({ ...clock(), event, ...data })
      const pageInfo = page => ({ pageId: pages.get(page) ?? null, url: safe(() => page.url()), closed: page.isClosed() })
      const attach = (page, reason) => {
        if (pages.has(page)) return
        pages.set(page, pages.size + 1)
        record('page-observed', { reason, ...pageInfo(page) })
        for (const event of ['domcontentloaded', 'load', 'close', 'crash']) page.on(event, () => record('page-' + event, pageInfo(page)))
        for (const event of ['frameattached', 'framedetached', 'framenavigated']) page.on(event, frame => record(event, {
          ...pageInfo(page), frameUrl: safe(() => frame.url()), parentUrl: safe(() => frame.parentFrame()?.url() ?? null), detached: frame.isDetached(),
        }))
        page.on('popup', popup => { record('page-popup', pageInfo(page)); attach(popup, 'popup-event') })
        page.on('pageerror', error => record('pageerror', { ...pageInfo(page), error: error.stack ?? String(error) }))
        page.on('console', message => {
          if (['error', 'warning'].includes(message.type())) record('console', { ...pageInfo(page), type: message.type(), text: message.text() })
          if (message.text().startsWith('Navigation diagnostic binding rejected:')) noteError(message.text())
        })
      }
      context.on('page', page => attach(page, 'context-page-event'))
      context.on('close', () => record('context-close'))
      for (const event of ['request', 'requestfinished', 'requestfailed']) context.on(event, request => {
        const url = request.url()
        if (!url.startsWith(origin + '/boundary-')) return
        record(event, { url, method: request.method(), navigation: request.isNavigationRequest(), resourceType: request.resourceType(), failure: request.failure() })
      })
      return {
        note: record,
        snapshot(label) { record('context-pages', { label, pages: context.pages().map(pageInfo) }) },
        async attachRoot(page) {
          attach(page, 'root-page')
          await page.exposeFunction('__rectorNavigationDiagnostic', value => record('dom-observation', value))
          const cdp = await context.newCDPSession(page)
          const { targetInfo } = await cdp.send('Target.getTargetInfo')
          trace.browserContextId = targetInfo.browserContextId ?? null
          trace.rootTarget = targetInfo
          cdp.on('Page.windowOpen', value => record('cdp-Page.windowOpen', value))
          cdp.on('Page.frameNavigated', value => record('cdp-Page.frameNavigated', value))
          await cdp.send('Page.enable')
        },
        async inspectAnchor(subject) {
          const initial = await subject.evaluate(anchor => {
            const view = anchor.ownerDocument.defaultView
            let bindingView = view
            for (let depth = 0; depth < 8 && typeof bindingView.__rectorNavigationDiagnostic !== 'function'; depth++) {
              if (bindingView.parent === bindingView) break
              bindingView = bindingView.parent
            }
            const bindingAvailable = typeof bindingView.__rectorNavigationDiagnostic === 'function'
            const describe = event => ({ pageTime: Date.now(), pageMonotonicMs: performance.now(),
              bindingAvailable,
              documentUrl: anchor.ownerDocument.URL, baseURI: anchor.baseURI, ownerBaseURI: anchor.ownerDocument.baseURI,
              documentReadyState: anchor.ownerDocument.readyState, connected: anchor.isConnected,
              hrefAttribute: anchor.getAttribute('href'), href: anchor.href, target: anchor.target, rel: anchor.rel,
              download: anchor.getAttribute('download'), referrerPolicy: anchor.getAttribute('referrerpolicy'),
              outerHTML: anchor.outerHTML, parentOuterHTML: anchor.parentElement?.outerHTML ?? null,
              contentEditable: anchor.contentEditable, isContentEditable: anchor.isContentEditable,
              userActivation: { isActive: view.navigator.userActivation.isActive, hasBeenActive: view.navigator.userActivation.hasBeenActive },
              event: event ? { type: event.type, trusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
                button: event.button, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey } : null })
            const emit = (stage, event) => {
              const value = { stage, ...describe(event) }
              if (bindingAvailable) void bindingView.__rectorNavigationDiagnostic(value)
                .catch(error => view.console.warn('Navigation diagnostic binding rejected: ' + String(error)))
            }
            for (const name of ['click', 'auxclick']) {
              view.addEventListener(name, event => { if (event.composedPath().includes(anchor)) emit('window-capture', event) }, { capture: true, passive: true })
              view.addEventListener(name, event => {
                if (!event.composedPath().includes(anchor)) return
                emit('window-bubble', event)
                queueMicrotask(() => emit('post-propagation-microtask', event))
              }, { passive: true })
            }
            return describe(null)
          })
          assert(initial.bindingAvailable, 'Diagnostic binding is unavailable in the anchor owner hierarchy')
          record('anchor-before-click', initial)
        },
        async readiness(label, frames) {
          const state = {}
          for (const [name, frame] of Object.entries(frames)) state[name] = {
            url: frame.url(), detached: frame.isDetached(),
            document: await frame.evaluate(() => ({ url: document.URL, baseURI: document.baseURI, readyState: document.readyState, origin: location.origin })).catch(error => ({ error: String(error) })),
          }
          record('readiness', { label, frames: state })
        },
        fail(error) { trace.error = error.stack ?? String(error); record('case-error', { error: trace.error }) },
        finish() { trace.finishedAt = new Date().toISOString(); record('case-finished') },
      }
    },
    async finish(report) {
      const after = sourceIdentity()
      const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after)
      const instrumentationAfter = { runner: hash(await readFile(runnerPath)), helper: hash(await readFile(helperPath)) }
      const instrumentationUnchanged = JSON.stringify(instrumentationBefore) === JSON.stringify(instrumentationAfter)
      assert(playwrightRuntime, 'The imported Playwright module was not identified')
      const playwrightRuntimeUnchanged = hash(await readFile(playwrightRuntime.modulePath)) === playwrightRuntime.moduleSha256
        && hash(await readFile(playwrightRuntime.packageJsonPath)) === playwrightRuntime.packageJsonSha256
      const artifacts = {}
      for (const trace of traces) {
        trace.targetTimeline = targets.filter(event => event.browserContextId === trace.browserContextId)
        const name = trace.id + '.timeline.json', bytes = JSON.stringify(trace, null, 2) + '\n'
        await writeFile(join(output, name), bytes)
        artifacts[name] = hash(bytes)
      }
      const targetBytes = JSON.stringify(targets, null, 2) + '\n'
      await writeFile(join(output, 'browser-target-timeline.json'), targetBytes)
      artifacts['browser-target-timeline.json'] = hash(targetBytes)
      const result = { ...report, diagnosticStartedAt: createdAt, diagnosticFinishedAt: new Date().toISOString(),
        sourceBefore: before, sourceAfter: after, sourceUnchanged, output, originalScope,
        success: report.success === true && sourceUnchanged && instrumentationUnchanged && playwrightRuntimeUnchanged && loggerErrors.length === 0,
        instrumentationBefore, instrumentationAfter, instrumentationUnchanged,
        diagnosticRunnerSha256: instrumentationBefore.runner, diagnosticHelperSha256: instrumentationBefore.helper,
        originalRunnerSha256, playwrightRuntime, playwrightRuntimeUnchanged,
        instrumentation: ['passive event observers and diagnostic bindings', 'context/page lifecycle and boundary network events', 'Target.setDiscoverTargets', 'Page.enable / Page.windowOpen'],
        noPermissionGrants: true, navigationOutcomeDeadlineMs: 5000, retries: 0, artifacts, loggerErrors,
        qualification: 'Diagnostic execution only; preserve the original failed corpus. A focused or instrumented PASS does not replace the full maintained result or establish a fix.',
      }
      await writeFile(join(output, 'diagnostic-results.json'), JSON.stringify(result, null, 2) + '\n')
      assert(sourceUnchanged, 'Source changed during diagnostic execution')
      assert(instrumentationUnchanged, 'Diagnostic instrumentation changed during execution')
      assert(playwrightRuntimeUnchanged, 'Imported Playwright module metadata changed during execution')
      assert.deepEqual(loggerErrors, [])
      return result
    },
    noteLoggerError: noteError,
  }
  return diagnostic
}
