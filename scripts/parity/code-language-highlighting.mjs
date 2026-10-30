// Bounded Code language/highlighting comparison using immutable Git modules.
// Provider selection, literal text and native history retain their raw verdicts.
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
const fixturePath = 'tests/browser/code-language-parity-fixture.js'
const fixture = git('show', `${headBefore}:${fixturePath}`)
assert.deepEqual(fixture, await readFile(join(repo, fixturePath)), 'Fixture differs from committed source')
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true, loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false, loaded: {} },
  // Published counterpart of b856d85e; the full source tree is identical.
  { label: 'pre-fix', sha: 'b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c', legacy: false, loaded: {} },
  { label: 'candidate', sha: headBefore, legacy: false, loaded: {} },
]
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

const loaded = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Code language/highlighter comparison</title>'
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
  for (const source of sources) for (const language of ['custom-unknown-language', 'auto', 'javascript']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.exposeFunction('__codeNativeInput', async action => {
      if (action.kind === 'insert') await page.keyboard.insertText(action.text)
      else await page.keyboard.press(action.kind === 'undo' ? 'Control+z' : 'Control+Shift+z')
    })
    await page.goto(origin + '/')
    const result = await page.evaluate(async ({ source, language }) => {
      const { runCodeLanguageCase } = await import('/fixture.js')
      return runCodeLanguageCase({ sourceBase: `/${source.label}/`, legacy: source.legacy, language })
    }, { source: { label: source.label, legacy: source.legacy }, language })
    results.push({ source: source.label, ...result, errors,
      failures: result.observations.filter(value => value.status !== 'PASS'),
      incomplete: result.completedPhases.length !== 7,
    })
    await page.close()
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim()
  const changedTracked = git('diff', '--name-only', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore, 'Source HEAD changed during comparison')
  assert.equal(changedTracked, '', 'Tracked source changed during comparison')
  const candidate = results.filter(result => result.source === 'candidate')
  const candidatePass = candidate.every(result => !result.error && !result.errors.length && !result.failures.length && !result.incomplete)
  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`,
    runnerSha256: digest(await readFile(fileURLToPath(import.meta.url))), fixtureSha256: digest(fixture),
    headBefore, headAfter, sources, dependencyVersions, dependencyFiles, serverErrors, results,
    candidatePass, note: 'Historical differences are raw observations; no classifier grants reference or candidate exceptions.',
  }, null, 2))
  // Keep historical failures visible; this is a raw differential, not a
  // blanket all-source green test. The candidate outcome is recorded above.
  if (serverErrors.length || results.some(result => result.error || result.errors.length || result.failures.length || result.incomplete)) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
