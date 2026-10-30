// Public toolbar action differential. Production bytes are served from exact
// Git objects; one fixed fixture and trusted input bridge serve every source.
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
const startedAt = new Date().toISOString()
const runnerBytes = await readFile(fileURLToPath(import.meta.url))
const fixturePath = 'tests/browser/tool-actions-parity-fixture.js'
const fixture = git('show', `${headBefore}:${fixturePath}`)
assert.deepEqual(fixture, await readFile(join(repo, fixturePath)), 'Fixture differs from committed source')
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true, loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false, loaded: {} },
  { label: 'candidate', sha: headBefore, legacy: false, loaded: {} },
].map(source => ({ ...source, tree: git('rev-parse', `${source.sha}^{tree}`).toString().trim() }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
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

const cache = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Tool action comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script><body></body>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    if (!cache.has(pathname)) {
      const source = sources.find(value => pathname.startsWith(`/${value.label}/`))
      assert(source || pathname.startsWith('/dependencies/'), `Unexpected source URL: ${pathname}`)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(relative && !relative.split('/').includes('..'), 'Invalid source path')
      const bytes = source ? git('show', `${source.sha}:${relative}`) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      cache.set(pathname, bytes)
    }
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
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
    const pageErrors = [], inputErrors = []
    page.on('pageerror', error => pageErrors.push(error.stack ?? String(error)))
    const cdp = await page.context().newCDPSession(page)
    await page.exposeFunction('__toolActionInput', async (method, params) => {
      try {
        if (method === 'Input.click') {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...params })
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...params })
        } else if (method === 'Input.insertText' || method === 'Input.dispatchKeyEvent') await cdp.send(method, params)
        else throw new Error('Unsupported native input: ' + method)
      } catch (error) { inputErrors.push(String(error)); throw error }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const cases = await page.evaluate(async source => {
      const { toolActionCases, runToolActionCase } = await import('/fixture.js')
      const results = []
      for (const spec of toolActionCases) results.push(await runToolActionCase({ sourceBase: `/${source.label}/`,
        legacy: source.legacy, spec, nativeInput: window.__toolActionInput }))
      return results
    }, { label: source.label, legacy: source.legacy })
    results.push({ source: source.label, cases, pageErrors, inputErrors })
    await page.close()
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore, 'HEAD changed during comparison')
  assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Tracked source changed during comparison')
  assert.deepEqual(await readFile(fileURLToPath(import.meta.url)), runnerBytes, 'Runner changed during comparison')
  const passed = row => !row.pageErrors.length && !row.inputErrors.length && row.cases.length > 0 && row.cases.every(value =>
    !value.error && !value.diagnostics.length && value.completedPhases.length === value.planned.length
      && value.observations.every(observation => observation.status === 'PASS'))
  const candidatePass = !serverErrors.length && results.filter(row => row.source === 'candidate').every(passed)
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`, headBefore, headAfter,
    runnerSha256: digest(runnerBytes), fixtureSha256: digest(fixture),
    packageLockSha256: digest(await readFile(join(repo, 'package-lock.json'))),
    sourceIdentity: 'Every production module is served unchanged from its exact Git object. Fixed fixtures adapt public API/wire spelling only.',
    scope: 'Actual native toolbar actions and history for CaseTransform/ClearFormatting. Selections are explicitly installed valid DOM ranges, not physical drag claims.',
    sources, dependencyVersions, dependencyFiles, results, serverErrors, candidatePass,
    note: 'Historical defects remain raw FAIL observations. Unsupported legacy observation APIs are explicitly recorded and never inferred as passes.',
  }, null, 2))
  if (serverErrors.length || results.some(row => !passed(row))) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
