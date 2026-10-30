// Bounded Person hidden-focus/read-only proof using immutable modules and native gestures.
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
const headBefore = git('rev-parse', 'HEAD').toString().trim(), startedAt = new Date().toISOString()
const candidate = git('rev-parse', process.env.EDITOR_CANDIDATE_SHA ?? headBefore).toString().trim()
const fixturePath = 'tests/browser/person-modes-parity-fixture.js'
const fixture = git('show', `${headBefore}:${fixturePath}`)
const runnerPath = fileURLToPath(import.meta.url), runnerBytes = await readFile(runnerPath)
assert.deepEqual(fixture, await readFile(join(repo, fixturePath)), 'Fixture differs from committed source')
assert.deepEqual(git('show', `${headBefore}:scripts/parity/person-modes.mjs`), runnerBytes, 'Runner differs from committed source')
assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Tracked source is not clean')
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true, loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false, loaded: {} },
  { label: 'candidate', sha: candidate, legacy: false, loaded: {} },
].map(source => ({ ...source, tree: git('rev-parse', `${source.sha}^{tree}`).toString().trim() }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pending = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/')), packages = new Set()
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.'], imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = `/dependencies/${name}/${imported.replace(/^\.\//, '')}`
  dependencyVersions[name] = dependency.version
  pending.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
const loaded = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Person hidden fields and modes comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
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
  } catch (error) { serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = [], filter = process.env.EDITOR_PERSON_MODES_FILTER ?? ''
try {
  browser = await chromium.launch({ ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.exposeFunction('__personModesInput', async (action, value) => {
      if (action === 'type') await page.keyboard.type(value)
      else if (action === 'click') await page.mouse.click(value.x, value.y)
      else if (action === 'key') await page.keyboard.press(value)
      else throw new Error(`Unknown Person input action: ${action}`)
    })
    await page.goto(origin + '/')
    const cases = await page.evaluate(async ({ source, filter }) => {
      const { personModeCases, runPersonModeCase } = await import('/fixture.js')
      const selected = personModeCases.filter(value => !filter || value.id.includes(filter))
      const results = []
      for (const specification of selected) results.push(await runPersonModeCase(specification, {
        sourceBase: `/${source.label}/`, legacy: source.legacy, native: window.__personModesInput,
      }))
      return results
    }, { source: { label: source.label, legacy: source.legacy }, filter })
    results.push({ source: source.label, cases, errors,
      failures: cases.flatMap(entry => entry.observations.filter(value => value.status !== 'PASS').map(value => ({ id: entry.id, ...value }))),
      incompleteCases: cases.filter(entry => entry.error || (!entry.unsupported && (!entry.observations.length || !entry.plannedPhases.length
        || JSON.stringify(entry.completedPhases) !== JSON.stringify(entry.plannedPhases)))),
      unsupportedCases: cases.filter(entry => entry.unsupported).map(entry => ({ id: entry.id, reason: entry.unsupported })),
      casePageErrors: cases.flatMap(entry => entry.pageErrors.map(error => ({ id: entry.id, ...error }))),
      caseDiagnostics: cases.flatMap(entry => entry.diagnostics.map(diagnostic => ({ id: entry.id, ...diagnostic }))),
    })
    await page.close()
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim(), changedTracked = git('diff', '--name-only', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore, 'Source HEAD changed during comparison')
  assert.equal(changedTracked, '', 'Tracked source changed during comparison')
  assert.deepEqual(await readFile(runnerPath), runnerBytes, 'Runner bytes changed during comparison')
  assert.deepEqual(await readFile(join(repo, fixturePath)), fixture, 'Fixture bytes changed during comparison')
  const passed = result => result.cases.length > 0 && !result.errors.length && !result.failures.length && !result.incompleteCases.length && !result.casePageErrors.length && !result.caseDiagnostics.length
    && (result.source !== 'candidate' || !result.cases.some(entry => entry.unsupported))
  const current = results.find(result => result.source === 'candidate')
  const candidatePass = !serverErrors.length && Boolean(current) && passed(current)
  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`, filter,
    runnerSha256: digest(runnerBytes), fixtureSha256: digest(fixture), fixtureSource: headBefore,
    headBefore, headAfter, sourceUnchanged: true, sources, dependencyVersions, dependencyFiles, serverErrors, results,
    candidatePass,
    note: 'Bounded Person hidden-focus/read-only differential. Historical failures retain their raw status. No classifier, candidate exception, fabricated legacy API or B-HTML/B-STYLE topology decision is used.',
  }, null, 2))
  if (!candidatePass || results.some(result => !passed(result))) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
