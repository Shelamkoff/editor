// Isolated raw differential probe, with no acceptance classifiers or source transforms.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fixture = await readFile(join(repo, 'tests/browser/media-roundtrip-review-fixture.js'))
const dependencyRoot = join(repo, 'node_modules')
const sources = [
  { label: 'v1', root: '/tmp/rector-v1-5e5c7f8', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true },
  { label: 'spec-baseline', root: '/tmp/rector-e981ff3', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false },
  { label: 'candidate', root: repo, legacy: false,
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    patchSha256: digest(execFileSync('git', ['diff', '--binary'], { cwd: repo })) },
].map(source => ({ ...source, loaded: {} }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }, packages = new Set(), versions = {}, dependencyFiles = {}
const queue = Object.keys(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).dependencies).filter(name => name.startsWith('@shelamkoff/'))
while (queue.length) {
  const name = queue.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const manifest = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = manifest.exports?.['.'], path = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof path, 'string')
  imports[name] = '/dependencies/' + name + '/' + path.replace(/^\.\//, '')
  versions[name] = manifest.version
  queue.push(...Object.keys(manifest.dependencies ?? {}).filter(name => name.startsWith('@shelamkoff/')))
}
versions.dompurify = JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version
const errors = [], loaded = new Map()
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(source => pathname.startsWith('/' + source.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'))
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot, path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'))
      const bytes = await readFile(path)
      if (source) {
        if (source.label !== 'candidate') assert.deepEqual(bytes, execFileSync('git', ['show', source.sha + ':' + relative], { cwd: repo }))
        source.loaded[relative] = digest(bytes)
      } else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, bytes)
    }
    response.end(loaded.get(pathname))
  } catch (error) { errors.push(String(error)); response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const startedAt = new Date().toISOString(), results = []
let browser
try {
  browser = await chromium.launch({ executablePath: '/tmp/rector-browsers-156/chrome-linux64/chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error.stack ?? error)))
    await page.addInitScript(() => {
      window.__mediaWindowErrors = []
      window.addEventListener('error', event => window.__mediaWindowErrors.push({ type: 'error', message: event.message, stack: event.error?.stack }))
      window.addEventListener('unhandledrejection', event => window.__mediaWindowErrors.push({ type: 'rejection', message: String(event.reason) }))
    })
    await page.exposeFunction('__mediaNative', async (action, value) => {
      if (action === 'type') await page.keyboard.type(value)
      else await page.keyboard.press(action === 'undo' ? 'Control+z' : 'Control+Shift+z')
    })
    await page.goto(origin + '/')
    const cases = await page.evaluate(async source => {
      const { mediaRoundtripCases, runMediaRoundtripCase } = await import('/fixture.js')
      const cases = []
      for (const spec of mediaRoundtripCases) cases.push(await runMediaRoundtripCase(spec, {
        sourceBase: '/' + source.label + '/', legacy: source.legacy,
        typeText: value => window.__mediaNative('type', value), shortcut: action => window.__mediaNative(action),
      }))
      return cases
    }, source)
    const windowErrors = await page.evaluate(() => window.__mediaWindowErrors)
    results.push({ source: source.label, cases, pageErrors, windowErrors })
    await page.close()
  }
  for (const source of sources) for (const [path, hash] of Object.entries(source.loaded)) {
    assert.equal(digest(await readFile(join(source.root, path))), hash, 'Loaded source changed during the probe')
  }
  const failed = errors.length || results.some(result => result.pageErrors.length || result.windowErrors.length || result.cases.some(item => item.failures.length))
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), fixtureSha256: digest(fixture),
    runnerSha256: digest(await readFile(fileURLToPath(import.meta.url))), versions, dependencyFiles, sources, errors, results }, null, 2))
  if (failed) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
