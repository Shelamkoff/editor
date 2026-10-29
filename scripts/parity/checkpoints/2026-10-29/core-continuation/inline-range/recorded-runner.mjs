import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { cpus, loadavg, release, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const base = '/tmp/rector-inline-payload-benchmark'
const repo = '/tmp/rector-image-recovery-20261029'
const variants = JSON.parse(await readFile(process.env.RECTOR_INLINE_VARIANTS ?? base + '/variants.json', 'utf8'))
const dependencyRoot = repo + '/node_modules'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fixture = await readFile(base + '/fixture.js')
const loaded = new Map(), errors = []
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const eventBus = JSON.parse(await readFile(dependencyRoot + '/@shelamkoff/event-bus/package.json', 'utf8'))
imports['@shelamkoff/event-bus'] = '/dependencies/@shelamkoff/event-bus/' + eventBus.exports['.'].import.replace(/^\.\//, '')
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports }) + '</script><body></body>')
      return
    }
    response.setHeader('content-type', 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    if (!loaded.has(pathname)) {
      const source = variants.find(variant => pathname.startsWith('/' + variant.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected module URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot
      const path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Module path must remain in its source')
      const bytes = await readFile(path)
      if (source) assert.deepEqual(bytes, execFileSync('git', ['show', source.commit + ':' + relative],
        { cwd: repo, maxBuffer: 64 * 1024 * 1024 }), 'Module bytes differ from the pinned commit')
      loaded.set(pathname, { path, bytes, sha256: hash(bytes) })
    }
    response.end(loaded.get(pathname).bytes)
  } catch (error) { errors.push(String(error)); response.writeHead(500); response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const startedAt = new Date().toISOString(), loadBefore = loadavg()
try {
  browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('pageerror', error => errors.push(error.stack ?? String(error)))
  await page.goto('http://127.0.0.1:' + server.address().port)
  const measured = await page.evaluate(async variants => {
    const { measure } = await import('/fixture.js')
    return measure(variants)
  }, variants.map(({ label }) => ({ label })))
  assert.deepEqual(errors, [])
  for (const entry of loaded.values()) assert.equal(hash(await readFile(entry.path)), entry.sha256, 'Source changed during the comparison')
  assert.equal(hash(await readFile(base + '/fixture.js')), hash(fixture), 'Fixture changed during measurement')
  const result = {
    boundary: 'Synchronous public registered InlineWidgetContext.updateData with actual scope, DOM projection, schema/store/history/events; one middle sidecar per update',
    excluded: ['editor construction/disposal', 'asynchronous MutationObserver/UI work after return', 'layout/paint', 'native input/IME', 'retained memory', 'universal timing thresholds'],
    historyMaxStack: 1, order: 'alternate the configured variant list and its reverse for each warmup and measured sample; settle rAF between updates',
    startedAt, finishedAt: new Date().toISOString(), sourceUnchanged: true,
    environment: { node: process.version, v8: process.versions.v8, chrome: browser.version(), platform: process.platform,
      architecture: process.arch, osRelease: release(), cpuModel: cpus()[0]?.model, cpuCount: cpus().length,
      totalMemoryBytes: totalmem(), loadBefore, loadAfter: loadavg() },
    variants, fixtureSha256: hash(fixture), runnerSha256: hash(await readFile(new URL(import.meta.url))),
    files: Object.fromEntries([...loaded].map(([url, entry]) => [url, entry.sha256])),
    lockSha256: hash(await readFile(repo + '/package-lock.json')), ...measured,
  }
  const output = process.argv[2] ?? base + '/result-v2.json'
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ output, environment: result.environment, results: measured.results }, null, 2))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
