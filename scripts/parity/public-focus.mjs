// Execute the public keyed-focus contract against immutable source objects.
// v1 exposes block.focus(), but no keyed/numeric focus command. Its real public
// focus/native-navigation control is recorded separately; no adapter fabricates
// the newer return value or requested numeric behavior.
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
const cache = new Map()
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Public focus comparison</title>'
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
const cases = [
  { id: 'FOCUS_VALUES_OFFSET_1', offset: 2, expected: 2 },
  { id: 'FOCUS_VALUES_OFFSET_2', offset: 2.9, expected: 2 },
  { id: 'FOCUS_VALUES_OFFSET_3', offset: -2, expected: 0 },
  { id: 'FOCUS_VALUES_OFFSET_4', offset: 1000, expected: 5 },
  { id: 'FOCUS_VALUES_OFFSET_5', offset: 'start', expected: 0 },
  { id: 'FOCUS_VALUES_OFFSET_6', offset: 'end', expected: 5 },
  { id: 'DEFECT_FIRST_FOCUS', offset: 2, expected: 2, destination: 'b' },
]
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
    await page.evaluate(async source => {
      const { createEditor } = await import('/' + source.label + '/core/index.js')
      const paragraph = await import('/' + source.label + '/plugins/paragraph/index.js')
      const clone = value => structuredClone(value)
      window.focusFixture = {
        source, createEditor, paragraph, entry: null, editor: null, holder: null,
        check(property, actual, expected) {
          this.entry.observations.push({ property, actual, expected,
            status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
        },
        records(edited = false) {
          return ['a', 'b'].map((id, index) => {
            let text = index ? 'Bravo' : 'Alpha'
            if (edited && id === this.destination) text = text.slice(0, this.expected) + 'X' + text.slice(this.expected)
            return { id, type: 'paragraph', ...(!source.legacy ? { dataVersion: 2 } : {}), data: { text } }
          })
        },
        selection() {
          const native = window.getSelection(), field = this.field()
          const point = (node, offset) => {
            if (!node || !field.contains(node)) return null
            const range = document.createRange(); range.selectNodeContents(field); range.setEnd(node, offset)
            return range.toString().length
          }
          return { active: document.activeElement === field, anchor: point(native.anchorNode, native.anchorOffset),
            focus: point(native.focusNode, native.focusOffset), collapsed: native.isCollapsed }
        },
        field(id = this.destination) {
          return [...this.holder.querySelectorAll('.oe-block')].find(element => element.dataset.id === id
            || element.dataset.blockId === id)?.querySelector('.oe-paragraph')
            ?? this.holder.querySelectorAll('.oe-paragraph')[id === 'a' ? 0 : 1]
        },
        async setup(spec) {
          this.entry = { id: spec.id, observations: [], phases: [], errors: [], complete: false }
          this.destination = spec.destination ?? 'a'; this.expected = spec.expected
          this.holder = document.createElement('section'); document.body.append(this.holder)
          this.supplied = { version: source.legacy ? '1.0.5' : '2.0.0', blocks: this.records() }
          this.original = clone(this.supplied)
          this.editor = createEditor({ holder: this.holder,
            plugins: [source.legacy ? new paragraph.Paragraph({ injectStyles: false }) : paragraph.createParagraphPlugin({ injectStyles: false })],
            inlineTools: [], inlinePlugins: [], injectStyles: false, data: this.supplied })
          await new Promise(resolve => setTimeout(resolve, 0))
          this.check('initialRecords', this.editor.save().blocks, this.records())
          this.check('initialHistory', [this.editor.canUndo, this.editor.canRedo], [false, false])
          this.events = []
          if (source.legacy) {
            this.check('keyedFocusApiAbsent', typeof this.editor.blocks.focus, 'undefined')
            this.editor.blocks.getBlockById('a').focus()
            this.editor.blocks.getBlockById(this.destination).focus()
          } else {
            this.editor.blocks.focus('a', { fieldKey: 'text', offset: 'end' })
            this.unsubscribe = this.editor.on('currentBlock:changed', event => {
              this.events.push({ id: event.currentId, selection: this.selection() })
            })
            const accepted = this.editor.blocks.focus(this.destination, { fieldKey: 'text', offset: spec.offset })
            this.check('accepted', accepted, true)
            this.check('currentId', this.editor.blocks.currentId, this.destination)
            this.check('selection', this.selection(), { active: true, anchor: spec.expected, focus: spec.expected, collapsed: true })
            this.check('settledCurrentEvents', this.events, spec.destination ? [{ id: 'b',
              selection: { active: true, anchor: 2, focus: 2, collapsed: true } }] : [])
          }
          this.check('focusKeepsRecords', this.editor.save().blocks, this.records())
          this.check('focusKeepsHistory', [this.editor.canUndo, this.editor.canRedo], [false, false])
          this.check('focusKeepsCallerInput', this.supplied, this.original)
          this.entry.phases.push('focus')
        },
        observe(phase) {
          const edited = phase !== 'undo'
          this.check(phase + '.records', this.editor.save().blocks, this.records(edited))
          this.check(phase + '.history', [this.editor.canUndo, this.editor.canRedo], edited ? [true, false] : [false, true])
          this.check(phase + '.selection', this.selection(), { active: true,
            anchor: this.expected + (edited ? 1 : 0), focus: this.expected + (edited ? 1 : 0), collapsed: true })
          this.check(phase + '.callerInput', this.supplied, this.original)
          this.entry.phases.push(phase)
        },
        finish() {
          this.unsubscribe?.(); this.unsubscribe = null
          this.editor.destroy(); this.holder.remove()
          this.entry.phases.push('destroy'); this.entry.complete = true
          return this.entry
        },
      }
    }, source)
    const entries = []
    const selected = source.legacy ? [{ id: 'V1_PUBLIC_FOCUS_NATIVE_NAVIGATION', expected: 2, destination: 'b' }] : cases
    for (const spec of selected) {
      try {
        await page.evaluate(spec => window.focusFixture.setup(spec), spec)
        if (source.legacy) {
          // These are actual browser operations for the old public surface,
          // never a replacement implementation of numeric/keyed focus.
          await page.keyboard.press('Home')
          await page.keyboard.press('ArrowRight')
          await page.keyboard.press('ArrowRight')
          await page.evaluate(() => {
            const fixture = window.focusFixture
            fixture.check('nativeNavigationSelection', fixture.selection(), { active: true, anchor: 2, focus: 2, collapsed: true })
            fixture.check('nativeNavigationHistory', [fixture.editor.canUndo, fixture.editor.canRedo], [false, false])
          })
        }
        await page.keyboard.type('X')
        await page.evaluate(() => window.focusFixture.observe('edit'))
        await page.keyboard.press('Control+z')
        await page.evaluate(() => window.focusFixture.observe('undo'))
        await page.keyboard.press('Control+Shift+z')
        await page.evaluate(() => window.focusFixture.observe('redo'))
        entries.push(await page.evaluate(() => window.focusFixture.finish()))
      } catch (error) {
        const entry = await page.evaluate(() => window.focusFixture.entry)
        entry.errors.push(error.stack ?? String(error)); entries.push(entry)
        await page.evaluate(() => { window.focusFixture.editor?.destroy(); window.focusFixture.holder?.remove() }).catch(() => {})
      }
    }
    results.push({ source: source.label,
      unsupported: source.legacy ? cases.map(({ id }) => ({ id, status: 'UNSUPPORTED',
        reason: 'v1 has public block.focus(), but no public keyed/numeric focus command or boolean acknowledgment.' })) : [],
      cases: entries, pageErrors })
    await page.close()
  }
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore, 'HEAD changed during comparison')
  assert.deepEqual(await readFile(runnerPath), runnerBytes, 'Runner changed during comparison')
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), browser: await browser.version(), node: process.version,
    sourceIdentity: 'Every production module served from its exact Git object without transformation.',
    scope: 'Seven keyed/numeric focus contracts with native typing and keyboard Undo/Redo. The v1 public-focus/native-navigation control is separate; its absent newer APIs are explicitly unsupported.',
    headBefore, runnerSha256: digest(runnerBytes), sources, dependencyVersions, dependencyFiles, serverErrors, results }, null, 2))
  if (serverErrors.length || results.some(result => result.pageErrors.length || result.cases.some(entry => !entry.complete
    || entry.errors.length || entry.observations.some(observation => observation.status !== 'PASS')))) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
