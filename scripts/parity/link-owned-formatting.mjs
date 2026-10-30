// Direct public-tool DOM ownership differential. Candidate native editor,
// selection and keyboard-history controls live in native-tools.html.
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
      response.end('<!doctype html><meta charset="utf-8"><title>Link ownership differential</title>'
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
      const { createLinkTool } = await import('/' + source.label + '/inline-tools/link.js')
      const cases = []
      const check = (entry, property, actual, expected) => entry.observations.push({ property, actual, expected,
        status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
      const specs = [
        { id: 'controls-only', active: false,
          html: 'alpha<span contenteditable="false"><a href="/locked">Locked</a></span>'
            + '<button><a href="/action">Action</a></button><span role="button"><a href="/role">Role</a></span>'
            + '<span data-inline-plugin="mention" contenteditable="false"><a href="/widget">Widget</a></span>beta' },
        { id: 'authored-and-controls', active: true,
          html: '<a href="/author">alpha</a><span contenteditable="false"><a href="/locked">Locked</a></span>'
            + '<button><a href="/action">Action</a></button>beta' },
        { id: 'shared-wrapper', active: true,
          html: '<a href="/shared" target="articlePreview">alpha<span contenteditable="false"><i>Locked</i></span><button><i>Action</i></button>beta</a>' },
        { id: 'partial-whole-link', active: true,
          html: 'before <a href="/author"><b>alpha</b> beta</a> after' },
        { id: 'shared-line-breaks', active: true,
          html: '<a href="/shared">alpha<br><span contenteditable="false">Locked</span><br>beta</a>' },
        { id: 'line-break-only', active: true,
          html: 'alpha<a href="/break"><br></a>beta' },
      ]
      for (const spec of specs) {
        const entry = { id: spec.id, observations: [], errors: [], complete: false }
        cases.push(entry)
        const root = document.createElement('div'); root.className = 'oe-block'
        const field = document.createElement('div'); field.contentEditable = 'true'; field.innerHTML = spec.html
        root.append(field); document.body.append(root)
        const range = document.createRange(); range.selectNodeContents(field)
        const tool = createLinkTool('URL', 'Link')
        // Public mount-port adaptation only; these direct cases make no claim
        // about bookmark implementation, native caret or history acceptance.
        tool.bindSelectionPort?.({ get range() { return range }, capture: () => ({}), restore: () => true })
        try {
          if (spec.id === 'partial-whole-link') {
            const text = field.querySelector('b').firstChild; range.setStart(text, 1); range.setEnd(text, 3)
          } else if (spec.id === 'line-break-only') range.selectNode(field.querySelector('br'))
          const controls = [...field.querySelectorAll('[contenteditable="false"], button, [role="button"]')]
          const controlNodes = controls.map(element => element.firstChild)
          const controlMarkup = controls.map(element => element.innerHTML)
          const controlAnchors = controls.map(element => element.querySelector('a'))
          const controlTargets = controls.map(element => element.closest('a')?.getAttribute('href') ?? null)
          const breaks = [...field.querySelectorAll('br')], beforeText = field.textContent
          check(entry, 'active', tool.isActive({ range }), spec.active)
          tool.toggle({ range })
          check(entry, 'text', field.textContent, beforeText)
          check(entry, 'controlNodes', controls.map((element, index) => element.isConnected && element.firstChild === controlNodes[index]), controls.map(() => true))
          check(entry, 'controlMarkup', controls.map(element => element.innerHTML), controlMarkup)
          check(entry, 'controlAnchors', controlAnchors.filter(Boolean).map(element => element.isConnected), controlAnchors.filter(Boolean).map(() => true))
          check(entry, 'inheritedTargets', controls.map(element => element.closest('a')?.getAttribute('href') ?? null), controlTargets)
          check(entry, 'lineBreaks', breaks.map(element => element.isConnected && !element.closest('a')), breaks.map(() => true))
          if (spec.id === 'controls-only') check(entry, 'html', field.innerHTML, spec.html)
          if (spec.id === 'authored-and-controls' || spec.id === 'shared-wrapper' || spec.id === 'shared-line-breaks') {
            check(entry, 'authoredEdgesUnlinked', [field.firstChild.nodeType, field.lastChild.nodeType], [3, 3])
          }
          if (spec.id === 'partial-whole-link') check(entry, 'html', field.innerHTML, 'before <b>alpha</b> beta after')
          if (spec.id === 'line-break-only') check(entry, 'html', field.innerHTML, 'alpha<br>beta')
          entry.complete = true
        } catch (error) { entry.errors.push(error.stack ?? String(error)) }
        finally { tool.bindSelectionPort?.(null); root.remove() }
      }
      return cases
    }, source)
    results.push({ source: source.label, cases, pageErrors })
    await page.close()
  }
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore, 'HEAD changed during comparison')
  assert.deepEqual(await readFile(fileURLToPath(import.meta.url)), runnerBytes, 'Runner changed during comparison')
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), browser: await browser.version(), node: process.version,
    scope: 'Six direct public-tool real-DOM ownership cases; no native historical editor/caret/history claim. Candidate native editor coverage is a separate gate.',
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
