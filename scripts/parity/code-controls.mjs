// Four-source Code controls at the public editor and browser boundaries.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const treeBefore = git('rev-parse', 'HEAD^{tree}').toString().trim()
const startedAt = new Date().toISOString()
const fixturePath = 'tests/browser/code-controls-parity-fixture.js'
const fixture = git('show', `${headBefore}:${fixturePath}`)
assert.deepEqual(fixture, await readFile(join(repo, fixturePath)), 'Fixture differs from committed source')
assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Commit source changes before comparing')
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const { build } = await import(pathToFileURL(join(dependencyRoot, 'esbuild/lib/main.js')).href)
const bundled = await build({ entryPoints: [join(dependencyRoot, 'highlight.js/lib/index.js')], bundle: true,
  write: false, format: 'esm', platform: 'browser', metafile: true, absWorkingDir: dependencyRoot, logLevel: 'silent' })
const highlighter = bundled.outputFiles[0].contents
const highlighterInputs = {}
for (const path of Object.keys(bundled.metafile.inputs)) highlighterInputs[path] = digest(await readFile(resolve(dependencyRoot, path)))
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true, loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false, loaded: {} },
  { label: 'pre-fix', sha: '69c8425e0081fde69cf5176ccb73d032720c15fc', legacy: false, loaded: {} },
  { label: 'candidate', sha: headBefore, legacy: false, loaded: {} },
]
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = {}
for (const name of ['dompurify', 'highlight.js', 'esbuild']) {
  dependencyVersions[name] = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8')).version
}
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pending = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = `/dependencies/${name}/${imported.replace(/^\.\//, '')}`
  dependencyVersions[name] = dependency.version
  pending.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
const cases = ['language-keyboard', 'language-cancel-no-match', 'injected-runtime', 'provider-throws', 'provider-retired',
  'lazy-default', 'lazy-delayed', 'lazy-failed', 'lazy-retired', 'copy-native', 'copy-read-only',
  'copy-rejected', 'copy-unavailable', 'copy-empty', 'copy-pending-retired']
