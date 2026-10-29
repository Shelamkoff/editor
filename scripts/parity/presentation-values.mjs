// Portable, bounded FONT/class differential. Supply immutable baseline roots
// and an installed Playwright module; no production module is transformed.
// See presentation-values.md for the exact invocation and result boundaries.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo })
const baselineRoot = name => {
  assert(process.env[name], `${name} must name an immutable Git archive directory`)
  return resolve(process.env[name])
}
const playwright = process.env.EDITOR_PLAYWRIGHT_PATH
const { chromium } = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright')
const startedAt = new Date().toISOString()
const sourceSha256 = digest(await readFile(fileURLToPath(import.meta.url)))
const fixturePath = join(repo, 'tests/browser/presentation-values-fixture.js')
const fixtureBytes = await readFile(fixturePath)
const fixtureSha256 = digest(fixtureBytes)
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const requestedFilter = process.env.EDITOR_PRESENTATION_FILTER ?? ''
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: baselineRoot('EDITOR_V1_ROOT'), legacy: true },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', root: baselineRoot('EDITOR_SPEC_BASELINE_ROOT'), legacy: false },
  { label: 'candidate', sha: process.env.EDITOR_CANDIDATE_SHA ?? headBefore, root: resolve(process.env.EDITOR_CANDIDATE_ROOT ?? repo), legacy: false },
].map(source => ({ ...source, loaded: {} }))

const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pendingPackages = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pendingPackages.length) {
  const name = pendingPackages.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = dependency.version
  pendingPackages.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}

const loaded = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Presentation values differential</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixtureBytes); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected fixture URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot
      const path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Fixture URL escaped its source root')
      const bytes = await readFile(path)
      if (source) {
        assert.deepEqual(bytes, git('show', `${source.sha}:${relative}`), `${source.label}/${relative} differs from its pinned Git source`)
        source.loaded[relative] = digest(bytes)
      } else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, { bytes, path })
    }
    response.end(loaded.get(pathname).bytes)
  } catch (error) {
    serverErrors.push(String(error))
    response.statusCode = 500
    response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await chromium.launch({
    ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.exposeFunction('__presentationInput', async (action, text) => {
      if (action === 'type') await page.keyboard.type(text)
      else if (action === 'undo') await page.keyboard.press('Control+z')
      else if (action === 'redo') await page.keyboard.press('Control+Shift+z')
      else throw new Error('Unknown native input action: ' + action)
    })
    await page.goto(origin + '/')
    const cases = await page.evaluate(async ({ source, filter }) => {
      const { presentationValueCases, runPresentationValueCase } = await import('/fixture.js')
      const results = []
      for (const specification of presentationValueCases.filter(entry => !filter || entry.id.includes(filter))) {
        try {
          results.push(await runPresentationValueCase(specification, {
            sourceBase: '/' + source.label + '/', legacy: source.legacy,
            typeText: text => window.__presentationInput('type', text),
            shortcut: action => window.__presentationInput(action),
          }))
        } catch (error) {
          results.push({ id: specification.id, error: error.stack ?? String(error), failures: [{ property: 'execution', status: 'ERROR', actual: String(error) }] })
        }
      }
      return results
    }, { source, filter: requestedFilter })
    assert(cases.length > 0, 'The presentation filter selected no cases')
    for (const entry of cases) {
      // v1 reconstructs the whole editor through its history render callback.
      // Keep the failed identity assertions visible, while distinguishing that
      // repaired historical defect from required typography/history semantics.
      const isKnownV1Remount = failure => source.label === 'v1'
        && failure.property === 'neighborDomIdentity'
        && ['undo', 'redo'].includes(failure.phase)
        && failure.actual === false && failure.expected === true
      entry.classifiedDifferences = entry.failures.filter(isKnownV1Remount)
        .map(failure => ({ ...failure, classification: 'repaired-v1-history-remount' }))
      entry.unexpectedFailures = entry.failures.filter(failure => !isKnownV1Remount(failure))
    }
    results.push({ source: source.label, cases, errors })
    await page.close()
  }
  for (const { bytes, path } of loaded.values()) assert.deepEqual(await readFile(path), bytes, 'Source changed during probe: ' + path)
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'The browser fixture changed during its probe')
  assert.equal(digest(await readFile(fileURLToPath(import.meta.url))), sourceSha256, 'The runner changed during its probe')
  const failed = results.some(result => result.errors.length || result.cases.some(entry => entry.unexpectedFailures.length))
  console.log(JSON.stringify({
    scope: 'Supported template: FONT_1..9 and benign CLASS_SPAN/CLASS_CODE; actual coverage is listed in selectedCaseIds. Real editor load/save, renderer output, neighboring trusted input, exact one Undo/Redo, canonical formatting and computed CSS under actual 20px host/16px root. Hostile-class confinement and navigation remain separate open requirements.',
    requestedFilter, selectedCaseIds: results[0]?.cases.map(entry => entry.id) ?? [],
    startedAt, finishedAt: new Date().toISOString(), node: process.version, browser: await browser.version(),
    sourceSha256, fixtureSha256, headBefore, headAfter: git('rev-parse', 'HEAD').toString().trim(),
    sourceUnchanged: true, sourceIdentityVerified: serverErrors.length === 0,
    sources, dependencyVersions, dependencyFiles, serverErrors, results,
  }, null, 2))
  if (failed || serverErrors.length) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
