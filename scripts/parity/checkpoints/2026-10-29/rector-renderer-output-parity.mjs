// Bounded RENDERER_OUTPUTS proof using the same public fixture as the browser
// and installed-package gates. Production bytes come directly from Git trees.
// Run with node; the complete observations and source hashes go to stdout.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: repo })
const hash = value => createHash('sha256').update(value).digest('hex')
const startedAt = new Date().toISOString()
const reproductionPath = fileURLToPath(import.meta.url)
const fixturePath = join(repo, 'tests/browser/public-extension-conformance.js')
const reproductionBytes = await readFile(reproductionPath)
const fixtureBytes = await readFile(fixturePath)
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340' },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8' },
  { label: 'candidate', sha: process.env.EDITOR_RENDERER_CANDIDATE_SHA ?? git('rev-parse', 'HEAD').toString().trim() },
].map(source => ({ ...source, sha: git('rev-parse', source.sha).toString().trim(), loaded: {} }))
const imports = { dompurify: '/node_modules/dompurify/dist/purify.es.mjs' }
const dependencies = { dompurify: JSON.parse(await readFile(join(repo, 'node_modules/dompurify/package.json'), 'utf8')).version }
for (const name of ['carousel', 'color-picker', 'cropper', 'event-bus', 'expose', 'infinite-scroll', 'masonry']) {
  const id = '@shelamkoff/' + name
  const manifest = JSON.parse(await readFile(join(repo, 'node_modules', id, 'package.json'), 'utf8'))
  const entry = manifest.exports['.']
  imports[id] = '/node_modules/' + id + '/' + (typeof entry === 'string' ? entry : entry.import).replace(/^\.\//, '')
  dependencies[id] = manifest.version
}
const served = new Map(), serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', /\.m?js$/.test(pathname) ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html')
    if (pathname === '/') {
      response.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports }) + '</script><title>Renderer output parity</title>')
      return
    }
    if (pathname === '/fixture.js') { response.end(fixtureBytes); return }
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (!served.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/node_modules/'), 'Unexpected fixture URL: ' + pathname)
      let bytes
      if (source) {
        const relative = pathname.slice(source.label.length + 2)
        assert(relative && !relative.split('/').includes('..'), 'Source URL escaped its Git tree')
        bytes = git('show', `${source.sha}:${relative}`)
        source.loaded[relative] = hash(bytes)
      } else {
        const path = resolve(repo, pathname.slice(1))
        assert(path.startsWith(resolve(repo, 'node_modules') + '/'), 'Dependency URL escaped node_modules')
        bytes = await readFile(path)
      }
      served.set(pathname, bytes)
    }
    response.end(served.get(pathname))
  } catch (error) {
    serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error))
  }
})

