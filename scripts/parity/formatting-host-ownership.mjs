// Direct public-tool authored-host differential. Candidate native selection,
// widget and keyboard-history controls live in native-tools.html.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(process.env.EDITOR_CANDIDATE_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)))
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const runnerBytes = await readFile(fileURLToPath(import.meta.url))
const startedAt = new Date().toISOString()
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340' },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8' },
  { label: 'candidate', sha: process.env.EDITOR_CANDIDATE_SHA ?? headBefore },
].map(source => ({ ...source, loaded: {} }))
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const dependencyFiles = {}, serverErrors = [], cache = new Map()
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Formatting host ownership differential</title>'
        + '<script type="importmap">{"imports":{"dompurify":"/dependencies/dompurify/dist/purify.es.mjs"}}</script><body></body>')
      return
    }
    if (!cache.has(pathname)) {
      const source = sources.find(item => pathname.startsWith('/' + item.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected source URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(relative && !relative.split('/').includes('..'), 'Invalid source path')
      const bytes = source ? git('show', source.sha + ':' + relative)
        : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      cache.set(pathname, bytes)
    }
    response.setHeader('content-type', 'text/javascript')
    response.end(cache.get(pathname))
  } catch (error) {
    serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await chromium.launch({ ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const source of sources) {
    const page = await browser.newPage(), pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto('http://127.0.0.1:' + server.address().port)
    const cases = await page.evaluate(async source => {
      const { createClearFormattingTool } = await import('/' + source.label + '/inline-tools/clearFormatting.js')
      const { createCaseTransformTool } = await import('/' + source.label + '/inline-tools/caseTransform.js')
      const check = (entry, property, actual, expected) => entry.observations.push({ property, actual, expected,
        status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
      const nested = '<span contenteditable="true"><b>Nested</b> label</span>'
      const controls = '<span contenteditable="false"><b>Locked</b></span>'
        + '<button type="button"><i>Action</i></button><span role="button"><u>Role</u></span>'
        + '<span data-inline-plugin="test" contenteditable="false"><strong>Widget</strong></span>'
      const specs = [
        { id: 'nested-single', html: '<b>Alpha</b>' + nested + '<i>Beta</i>',
          upper: '<b>ALPHA</b>' + nested + '<i>BETA</i>', clear: 'Alpha' + nested + 'Beta' },
        { id: 'nested-cross', cross: true, html: '<b>Alpha</b>' + nested + '<i>Beta</i>',
          upper: '<b>ALPHA</b>' + nested + '<i>BETA</i>', clear: 'Alpha' + nested + 'Beta' },
        { id: 'controls-cross', cross: true, html: '<b>Alpha</b>' + controls + '<br><i>Beta</i>',
          upper: '<b>ALPHA</b>' + controls + '<br><i>BETA</i>', clear: 'Alpha' + controls + '<br>Beta' },
        { id: 'plain-controls-cross', cross: true, html: 'ALPHA' + controls + 'BETA',
          upper: 'alpha' + controls + 'beta', clear: 'ALPHA' + controls + 'BETA', last: 'BRAVO' },
        { id: 'explicit-nested', explicit: true, html: '<b>Outer</b><span contenteditable="true"><b>Nested</b></span><i>Suffix</i>',
          upper: '<b>Outer</b><span contenteditable="true"><b>NESTED</b></span><i>Suffix</i>',
          clear: '<b>Outer</b><span contenteditable="true">Nested</span><i>Suffix</i>' },
      ]
      const cases = []
      for (const [toolName, createTool] of [['caseTransform', createCaseTransformTool], ['clearFormatting', createClearFormattingTool]]) {
        for (const spec of specs) {
          const entry = { id: toolName + '/' + spec.id, observations: [], errors: [], complete: false }
          cases.push(entry)
          const root = document.createElement('div'); root.className = 'oe-editor'
          root.innerHTML = '<div class="oe-block" data-block-id="a" contenteditable="false"><div contenteditable="true">' + spec.html + '</div></div>'
            + '<button type="button"><b>Toolbar</b></button>'
            + '<div class="oe-block" data-block-id="b" contenteditable="false"><div contenteditable="true"><b>' + (spec.last ?? 'Bravo') + '</b></div></div>'
          document.body.append(root)
          const first = root.firstChild.firstChild, last = root.lastChild.firstChild
          const target = spec.explicit ? first.querySelector('[contenteditable="true"]') : first
          const makeRange = () => {
            const range = document.createRange(); range.setStart(target, 0)
            const end = spec.cross ? last : target; range.setEnd(end, end.childNodes.length)
            return range
          }
          // The direct boundary receives the same fixed authored extent from
          // the public selection integration in each version. This adapter
          // deliberately does not test historical bookmark or caret behavior.
          const port = { get range() { return makeRange() }, capture: () => ({}), restore: () => true,
            activate() {}, deactivate() {} }
          const tool = createTool(toolName, source.label === 'v1' ? port : undefined)
          tool.bindSelectionPort?.(port)
          try {
            const protectedNodes = [...first.querySelectorAll('[contenteditable], button, [role="button"], [data-inline-plugin]')]
              .filter(node => !spec.explicit || node !== target)
            const protectedMarkup = protectedNodes.map(node => node.innerHTML)
            const protectedChildren = protectedNodes.map(node => [...node.childNodes])
            const breaks = [...first.querySelectorAll('br')], toolbar = root.querySelector(':scope > button')
            const toolbarMarkup = toolbar.innerHTML, toolbarText = toolbar.firstChild.firstChild
            const range = makeRange(), native = window.getSelection()
            native.removeAllRanges(); native.addRange(range)
            tool.toggle({ range })
            check(entry, 'firstHTML', first.innerHTML, toolName === 'caseTransform' ? spec.upper : spec.clear)
            const lastValue = spec.last ?? 'Bravo'
            const expectedLast = spec.cross ? toolName === 'caseTransform'
              ? '<b>' + (spec.last ? lastValue.toLowerCase() : lastValue.toUpperCase()) + '</b>' : lastValue
              : '<b>' + lastValue + '</b>'
            check(entry, 'lastHTML', last.innerHTML, expectedLast)
            check(entry, 'protectedMarkup', protectedNodes.map(node => node.innerHTML), protectedMarkup)
            check(entry, 'protectedIdentity', protectedNodes.map((node, index) => node.isConnected
              && protectedChildren[index].every((child, childIndex) => node.childNodes[childIndex] === child)), protectedNodes.map(() => true))
            check(entry, 'toolbarMarkup', toolbar.innerHTML, toolbarMarkup)
            check(entry, 'toolbarIdentity', toolbar.isConnected && toolbar.firstChild.firstChild === toolbarText, true)
            check(entry, 'breakIdentity', breaks.map(node => node.isConnected && first.contains(node)), breaks.map(() => true))
            entry.complete = true
          } catch (error) { entry.errors.push(error.stack ?? String(error)) }
          finally { window.getSelection().removeAllRanges(); tool.bindSelectionPort?.(null); root.remove() }
        }
      }
      return cases
    }, source)
    results.push({ source: source.label, cases, pageErrors })
    await page.close()
  }
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore, 'HEAD changed during comparison')
  assert.deepEqual(await readFile(fileURLToPath(import.meta.url)), runnerBytes, 'Runner changed during comparison')
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), browser: await browser.version(), node: process.version,
    scope: 'Ten direct public-tool real-DOM ownership cases for two tools; no native historical editor/caret/history claim. Candidate native editor coverage is a separate gate.',
    headBefore, runnerSha256: digest(runnerBytes), sourceIdentity: 'Every production module served from its exact Git object without transformation.',
    sources, dependencyFiles, serverErrors, results }, null, 2))
  // Preserve historical contract failures in the raw result. No source receives
  // an exemption or a PASS merely because it is a historical reference.
  if (serverErrors.length || results.some(result => result.pageErrors.length || result.cases.some(entry =>
    !entry.complete || entry.errors.length || entry.observations.some(value => value.status !== 'PASS')))) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
