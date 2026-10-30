import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = process.env.EDITOR_CANDIDATE_ROOT
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const baselineRoot = name => { assert(process.env[name], `${name} must name an immutable Git source directory`); return resolve(process.env[name]) }
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const startedAt = new Date().toISOString()
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const runnerPath = fileURLToPath(import.meta.url), runnerBytes = await readFile(runnerPath)
const fixturePath = fileURLToPath(new URL('./fixture.js', import.meta.url)), fixtureBytes = await readFile(fixturePath)
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
  const entry = dependency.exports?.['.'], imported = typeof entry === 'string' ? entry : entry?.import
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
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Checklist empty exit differential</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixtureBytes); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected fixture URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot, path = resolve(root, relative)
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
    serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await chromium.launch({ ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.exposeFunction('__galleryInput', async (action, value) => {
      if (action === 'type') await page.keyboard.type(value)
      else if (action === 'click') await page.mouse.click(value.x, value.y)
      else if (action === 'enter') await page.keyboard.press('Enter')
      else if (action === 'undo') await page.keyboard.press('Control+z')
      else if (action === 'redo') await page.keyboard.press('Control+Shift+z')
      else if (action === 'drag') {
        await page.mouse.move(value.from.x, value.from.y)
        await page.mouse.down()
        await page.mouse.move(value.from.x + 12, value.from.y + 6, { steps: 4 })
        await page.mouse.move(value.to.x, value.to.y, { steps: 12 })
        await page.mouse.move(value.to.x + 1, value.to.y + 1)
        await page.mouse.up()
      } else throw new Error('Unknown native input action: ' + action)
    })
    await page.goto(origin + '/')
    const output = await page.evaluate(async ({ source, filter }) => {
      const { cases: specifications, runCase } = await import('/fixture.js')
      const cases = [], pageErrors = []
      let activeCase = null, activePhase = null
      const onError = event => pageErrors.push({ caseId: activeCase, phase: activePhase, message: event.error?.message ?? event.message })
      window.addEventListener('error', onError)
      for (const specification of specifications.filter(value => !filter || value.id.includes(filter))) {
        activeCase = specification.id; activePhase = 'import'
        cases.push(await runCase(specification, {
          sourceBase: '/' + source.label + '/', legacy: source.legacy, input: window.__galleryInput,
          onPhase: value => { activePhase = value },
        }))
      }
      window.removeEventListener('error', onError)
      return { cases, pageErrors }
    }, { source, filter: process.env.EDITOR_CHECKLIST_FILTER ?? '' })
    assert(output.cases.length, 'The Checklist filter selected no cases')
    results.push({ source: source.label, ...output, errors })
    await page.close()
  }
  for (const { bytes, path } of loaded.values()) assert.deepEqual(await readFile(path), bytes, 'Source changed during Checklist probe: ' + path)
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'Checklist fixture changed during its probe')
  assert.deepEqual(await readFile(runnerPath), runnerBytes, 'Checklist runner changed during its probe')
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore, 'HEAD changed during Checklist probe')
  console.log(JSON.stringify({ scope: 'BLOCK_CHECKLIST_EMPTY_EXIT: sole/last empty, BR-only or formatting-only item; native preceding edit, Enter, two Undo and two Redo; stable surviving records, widgets and caret.',
    startedAt, finishedAt: new Date().toISOString(), browser: await browser.version(), node: process.version,
    headBefore, sourceUnchanged: true, sourceIdentityVerified: serverErrors.length === 0,
    runnerSha256: digest(runnerBytes), fixtureSha256: digest(fixtureBytes), 
     sources, dependencyVersions, dependencyFiles, serverErrors, results,
  }, null, 2))
  if (serverErrors.length || results.some(source => source.errors.length || source.pageErrors.length || source.cases.some(entry => entry.failures.length || entry.incompletePhases.length))) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
