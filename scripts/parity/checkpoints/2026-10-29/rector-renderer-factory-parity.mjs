import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: '/tmp/rector-v1-5e5c7f8', entries: ['renderer/index.js'], schema: false },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', root: '/tmp/rector-e981ff3', entries: ['renderer/index.js', 'renderer/EditorRenderer.js'], schema: true },
  { label: 'candidate', sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), root: repo, entries: ['renderer/index.js', 'renderer/EditorRenderer.js'], schema: true },
]
for (const source of sources) {
  source.verifiedEntries = {}
  for (const entry of source.entries) {
    const bytes = await readFile(join(source.root, entry))
    assert.deepEqual(bytes, execFileSync('git', ['show', `${source.sha}:${entry}`], { cwd: repo }), `${source.label}/${entry} differs from Git`)
    source.verifiedEntries[entry] = createHash('sha256').update(bytes).digest('hex')
  }
}

const imports = { dompurify: '/node_modules/dompurify/dist/purify.es.mjs' }
for (const name of ['carousel', 'color-picker', 'cropper', 'event-bus', 'expose', 'infinite-scroll', 'masonry']) {
  const id = '@shelamkoff/' + name
  const manifest = JSON.parse(await readFile(join(repo, 'node_modules', id, 'package.json'), 'utf8'))
  const exported = manifest.exports['.']
  const entry = typeof exported === 'string' ? exported : exported.import
  imports[id] = '/node_modules/' + id + '/' + entry.replace(/^\.\//, '')
}
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', /\.m?js$/.test(pathname) ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html')
    if (pathname === '/') {
      response.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports }) + '</script><title>Renderer factory control</title>')
      return
    }
    const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
    const relative = source ? pathname.slice(source.label.length + 2) : pathname.slice(1)
    response.end(await readFile(join(source?.root ?? repo, relative)))
  } catch (error) { response.statusCode = 404; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: process.env.EDITOR_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const results = []
try {
  for (const source of sources) {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(async ({ label, schema }) => {
      const module = await import('/' + label + '/renderer/index.js')
      const { EditorRenderer, createEditorRenderer } = module
      const check = (condition, message) => { if (!condition) throw new Error(message) }
      const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message + ': ' + JSON.stringify({ actual, expected }))
      const factoryExpected = label !== 'candidate'
      check(typeof EditorRenderer === 'function', 'Missing public constructor')
      equal(Object.hasOwn(module, 'createEditorRenderer'), factoryExpected, 'Factory surface differs from its expected migration state')
      const config = () => ({ blockTypes: [], injectStyles: false, classPrefix: 'editor', theme: 'light' })
      class ArticleRenderer extends EditorRenderer {
        getClassPrefix() { return super.getClassPrefix() + '-subclass' }
      }
      const subclass = new ArticleRenderer(config())
      check(subclass instanceof EditorRenderer, 'Public subclass lost its base')
      equal(subclass.getClassPrefix(), 'editor-subclass', 'Public override does not dispatch through super')
      subclass.destroy()

      const constructions = [['constructor', input => new EditorRenderer(input)]]
      if (factoryExpected) constructions.push(['factory', input => createEditorRenderer(input)])
      const controls = []
      for (const [construction, create] of constructions) {
        const inputConfig = config(), configBefore = JSON.stringify(inputConfig)
        const renderer = create(inputConfig)
        check(renderer instanceof EditorRenderer, construction + ' did not produce the public class')
        check(Object.getPrototypeOf(renderer) === EditorRenderer.prototype, construction + ' returned a different wrapper prototype')
        equal(renderer.getClassPrefix(), 'editor', construction + ' did not forward classPrefix')
        const prefixed = create({ ...inputConfig, classPrefix: 'article' })
        equal(prefixed.getClassPrefix(), 'article', construction + ' did not forward nondefault classPrefix')
        prefixed.destroy()
        equal(renderer.getRegisteredTypes(), [], construction + ' did not forward empty blockTypes')
        equal(JSON.stringify(inputConfig), configBefore, construction + ' mutated caller config')
        let created = 0
        const disposed = []
        const definition = {
          type: 'factory-note',
          render(block) {
            const element = document.createElement('article')
            element.textContent = block.data.text
            element.dataset.instance = String(++created)
            return element
          },
          destroy(element) { disposed.push(element.dataset.instance) },
        }
        if (schema) definition.schema = {
          currentVersion: 1, createDefault: () => ({ text: '' }),
          decode({ dataVersion, data }) {
            if (dataVersion !== 1 || typeof data?.text !== 'string') throw new TypeError('Invalid control payload')
            return { dataVersion: 1, data: { text: data.text } }
          },
          encode(data) { return { dataVersion: 1, data: { text: data.text } } },
        }
        check(renderer.registerRenderer(definition) === renderer, 'Custom registration lost fluent return')
        equal(renderer.getRegisteredTypes(), ['factory-note'], 'Custom registration differs')
        const block = (id, text) => ({ id, type: 'factory-note', ...(schema ? { dataVersion: 1 } : {}), data: { text } })
        const data = { ...(schema ? { version: '2.0.0' } : {}), blocks: [block('a', 'Alpha & β'), block('b', 'Bravo 🌿')] }
        const before = JSON.stringify(data)
        const view = element => ({ className: element.className, children: [...element.children].map(child => ({ tag: child.tagName, id: child.dataset.blockId, type: child.dataset.blockType, text: child.textContent })) })
        const expected = { className: 'editor-content editor-content--light', children: [
          { tag: 'ARTICLE', id: 'a', type: 'factory-note', text: 'Alpha & β' },
          { tag: 'ARTICLE', id: 'b', type: 'factory-note', text: 'Bravo 🌿' },
        ] }
        const single = renderer.renderBlock(block('single', 'Single'))
        equal(single.textContent, 'Single', 'renderBlock output differs')
        const detached = renderer.render(data)
        check(!detached.isConnected, 'render returned mounted output')
        equal(view(detached), expected, 'render config/data output differs')
        const target = document.createElement('section')
        document.body.append(target)
        equal(renderer.renderTo(data, target), undefined, 'renderTo return differs')
        equal(view(target.firstElementChild), expected, 'renderTo output differs')
        equal(JSON.stringify(data), before, 'Rendering changed caller data')
        equal(created, 5, 'Unexpected custom renderer allocation')
        renderer.destroy(single)
        renderer.destroy(detached)
        renderer.destroy(target)
        renderer.destroy(target)
        renderer.destroy()
        equal(target.childNodes.length, 0, 'Target disposal retained output')
        equal(detached.childNodes.length, 0, 'Detached disposal retained output')
        equal(disposed.length, 5, 'Disposal is incomplete or not idempotent')
        const reused = renderer.render(data)
        equal(view(reused), expected, 'Renderer cannot be reused after disposal')
        renderer.destroy()
        equal(created, 7, 'Reuse did not use the same registered renderer')
        equal(disposed.length, created, 'Reuse resource count differs')
        equal(new Set(disposed).size, created, 'One resource disposed more than once')
        target.remove()
        controls.push({ construction, publicInstance: true, samePublicPrototype: true, configUnchanged: true,
          customRegistration: true, output: expected, outputMethods: ['renderBlock', 'render', 'renderTo'],
          exactDisposal: true, reusable: true, created, disposed: disposed.length })
      }
      if (controls.length === 2) equal({ ...controls[0], construction: null }, { ...controls[1], construction: null }, 'Factory and constructor differ')
      return { factoryPresent: factoryExpected, subclassAndOverride: true, controls }
    }, { label: source.label, schema: source.schema })
    results.push({ source: source.label, sha: source.sha, verifiedEntries: source.verifiedEntries, ...result })
    await page.close()
  }
  const normalized = result => ({ ...result.controls[0], construction: null })
  assert.deepEqual(normalized(results[0]), normalized(results[1]))
  assert.deepEqual(normalized(results[0]), normalized(results[2]))
  console.log(JSON.stringify({ scope: 'RENDERER_CONSTRUCTION: real public constructor/factory forwarding controls plus subclass super/override; custom schemas and wire spelling adapted only in test',
    browser: await browser.version(), dependencies: 'shared installed current dependencies; custom renderer only; injectStyles false',
    excludes: ['Full renderer outputs row', 'All built-in renderers', 'Async factory migration', 'Styles/realms/CSP', 'Full library parity'],
    result: 'PASS', results }, null, 2))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
