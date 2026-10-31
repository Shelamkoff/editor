import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const headBefore = git('rev-parse', 'HEAD').toString().trim(), startedAt = new Date().toISOString()
// Freeze fixture bytes at startup. Product modules always come from immutable
// Git objects, so another agent's worktree edits/commits cannot alter this run.
const fixturePath = 'tests/browser/attaches-files-parity-fixture.js'
const fixture = await readFile(join(repo, fixturePath)), runner = await readFile(fileURLToPath(import.meta.url))
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', ref: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true },
  { label: 'spec-baseline', ref: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false },
  { label: 'candidate', ref: process.env.EDITOR_CANDIDATE_SHA ?? headBefore, legacy: false },
].map(source => ({ ...source, object: git('rev-parse', source.ref).toString().trim(),
  objectType: git('cat-file', '-t', source.ref).toString().trim(), tree: git('rev-parse', `${source.ref}^{tree}`).toString().trim(), loaded: {} }))
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
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Attaches file sources comparison</title>'
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
      const bytes = source ? git('show', `${source.tree}:${relative}`) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, bytes)
    }
    response.end(loaded.get(pathname))
  } catch (error) { serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const fileDirectory = await mkdtemp(join(tmpdir(), 'rector-attaches-files-'))
let browser
const results = []
try {
  browser = await chromium.launch({ ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors = [], consoleMessages = []
    // Enable interception before navigation. Installing the first listener in
    // the exposed callback can race the first programmatic input.click().
    page.on('filechooser', () => {})
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }))
    await page.exposeFunction('__attachesFilesInput', async (action, value) => {
      if (action === 'type') await page.keyboard.type(value)
      else if (action === 'click') await page.mouse.click(value.x, value.y)
      else if (action === 'key') await page.keyboard.press(value)
      else if (action === 'files') {
        const paths = []
        for (const [index, file] of value.files.entries()) {
          const directory = join(fileDirectory, String(index)); await mkdir(directory, { recursive: true })
          const path = join(directory, file.name)
          assert(!file.name.includes('/') && !file.name.includes('\\'), 'Fixture filenames must be basenames')
          await writeFile(path, Buffer.from(file.bytes)); paths.push(path)
        }
        const choosing = page.waitForEvent('filechooser', { timeout: 10000 })
        await page.mouse.click(value.x, value.y)
        const chooser = await choosing, multiple = chooser.isMultiple()
        await chooser.setFiles(paths)
        return { multiple }
      } else throw new Error(`Unknown input action: ${action}`)
    })
    await page.goto(origin + '/')
    const cases = await page.evaluate(async ({ source, filter }) => {
      const { attachesFilesCases, runAttachesFilesCase, plannedAttachesFilesPhases } = await import('/fixture.js')
      const cases = []
      for (const specification of attachesFilesCases.filter(value => !filter || value.id.includes(filter))) {
        cases.push({ ...await runAttachesFilesCase(specification, { sourceBase: `/${source.label}/`, legacy: source.legacy, native: window.__attachesFilesInput }),
          plannedPhases: plannedAttachesFilesPhases(specification) })
      }
      return cases
    }, { source: { label: source.label, legacy: source.legacy }, filter: process.env.EDITOR_ATTACHES_FILES_FILTER ?? '' })
    results.push({ source: source.label, cases, errors, consoleMessages,
      unsupportedCases: cases.filter(entry => entry.unsupported).map(entry => ({ id: entry.id, reason: entry.unsupported })),
      failures: cases.flatMap(entry => entry.observations.filter(value => value.status !== 'PASS').map(value => ({ id: entry.id, ...value }))),
      incompleteCases: cases.filter(entry => entry.error || (!entry.unsupported && (!entry.observations.length || !entry.plannedPhases.length
        || JSON.stringify(entry.completedPhases) !== JSON.stringify(entry.plannedPhases)))),
      casePageErrors: cases.flatMap(entry => (entry.pageErrors ?? []).map(error => ({ id: entry.id, ...error }))),
    })
    await page.close()
  }
  assert.deepEqual(await readFile(join(repo, fixturePath)), fixture, 'Fixture changed during comparison')
  assert.deepEqual(await readFile(fileURLToPath(import.meta.url)), runner, 'Runner changed during comparison')
  const passed = result => result.cases.length > 0 && !result.errors.length && !result.failures.length && !result.incompleteCases.length
    && !result.casePageErrors.length && (result.source !== 'candidate' || !result.unsupportedCases.length)
  const candidatePass = !serverErrors.length && passed(results.find(result => result.source === 'candidate'))
  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), platform: `${process.platform} ${process.arch}`, filter: process.env.EDITOR_ATTACHES_FILES_FILTER ?? '',
    runnerSha256: digest(runner), fixtureSha256: digest(fixture), headBefore, headAfter: git('rev-parse', 'HEAD').toString().trim(),
    sources, dependencyVersions, dependencyFiles, serverErrors, results, candidatePass, exceptions: [],
    note: 'Raw differential: historical failures retain failure status; no classifiers or candidate exceptions. Fixture bytes frozen and hashed, products pinned by tree.',
  }, null, 2))
  if (!candidatePass || results.some(result => !passed(result))) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await rm(fileDirectory, { recursive: true, force: true }) }
