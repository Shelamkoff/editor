// Raw responsive-image comparison. Source modules are immutable Git objects;
// authored URLs, descriptor semantics and bare-browser controls are independent.
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
const fixturePath = 'tests/browser/raw-srcset-fixture.js'
const imagePath = 'tests/browser/fixtures/srcset-pixel.svg'
const fixture = git('show', `${headBefore}:${fixturePath}`)
const pixel = git('show', `${headBefore}:${imagePath}`)
const runnerPath = fileURLToPath(import.meta.url)
const runner = git('show', `${headBefore}:scripts/parity/raw-srcset.mjs`)
assert.deepEqual(fixture, await readFile(join(repo, fixturePath)), 'Fixture differs from committed source')
assert.deepEqual(pixel, await readFile(join(repo, imagePath)), 'Media fixture differs from committed source')
assert.deepEqual(runner, await readFile(runnerPath), 'Runner differs from committed source')
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', loaded: {} },
  { label: 'pre-fix', sha: '69c8425e0081fde69cf5176ccb73d032720c15fc', loaded: {} },
  { label: 'candidate', sha: headBefore, loaded: {} },
]
const dependencyVersion = JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const loaded = new Map(), dependencyFiles = {}, serverErrors = [], mediaRequests = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Raw srcset comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    if (pathname === '/' + imagePath) {
      mediaRequests.push({ url: request.url, status: 200 })
      response.setHeader('content-type', 'image/svg+xml')
      response.setHeader('cache-control', 'no-store')
      response.end(pixel)
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith(`/${value.label}/`))
      if (!source && !pathname.startsWith('/dependencies/')) {
        // A wrong resource URL selected by the unchanged sanitizer is a product
        // observation, not a fixture-server failure or an invented image.
        mediaRequests.push({ url: request.url, status: 404 })
        response.statusCode = 404
        response.end('No such fixture resource')
        return
      }
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(!relative.split('/').includes('..'), 'Invalid source path')
      const bytes = source ? git('show', `${source.sha}:${relative}`) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, bytes)
    }
    response.end(loaded.get(pathname))
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
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.stack ?? String(error)))
      await page.goto(origin + '/')
      const names = await page.evaluate(async () => (await import('/fixture.js')).srcsetCases)
      for (const name of names) {
        const beforeRequests = mediaRequests.length
        const beforeErrors = errors.length
        const result = await page.evaluate(async ({ label, name }) => {
          const { observeSrcset } = await import('/fixture.js')
          const sanitizer = await import(`/${label}/shared/sanitize/sanitizeRawHtml.js`)
          return observeSrcset({ name, sanitizer })
        }, { label: source.label, name })
        results.push({ source: source.label, ...result,
          failures: result.observations.filter(value => value.status !== 'PASS'),
          errors: errors.slice(beforeErrors), mediaRequests: mediaRequests.slice(beforeRequests),
        })
      }
    } finally { await context.close() }
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore, 'Source HEAD changed during comparison')
  assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Tracked source changed during comparison')
  const candidatePass = results.filter(result => result.source === 'candidate')
    .every(result => result.complete && !result.error && !result.errors.length && !result.failures.length)
  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`,
    headBefore, headAfter, tree: git('rev-parse', 'HEAD^{tree}').toString().trim(),
    runnerSha256: digest(runner), fixtureSha256: digest(fixture), imageSha256: digest(pixel),
    sources, dependencyVersion, dependencyFiles, serverErrors, results, candidatePass,
    note: 'Raw historical failures are retained. No classifier or exception changes a verdict. The current dependency is shared only by sources that import it; v1 uses its own vendored DOMPurify.',
  }, null, 2))
  if (serverErrors.length || results.some(result => !result.complete || result.error || result.errors.length || result.failures.length)) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
