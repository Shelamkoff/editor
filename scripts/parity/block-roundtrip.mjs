// Portable public block ROUNDTRIP differential. Supply immutable baseline roots
// and an installed Playwright module; no production module is transformed.
// See block-roundtrip.md for the exact invocation and result boundaries.
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
const baselineRoot = name => {
  assert(process.env[name], `${name} must name an immutable Git archive directory`)
  return resolve(process.env[name])
}
const playwright = process.env.EDITOR_PLAYWRIGHT_PATH
const { chromium } = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright')
const startedAt = new Date().toISOString()
const sourceSha256 = digest(await readFile(fileURLToPath(import.meta.url)))
const fixturePath = join(repo, 'tests/browser/block-roundtrip-fixture.js')
const fixtureBytes = await readFile(fixturePath)
const fixtureSha256 = digest(fixtureBytes)
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const requestedFilter = process.env.EDITOR_ROUNDTRIP_FILTER ?? ''
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
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Block roundtrip differential</title>'
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
    await page.exposeFunction('__roundtripInput', async (action, text) => {
      if (action === 'type') await page.keyboard.type(text)
      else if (action === 'click') await page.mouse.click(text.x, text.y)
      else if (action === 'undo') await page.keyboard.press('Control+z')
      else if (action === 'redo') await page.keyboard.press('Control+Shift+z')
      else throw new Error('Unknown native input action: ' + action)
    })
    await page.goto(origin + '/')
    const cases = await page.evaluate(async ({ source, filter }) => {
      const { blockRoundtripCases, runBlockRoundtripCase } = await import('/fixture.js')
      const results = []
      for (const specification of blockRoundtripCases.filter(entry => !filter || entry.id.includes(filter))) {
        try {
          results.push(await runBlockRoundtripCase(specification, {
            sourceBase: '/' + source.label + '/', legacy: source.legacy,
            focusField: field => {
              const rect = field.getBoundingClientRect()
              return window.__roundtripInput('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            },
            typeText: text => window.__roundtripInput('type', text),
            shortcut: action => window.__roundtripInput(action),
          }))
        } catch (error) {
          results.push({ id: specification.id, error: error.stack ?? String(error), failures: [{ property: 'execution', status: 'ERROR', actual: String(error) }] })
        }
      }
      return results
    }, { source, filter: requestedFilter })
    assert(cases.length > 0, 'The roundtrip filter selected no cases')
    for (const entry of cases) {
      const observedIds = ['BLOCK_PARAGRAPH_ROUNDTRIP/default', 'BLOCK_PARAGRAPH_ROUNDTRIP/populated',
        'BLOCK_PARAGRAPH_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_HEADING_ROUNDTRIP/default',
        'BLOCK_HEADING_ROUNDTRIP/populated', 'BLOCK_HEADING_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/populated',
        'BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/populated-neighbor-edit',
        'BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/populated',
        'BLOCK_TOGGLE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed']
      const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
      const classify = failure => {
        if (!observedIds.includes(entry.id)) return null
        if (source.label === 'v1') {
          const populated = !['BLOCK_PARAGRAPH_ROUNDTRIP/default', 'BLOCK_HEADING_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/default'].includes(entry.id)
          const listCase = ['BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const quoteCase = ['BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const warningCase = ['BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const codeCase = ['BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/populated'].includes(entry.id)
          const checklistCase = ['BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const delimiterCase = ['BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/populated-neighbor-edit'].includes(entry.id)
          const imageCase = ['BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/populated'].includes(entry.id)
          const toggleCase = ['BLOCK_TOGGLE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed'].includes(entry.id)
          const size = failure.property === 'blockDomIdentity' ? populated ? 3 : 1
            : failure.property === 'widgetDomIdentity' && populated && !codeCase && !delimiterCase && !imageCase ? 2
              : failure.property === 'itemDomIdentity' && listCase ? populated ? 2 : 1
                : failure.property === 'quoteFieldDomIdentity' && quoteCase ? 2
                  : failure.property === 'warningFieldDomIdentity' && warningCase ? 2
                    : failure.property === 'toggleFieldDomIdentity' && toggleCase ? 2
                    : failure.property === 'plainFieldDomIdentity' && codeCase ? 1
                      : failure.property === 'checklistDomIdentity' && checklistCase ? populated ? 6 : 3
                        : failure.property === 'delimiterDomIdentity' && delimiterCase ? 1
                          : failure.property === 'imageDomIdentity' && imageCase ? populated ? 3 : 1 : 0
          const remountPhases = ['BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/default'].includes(entry.id) ? ['read-only', 'editable-again'] : ['read-only', 'editable-again', 'undo', 'redo']
          if (size && remountPhases.includes(failure.phase)
            && same(failure.actual, Array(size).fill(false)) && same(failure.expected, Array(size).fill(true))) {
            return ['read-only', 'editable-again'].includes(failure.phase) ? 'repaired-v1-mode-remount' : 'repaired-v1-history-remount'
          }
          const undo = entry.phases?.find(phase => phase.phase === 'undo')
          const generatedId = entry.phases?.find(phase => phase.phase === 'load')?.blocks?.[0]?.id
          if (entry.id === 'BLOCK_LIST_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'LI', className: 'oe-list__item' },
              anchor: { block: generatedId, node: 'UL', text: '', offset: 1 },
              focus: { block: generatedId, node: 'UL', text: '', offset: 1 },
            })) return 'repaired-v1-empty-list-caret'
          if (entry.id === 'BLOCK_QUOTE_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'BLOCKQUOTE', className: 'oe-quote__text' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-quote-caret'
          if (entry.id === 'BLOCK_WARNING_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-warning__title' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-warning-caret'
          if (entry.id === 'BLOCK_TOGGLE_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-toggle__title' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-toggle-caret'
          if (entry.id === 'BLOCK_CHECKLIST_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-checklist__text' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 1 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 1 },
            })) return 'repaired-v1-empty-checklist-caret'
          if (entry.id === 'BLOCK_CODE_ROUNDTRIP/populated' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && same(failure.actual, { focused: false, anchor: 61, focus: 61, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 61, focus: 61, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
              anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
              focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
            })) return 'repaired-v1-first-undo-caret'
          const codeId = populated ? 'probe' : generatedId
          const redo = entry.phases?.find(phase => phase.phase === 'redo')
          const codeEnd = populated ? 62 : 1
          if (codeCase && failure.phase === 'redo' && failure.property === 'nativeSelection'
            && typeof codeId === 'string' && codeId.length > 0
            && same(failure.actual, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(failure.expected, { focused: true, anchor: codeEnd, focus: codeEnd, collapsed: true })
            && same(redo?.selectionOwner, {
              active: { block: codeId, node: 'TEXTAREA', className: 'oe-code-textarea' },
              anchor: { block: codeId, node: '#text', text: '\n', offset: 1 },
              focus: { block: codeId, node: '#text', text: '\n', offset: 1 },
            })) return 'repaired-v1-code-redo-caret'
          const offset = imageCase ? 18 : quoteCase || warningCase || toggleCase ? 12 : 14
          if (populated && !codeCase && !delimiterCase && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && same(failure.actual, { focused: false, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: offset, focus: offset, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
              anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
              focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
            })) return 'repaired-v1-first-undo-caret'
        }
        if (source.label === 'spec-baseline'
          && ['BLOCK_PARAGRAPH_ROUNDTRIP/populated', 'BLOCK_HEADING_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed'].includes(entry.id)
          && failure.phase === 'read-only-transition' && failure.property === 'execution'
          && failure.actual === 'Inline widget root left its projection boundary before hydration'
          && same(entry.completedPhases, ['load'])
          && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) {
          return 'repaired-baseline-formatted-widget-mode-failure'
        }
        return null
      }
      entry.classifiedDifferences = entry.failures.flatMap(failure => {
        const classification = classify(failure)
        return classification ? [{ ...failure, classification }] : []
      })
      entry.unexpectedFailures = entry.failures.filter(failure => !classify(failure))
    }
    results.push({ source: source.label, cases, errors })
    await page.close()
  }
  for (const { bytes, path } of loaded.values()) assert.deepEqual(await readFile(path), bytes, 'Source changed during probe: ' + path)
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'The browser fixture changed during its probe')
  assert.equal(digest(await readFile(fileURLToPath(import.meta.url))), sourceSha256, 'The runner changed during its probe')
  const failed = results.some(result => result.errors.length || result.cases.some(entry => entry.unexpectedFailures.length))
  console.log(JSON.stringify({
    scope: 'Public ROUNDTRIP template; actual implemented and selected coverage is listed in selectedCaseIds. Default/populated construction, detached/mounted renderer, read-only and back, native declared-field edit and one Undo/Redo where applicable (Delimiter records a labeled neighbor edit, while empty Delimiter/Image record explicit not-applicable phases), fixed canonical marks/sidecars/IDs/order and cleanup. This does not accept detailed behavior rows or all built-in blocks.',
    requestedFilter, selectedCaseIds: results[0]?.cases.map(entry => entry.id) ?? [],
    incompleteCases: results.flatMap(source => source.cases.filter(entry => entry.incompletePhases?.length)
      .map(entry => ({ source: source.source, id: entry.id, completed: entry.completedPhases, incomplete: entry.incompletePhases }))),
    notApplicableCases: results.flatMap(source => source.cases.filter(entry => entry.notApplicablePhases?.length)
      .map(entry => ({ source: source.source, id: entry.id, phases: entry.notApplicablePhases, reason: entry.reason }))),
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