// These are fixed contract differences, not allowances for arbitrary failures.
// The error and independent observable effects must both match the defect.
function classifyBaseline(label, result) {
  const first = result.observations[0]
  const difference = (reason, expectedError, observations, classification = 'repaired defect') => {
    assert.equal(result.status, 'FAIL', `${label}: missing expected historical difference: ${result.name}`)
    assert.equal(result.failureCount, 1, `${label}: historical difference includes another operation, cleanup or window failure: ${result.error}`)
    assert.equal(result.firstErrorMessage, expectedError, `${label}: unexpected failure: ${result.error}`)
    for (const [key, value] of Object.entries(observations)) assert.deepEqual(first?.[key], value, `${label}: ${result.name}: ${key}`)
    return { classification, reason }
  }
  if (label === 'v1' && result.name.includes('unchanged live output retains focus')) {
    return difference('v1 reinserted unchanged nodes, losing input focus and reconnecting custom elements.',
      'Unchanged live output lost author focus', { focused: false, firstLifecycle: [2, 1], secondLifecycle: [2, 1] })
  }
  if (label === 'v1' && result.name.includes('JSON object key order')) {
    return difference('v1 treated JSON object insertion order as a content change; candidate retains semantic object equality and still detects array ordering.',
      'Equivalent object key order repainted live output', { rendered: 2, disposed: ['a'], sameBlock: false, text: 'Alpha:First,Second' }, 'performance improvement')
  }
  if (label === 'v1' && result.name.includes('application descendants')) {
    const method = result.name.match(/ownership: (renderBlock|renderTo|render) rejects/)[1]
    return difference('v1 accepted and decorated application-owned DOM; aggregate rendering also moved it from its parent.',
      'Renderer accepted a node belonging to an application subtree', {
        rejected: false, htmlUnchanged: false, parentUnchanged: method === 'renderBlock', targetUnchanged: method !== 'renderTo', disposed: 0,
      })
  }
  if (label === 'v1' && result.name.includes('preserves displaced')) {
    return difference('v1 cleared the application container while disposing displaced output, deleting replacement application or successor-renderer DOM.',
      'Displaced renderer removed replacement application or successor output', { releasedFirst: 1, releasedSecond: 0, replacementPreserved: false, originalDetached: true })
  }
  if (/ownership: (render|displaced renderTo|unknown renderBlock|registered renderBlock), destroy/.test(result.name)
      && (label === 'v1' || !result.name.includes('registered renderBlock'))) {
    return difference('Historical renderer did not reserve this returned output root against another live renderer; candidate rejects borrowing until its original owner releases it.',
      'A live renderer-owned output was accepted as another renderer\'s fresh block', {
        rejected: false, ownerHtmlUnchanged: false, ownerRemainedDetached: false, applicationPreserved: false, releasedFirst: 0, releasedSecond: 0,
      })
  }
  if (label === 'v1' && result.name.includes('failed renderTo restores application DOM')) {
    return difference('v1 failed to roll back a host DOM operation that threw after mutation and retained an unowned block resource.',
      'Failed renderTo did not release its created occurrence', {
        originalError: true, originalReleased: 0, applicationPreserved: false, provisionalWrapperDetached: false,
      })
  }
  if (result.name.includes('nested detached result survives')) {
    return difference('Historical renderer did not reserve independent nested document wrappers against another live renderer after an outer acquisition failed.',
      'Failed outer acquisition lost ownership of its nested output', { rejected: false, originalDetached: true, borrowedReleased: 0 })
  }
  assert.equal(result.status, 'PASS', `${label}: unexpected public-contract failure: ${result.error}`)
  assert.equal(result.failureCount, 0, `${label}: passed case contains a failure`)
  return { classification: 'preserved capability' }
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ?? '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const browser = await chromium.launch({
  executablePath: process.env.EDITOR_CHROME_PATH ?? '/tmp/rector-browsers/chrome-linux64/chrome',
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const results = [], verificationErrors = []
try {
  for (const source of sources) {
    const page = await browser.newPage(), browserErrors = []
    page.on('pageerror', error => browserErrors.push(error.stack ?? String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const cases = await page.evaluate(async label => {
      const { EditorRenderer } = await import('/' + label + '/renderer/index.js')
      const { runRendererOutputConformance } = await import('/fixture.js')
      return runRendererOutputConformance({ EditorRenderer, legacyEnvelope: label === 'v1' })
    }, source.label)
    assert.equal(cases.length, 27, 'A renderer output case was omitted')
    assert.deepEqual(browserErrors, [], 'Unexpected browser errors')
    for (const result of cases) {
      try {
        if (source.label === 'candidate') {
          assert.equal(result.status, 'PASS', result.error)
          assert.equal(result.failureCount, 0, 'Passed candidate case contains a failure')
          result.classification = 'candidate contract satisfied'
        } else Object.assign(result, classifyBaseline(source.label, result))
      } catch (error) { verificationErrors.push(`${source.label}: ${result.name}: ${String(error)}`) }
    }
    results.push({ label: source.label, sha: source.sha, cases })
    await page.close()
  }
  assert.deepEqual(results[0].cases.map(result => result.name), results[1].cases.map(result => result.name))
  assert.deepEqual(results[0].cases.map(result => result.name), results[2].cases.map(result => result.name))
  assert.deepEqual(serverErrors, [], 'A source-integrity or fixture-server error occurred')
  for (const source of sources) for (const [path, expectedHash] of Object.entries(source.loaded)) {
    assert.equal(hash(git('show', `${source.sha}:${path}`)), expectedHash, `Source hash changed: ${source.label}/${path}`)
  }
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'Public fixture changed during the run')
  assert.deepEqual(await readFile(reproductionPath), reproductionBytes, 'Reproduction source changed during the run')
  console.log(JSON.stringify({ scenario: 'RENDERER_OUTPUTS', startedAt, finishedAt: new Date().toISOString(),
    browser: await browser.version(), dependencies, reproductionSha256: hash(reproductionBytes), publicFixtureSha256: hash(fixtureBytes),
    policy: {
      sourceModules: 'Every production response is the exact bytes from its pinned Git tree; every loaded hash is rechecked after the run.',
      wireAdapters: 'Only legacy/current public document-envelope and custom schema spelling differ in the fixture.',
      boundary: 'Public EditorRenderer in real DOM, using the fixture registered in the standard browser and installed-package gates.',
      requirements: ['producer string/numeric revision zero deep reads', 'only changed block replaced', 'unchanged live focus and connection state',
        'unrevisioned in-place JSON data', 'semantic object key order versus array order', 'foreign and live renderer-owned output rejection',
        'target/global disposal, original-owner isolation and reuse', 'failed acquisition cleanup and nested output ownership'],
      limits: ['Bounded renderer output contract, not every built-in renderer feature', 'No new cross-realm, CSP or async-renderer compatibility claim',
        'Historical foreign-DOM interference is classified as a repaired defect under P00/P08, never accepted as desired parity'],
    }, sources, results, verificationErrors, sourceModulesUnchanged: true,
    candidatePassed: results[2].cases.every(result => result.status === 'PASS'),
  }, null, 2))
  if (verificationErrors.length) process.exitCode = 1
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