const selectedCases = process.env.EDITOR_CODE_CASE ? cases.filter(name => name.includes(process.env.EDITOR_CODE_CASE)) : cases
assert(selectedCases.length, 'No case matches EDITOR_CODE_CASE')
const selectedSources = process.env.EDITOR_CODE_SOURCE ? sources.filter(source => source.label === process.env.EDITOR_CODE_SOURCE) : sources
assert(selectedSources.length, 'No source matches EDITOR_CODE_SOURCE')
const loaded = new Map(), dependencyFiles = {}, serverErrors = [], loadOutcomes = [], gates = new Map()
let currentGate
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'), pathname = url.pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Code controls parity</title>'
        + '<style>body{padding:24px}#code-fixture{max-width:760px}#clipboard-target{display:block;width:700px;height:100px;margin:30px}</style>'
        + '<script type="importmap">' + JSON.stringify({ imports: { ...imports, 'highlight.js': `/highlight/${url.searchParams.get('case')}.js` } })
        + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    // V1 ships its dependency bundle as a relative module. Delay/fail that
    // request without replacing or rewriting any of its immutable bytes.
    if (pathname.endsWith('/shared/runtime/highlightBundle.js')) {
      assert(currentGate, 'Missing v1 lazy-load boundary')
      currentGate.requested = true
      if (currentGate.name !== 'lazy-default') await currentGate.promise
      loadOutcomes.push({ case: currentGate.id, mode: currentGate.name, status: currentGate.name === 'lazy-failed' ? 503 : 200 })
      if (currentGate.name === 'lazy-failed') { response.statusCode = 503; response.end('Deliberate unavailable highlighter boundary'); return }
    }
    if (pathname.startsWith('/highlight/')) {
      const gate = gates.get(pathname)
      assert(gate, `Unexpected highlighter request ${pathname}`)
      gate.requested = true
      if (gate.name !== 'lazy-default') await gate.promise
      loadOutcomes.push({ case: gate.id, mode: gate.name, status: gate.name === 'lazy-failed' ? 503 : 200 })
      if (gate.name === 'lazy-failed') { response.statusCode = 503; response.end('Deliberate unavailable highlighter boundary'); return }
      response.end(highlighter)
      return
    }
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith(`/${value.label}/`))
      assert(source || pathname.startsWith('/dependencies/'), `Unexpected fixture URL: ${pathname}`)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(!relative.split('/').includes('..'), 'Invalid source path')
      const bytes = source ? git('show', `${source.sha}:${relative}`) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, bytes)
    }
    response.end(loaded.get(pathname))
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
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of selectedSources) for (const name of selectedCases) {
    const id = `${source.label}-${name}`
    let release
    const gate = { id, name, requested: false, promise: new Promise(resolve => { release = resolve }), release: () => release() }
    currentGate = gate
    gates.set(`/highlight/${id}.js`, gate)
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1100, height: 900 } })
    const page = await context.newPage()
    const errors = [], warnings = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) warnings.push({ type: message.type(), text: message.text() }) })
    await page.exposeFunction('__codeControlAction', async action => {
      if (action.kind === 'insert') await page.keyboard.insertText(action.text)
      else if (action.kind === 'key') await page.keyboard.press(action.key)
      else if (action.kind === 'click') await page.locator(action.selector).click({ timeout: 5000 })
      else if (action.kind === 'read-clipboard') return page.evaluate(() => navigator.clipboard.readText())
      else if (action.kind === 'release-lazy') {
        assert(gate.requested, 'Lazy import did not reach the controlled network boundary')
        gate.release()
        await page.waitForTimeout(80)
      } else if (action.kind === 'wait-highlight') await page.locator('.oe-code-pre code span').first().waitFor({ state: 'attached', timeout: 10000 })
      else if (action.kind === 'wait-copy-reset') await page.waitForFunction(() => !document.querySelector('.oe-code-btn--copy')?.classList.contains('oe-code-btn--copied'), null, { timeout: 5000 })
      else throw new Error(`Unknown action ${action.kind}`)
    })
    await page.goto(`${origin}/?case=${id}`)
    const result = await page.evaluate(async ({ source, name }) => {
      const { runCodeControlsCase } = await import('/fixture.js')
      return runCodeControlsCase({ sourceBase: `/${source.label}/`, legacy: source.legacy, name })
    }, { source: { label: source.label, legacy: source.legacy }, name })
    gate.release()
    results.push({ source: source.label, ...result, errors, warnings,
      failures: result.observations.filter(value => value.status !== 'PASS'),
      incomplete: !result.completedPhases.includes('dispose'), highlighterRequested: gate.requested })
    process.stderr.write(`${id}: ${result.error ? 'ERROR' : results.at(-1).failures.length ? 'FAIL' : 'PASS'}\n`)
    await context.close()
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore, 'Source HEAD changed during comparison')
  assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Tracked source changed during comparison')
  const candidate = results.filter(result => result.source === 'candidate')
  const candidatePass = candidate.length === selectedCases.length && candidate.every(result => !result.error && !result.errors.length && !result.failures.length && !result.incomplete)
  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`, headBefore, treeBefore, headAfter,
    runnerSha256: digest(await readFile(fileURLToPath(import.meta.url))), fixtureSha256: digest(fixture),
    highlighterBundleSha256: digest(highlighter), highlighterInputs, sources, dependencyVersions, dependencyFiles,
    serverErrors, loadOutcomes, selectedCases, results, candidatePass,
    note: 'All observations retain raw verdicts; historical defects are not candidate exceptions. Clipboard rejection and unavailability are controlled host boundaries; successful copy uses the real browser clipboard.' }, null, 2))
  if (serverErrors.length || results.some(result => result.error || result.errors.length || result.failures.length || result.incomplete)) process.exitCode = 1
} finally {
  for (const gate of gates.values()) gate.release()
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
