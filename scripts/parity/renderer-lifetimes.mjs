// Compare registration and diagnostic-failure lifetimes at the public renderer boundary.
// Every production module is served from its immutable Git object.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(process.env.EDITOR_CANDIDATE_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)))
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 32 * 1024 * 1024 })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const runnerPath = fileURLToPath(import.meta.url)
const runnerBytes = await readFile(runnerPath)
const startedAt = new Date().toISOString()
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false },
  { label: 'parent', sha: '69c8425e0081fde69cf5176ccb73d032720c15fc', legacy: false },
  { label: 'candidate', sha: process.env.EDITOR_CANDIDATE_SHA ?? headBefore, legacy: false },
].map(source => ({ ...source, tree: git('rev-parse', source.sha + '^{tree}').toString().trim(), loaded: {} }))
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = {}, dependencyFiles = {}, serverErrors = []
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pending = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const path = name + '/package.json', bytes = await readFile(join(dependencyRoot, path))
  dependencyFiles[path] = digest(bytes)
  const definition = JSON.parse(bytes), entry = definition.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', 'Missing public ESM entry: ' + name)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = definition.version
  pending.push(...Object.keys(definition.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
const purifierBytes = await readFile(join(dependencyRoot, 'dompurify/package.json'))
dependencyFiles['dompurify/package.json'] = digest(purifierBytes)
dependencyVersions.dompurify = JSON.parse(purifierBytes).version
const fixturePath = join(repo, 'tests/browser/renderer-lifetime-parity-fixture.js')
const fixtureBytes = await readFile(fixturePath)
const cache = new Map()
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/fixture.js') { response.setHeader('content-type', 'text/javascript'); response.end(fixtureBytes); return }
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Renderer lifetime comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script><body></body>')
      return
    }
    if (!cache.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(relative && !relative.split('/').includes('..'), 'Invalid module path')
      const bytes = source ? git('show', source.sha + ':' + relative) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      cache.set(pathname, bytes)
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    response.end(cache.get(pathname))
  } catch (error) {
    serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const results = []
let browser
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const source of sources) {
    const page = await browser.newPage(), pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto('http://127.0.0.1:' + server.address().port)
    const cases = await page.evaluate(async source => {
      const { EditorRenderer } = await import('/' + source.label + '/renderer/index.js')
      const { runRendererLifetimeParity } = await import('/fixture.js')
      return runRendererLifetimeParity({ EditorRenderer, legacy: source.legacy })
    }, source)
    results.push({ source: source.label, cases, pageErrors })
    await page.close()
  }
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore, 'HEAD changed during comparison')
  assert.deepEqual(await readFile(runnerPath), runnerBytes, 'Runner changed during comparison')
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'Fixture changed during comparison')
  for (const [path, hash] of Object.entries(dependencyFiles)) {
    assert.equal(digest(await readFile(join(dependencyRoot, path))), hash, 'Dependency changed: ' + path)
  }
  const pass = result => result.cases.length === 21 && !result.pageErrors.length
    && result.cases.every(entry => entry.complete && !entry.errors.length
      && entry.observations.every(item => item.status === 'PASS'))
  const candidatePass = pass(results.find(result => result.source === 'candidate')) && !serverErrors.length
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), browser: await browser.version(), node: process.version,
    sourceIdentity: 'Every production module served from its exact Git object without transformation.',
    scope: '12 registration cases cover all three output routes, both signature modes, strict/placeholder unknown handling, retained output disposal and re-registration. Nine separate diagnostic-failure cases retain raw historical failures; they do not accept the whole RENDERER_ERRORS row.',
    headBefore, runnerSha256: digest(runnerBytes), fixtureSha256: digest(fixtureBytes),
    sources, dependencyVersions, dependencyFiles, serverErrors, results, candidatePass }, null, 2))
  if (!results.every(pass) || serverErrors.length) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
