// Public C07 task/read contracts. Production and shared test modules are exact
// Git objects; the test harness adds descriptor-only observation of assertions.
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
const runnerBytes = await readFile(fileURLToPath(import.meta.url))
assert.deepEqual(runnerBytes, git('show', headBefore + ':scripts/parity/task-authority.mjs'), 'Runner is not its committed source')
const fixturePath = 'tests/browser/scoped-authority.js'
const fixture = git('show', headBefore + ':' + fixturePath)
const lockBytes = await readFile(join(repo, 'package-lock.json'))
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false },
  { label: 'candidate', sha: headBefore, legacy: false },
].map(source => ({ ...source, tree: git('rev-parse', source.sha + '^{tree}').toString().trim(), loaded: {} }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = {}, dependencyFiles = {}, packages = new Set()
const pending = Object.keys(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).dependencies)
  .filter(name => name.startsWith('@shelamkoff/'))
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const definition = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = definition.exports?.['.'], imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', 'No public ESM dependency entry: ' + name)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = definition.version
  pending.push(...Object.keys(definition.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
dependencyVersions.dompurify = JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version

// This wrapper is served only at the fixed test harness URL. Original harness
// cleanup/error handling still runs. Accessor descriptors are recorded without
// invoking them: observing a result must not spend another application getter.
const harnessWrapper = String.raw`
import * as original from './harness-original.js'
export * from './harness-original.js'
let active = null, nodes = new WeakMap(), nodeId = 0
function snapshot(value, seen = new Set()) {
  if (value === undefined) return { $undefined: true }
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value
  if (['function', 'symbol', 'bigint'].includes(typeof value)) return { $type: typeof value }
  if (value instanceof Node) {
    if (!nodes.has(value)) nodes.set(value, ++nodeId)
    return { $node: nodes.get(value), name: value.nodeName, connected: value.isConnected }
  }
  if (seen.has(value)) return { $cycle: true }
  const next = new Set(seen); next.add(value)
  const result = Array.isArray(value) ? [] : Object.create(null)
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue
    Object.defineProperty(result, key, { enumerable: true, configurable: true, writable: true,
      value: Object.hasOwn(descriptor, 'value') ? snapshot(descriptor.value, next) : { $accessor: true } })
  }
  return result
}
export function test(name, operation) {
  original.test(name, () => {
    const entry = { name, observations: [], complete: false, error: null }
    ;(window.__authorityTrace ??= []).push(entry)
    active = entry; nodes = new WeakMap(); nodeId = 0
    try { const result = operation(); entry.complete = true; return result }
    catch (error) { entry.error = { name: error?.name ?? null, message: error?.message ?? String(error) }; throw error }
    finally { active = null }
  })
}
export function equal(actual, expected, message = '') {
  active?.observations.push({ kind: 'equal', actual: snapshot(actual), expected: snapshot(expected), message })
  return original.equal(actual, expected, message)
}
export function assert(actual, message) {
  active?.observations.push({ kind: 'assert', actual: !!actual, expected: true, message: message ?? null })
  return original.assert(actual, message)
}
`
const cache = new Map(), fixtureFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Public task authority comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script><body><pre id="result">running</pre></body>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (!cache.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert.ok(source || pathname.startsWith('/dependencies/'), 'Unknown source URL')
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert.ok(relative && !relative.split('/').includes('..'), 'Invalid source path')
      const fixedTest = source && relative.startsWith('tests/')
      const wrapped = fixedTest && relative === 'tests/browser/regressions/harness.js'
      const originalHarness = fixedTest && relative === 'tests/browser/regressions/harness-original.js'
      const path = originalHarness ? 'tests/browser/regressions/harness.js' : relative
      const bytes = source ? wrapped ? Buffer.from(harnessWrapper)
        : git('show', (fixedTest ? headBefore : source.sha) + ':' + path)
        : await readFile(join(dependencyRoot, relative))
      if (fixedTest && !wrapped) fixtureFiles[path] = digest(bytes)
      else if (source && !wrapped) source.loaded[relative] = digest(bytes)
      else if (!source) dependencyFiles[relative] = digest(bytes)
      cache.set(pathname, bytes)
    }
    response.end(cache.get(pathname))
  } catch (error) { serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}), headless: true })
  const results = []
  for (const source of sources) {
    const page = await browser.newPage(), pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.stack ?? String(error)))
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/')
      const observed = await page.evaluate(async source => {
        if (source.legacy) {
          const core = await import('/v1/core/index.js'), paragraph = await import('/v1/plugins/paragraph/index.js')
          const holder = document.createElement('section'); document.body.append(holder)
          const editor = core.createEditor({ holder, plugins: [new paragraph.Paragraph()], injectStyles: false,
            data: { version: '1.0.5', blocks: [{ id: 'control', type: 'paragraph', data: { text: 'Legacy control' } }] } })
          await new Promise(resolve => setTimeout(resolve, 25))
          const control = { saved: editor.save().blocks[0].data.text,
            visible: holder.querySelector('.oe-paragraph')?.textContent, rootPresent: !!holder.querySelector('.oe-editor') }
          editor.destroy(); control.rootRemoved = !holder.querySelector('.oe-editor'); holder.remove()
          return { availability: { currentOnly: true, createEditor: typeof core.createEditor,
            createParagraphPlugin: typeof paragraph.createParagraphPlugin, legacyParagraph: typeof paragraph.Paragraph,
            reason: 'The public instance-scoped DataTask/schema-context contract is v2-only; legacy plugin-private tasks are not substituted for it.' },
          control, cases: [], traces: [] }
        }
        await import('/' + source.label + '/tests/browser/scoped-authority.js')
        return { cases: window.__auditResults, traces: window.__authorityTrace }
      }, { label: source.label, legacy: source.legacy })
      results.push({ source: source.label, ...observed, pageErrors })
    } finally { await page.close() }
  }
  const headAfter = git('rev-parse', 'HEAD').toString().trim()
  assert.equal(headAfter, headBefore)
  assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '', 'Tracked source changed')
  assert.deepEqual(await readFile(fileURLToPath(import.meta.url)), runnerBytes)
  assert.deepEqual(await readFile(join(repo, 'package-lock.json')), lockBytes)
  for (const [path, hash] of Object.entries(fixtureFiles)) assert.equal(digest(git('show', headBefore + ':' + path)), hash)
  for (const source of sources) for (const [path, hash] of Object.entries(source.loaded)) assert.equal(digest(git('show', source.sha + ':' + path)), hash)
  for (const [path, hash] of Object.entries(dependencyFiles)) assert.equal(digest(await readFile(join(dependencyRoot, path))), hash)
  const declarations = paths => {
    try { return git('grep', '-n', '-F', 'beginTask', sources[0].sha, '--', ...paths).toString() }
    catch (error) { assert.equal(error.status, 1); assert.equal(error.stdout.length, 0); return '' }
  }
  const candidate = results.find(row => row.source === 'candidate'), legacy = results.find(row => row.source === 'v1')
  assert.deepEqual(legacy.control, { saved: 'Legacy control', visible: 'Legacy control', rootPresent: true, rootRemoved: true })
  const candidatePass = candidate.cases.length > 0 && candidate.cases.length === candidate.traces.length
    && candidate.cases.every(value => value.status === 'PASS') && candidate.traces.every(value => value.complete)
    && candidate.pageErrors.length === 0 && serverErrors.length === 0
  console.log(JSON.stringify({ scope: 'Public synchronous task/read authority; exact Git production modules and committed shared tests, descriptor-only assertion observation; no native gesture claim.',
    headBefore, headAfter, startedAt, finishedAt: new Date().toISOString(), node: process.version, browser: browser.version(),
    runnerSha256: digest(runnerBytes), fixtureSha256: digest(fixture), harnessWrapperSha256: digest(harnessWrapper),
    packageLockSha256: digest(lockBytes),
    fixtureSource: { storage: 'git-objects', sha: headBefore }, fixtureFiles, sources, dependencyFiles, dependencyVersions,
    legacyTaskDeclarations: declarations(['core', 'plugins', 'plugin-kit']), legacyPublicTaskDeclarations: declarations(['core', 'plugin-kit']),
    serverErrors, results, candidatePass }, null, 2))
  if (!candidatePass || results.some(row => row.cases.some(value => value.status !== 'PASS'))) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
