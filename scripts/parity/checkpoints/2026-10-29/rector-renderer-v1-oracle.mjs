import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const baseline = '/tmp/rector-v1-5e5c7f8'
const baselineSha = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
const source = await readFile(join(baseline, 'renderer/index.js'))
assert.deepEqual(source, execFileSync('git', ['show', baselineSha + ':renderer/index.js'], { cwd: repo }))
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
    const path = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', /\.m?js$/.test(path) ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html')
    if (path === '/') {
      response.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports }) + '</script><title>Renderer differential oracle</title>')
    } else {
      const root = path.startsWith('/v1/') ? baseline : repo
      const relative = path.replace(/^\/v[12]\//, '/')
      response.end(await readFile(join(root, relative)))
    }
  } catch (error) { response.statusCode = 404; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const results = []
try {
  for (const version of ['v1', 'v2']) {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(async version => {
      const { EditorRenderer } = await import('/' + version + '/renderer/index.js')
      const check = (condition, message) => { if (!condition) throw new Error(message) }
      const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected),
        message + ': ' + JSON.stringify({ actual, expected }))
      const calls = { render: 0, renderTo: 0, renderBlock: 0 }
      class ArticleRenderer extends EditorRenderer {
        constructor() { super({ blockTypes: [], injectStyles: false, theme: 'light' }) }
        getClassPrefix() { return super.getClassPrefix() + '-override' }
        render(data) { calls.render++; return super.render(data) }
        renderTo(data, container) { calls.renderTo++; return super.renderTo(data, container) }
        renderBlock(data) { calls.renderBlock++; return super.renderBlock(data) }
      }
      const renderer = new ArticleRenderer()
      check(renderer instanceof EditorRenderer, 'Public subclass is not an EditorRenderer')
      equal(renderer.getClassPrefix(), 'editor-override', 'Public method override did not dispatch')
      let created = 0
      const disposed = []
      const definition = {
        type: 'oracle-note',
        render(block) {
          const element = document.createElement('article')
          element.className = 'oracle-note'
          element.textContent = block.data.text
          element.dataset.instance = String(++created)
          return element
        },
        destroy(element) { disposed.push(element.dataset.instance) },
      }
      // Test-only adapters: v1 has no data-version schema for custom renderers.
      // Current v2 admits the same payload through its exact current schema.
      if (version === 'v2') definition.schema = {
        currentVersion: 1,
        createDefault: () => ({ text: '' }),
        decode({ dataVersion, data }) {
          if (dataVersion !== 1 || typeof data?.text !== 'string') throw new TypeError('Invalid oracle-note data')
          return { dataVersion: 1, data: { text: data.text } }
        },
        encode(data) {
          if (typeof data?.text !== 'string') throw new TypeError('Invalid oracle-note data')
          return { dataVersion: 1, data: { text: data.text } }
        },
      }
      check(renderer.registerRenderer(definition) === renderer, 'Registration lost fluent return')
      check(renderer.hasRenderer('oracle-note'), 'Custom renderer is not registered')
      equal(renderer.getRegisteredTypes(), ['oracle-note'], 'Unexpected renderer registry')
      const block = (id, text) => ({ id, type: 'oracle-note', ...(version === 'v2' ? { dataVersion: 1 } : {}), data: { text } })
      const documentData = blocks => ({ ...(version === 'v2' ? { version: '2.0.0' } : {}), blocks })
      const data = documentData([block('a', 'Alpha & β'), block('b', 'Bravo 🌿')])
      const unchanged = JSON.stringify(data)
      const surface = wrapper => ({
        className: wrapper.className,
        children: [...wrapper.children].map(element => ({
          tag: element.tagName, className: element.className,
          id: element.dataset.blockId, type: element.dataset.blockType, text: element.textContent,
        })),
      })
      const expected = { className: 'editor-content editor-content--light', children: [
        { tag: 'ARTICLE', className: 'oracle-note', id: 'a', type: 'oracle-note', text: 'Alpha & β' },
        { tag: 'ARTICLE', className: 'oracle-note', id: 'b', type: 'oracle-note', text: 'Bravo 🌿' },
      ] }
      const detached = renderer.render(data)
      const independent = renderer.render(data)
      check(!detached.isConnected && detached !== independent, 'render must return independent detached output')
      check(detached.firstChild !== independent.firstChild, 'Two detached renders shared a block occurrence')
      equal(surface(detached), expected, 'Detached rendering changed authored output')
      equal(surface(independent), expected, 'Second detached rendering changed authored output')
      const target = document.createElement('section')
      document.body.append(target)
      equal(renderer.renderTo(data, target), undefined, 'renderTo return value changed')
      const mounted = target.firstElementChild
      equal(surface(mounted), expected, 'renderTo differs from render')
      const first = mounted.firstElementChild, second = mounted.lastElementChild
      renderer.renderTo(data, target)
      check(target.firstElementChild === mounted && mounted.firstElementChild === first && mounted.lastElementChild === second,
        'Unchanged incremental output replaced its occurrence')
      equal(created, 6, 'Unchanged renderTo allocated extra blocks')
      const changed = documentData([block('a', 'Alpha & β'), block('b', 'Changed 🌿')])
      renderer.renderTo(changed, target)
      check(mounted.firstElementChild === first && mounted.lastElementChild !== second, 'Changed renderTo did not isolate the changed block')
      equal(disposed, [second.dataset.instance], 'Changed renderTo disposed an unrelated occurrence')
      equal(surface(detached), expected, 'Mounted update changed detached output')
      equal(JSON.stringify(data), unchanged, 'Rendering mutated the caller document')
      renderer.destroy(target)
      equal(target.childNodes.length, 0, 'Targeted disposal left mounted output')
      equal(disposed.length, 3, 'Targeted disposal did not release exactly its two current occurrences')
      renderer.destroy(target)
      equal(disposed.length, 3, 'Targeted disposal was not idempotent')
      renderer.renderTo(data, target)
      equal(surface(target.firstElementChild), expected, 'Renderer cannot be reused after target disposal')
      const single = renderer.renderBlock(block('single', 'Single'))
      equal(single.textContent, 'Single', 'Direct renderBlock override lost output')
      renderer.destroy(single)
      equal(single.childNodes.length, 0, 'Direct block disposal did not clear its output')
      renderer.destroy(single)
      equal(disposed.length, 4, 'Direct block resources were disposed more than once')
      renderer.destroy(detached)
      equal(detached.childNodes.length, 0, 'Detached document disposal did not clear its output')
      renderer.destroy(detached)
      equal(disposed.length, 6, 'Detached document resources were disposed more than once')
      renderer.destroy()
      equal(target.childNodes.length, 0, 'Global disposal retained a mounted output')
      equal(independent.childNodes.length, 0, 'Global disposal retained a detached output')
      equal(disposed.length, created, 'Global disposal lost an output resource')
      const afterGlobal = renderer.render(data)
      equal(surface(afterGlobal), expected, 'Renderer cannot be reused after global disposal')
      renderer.destroy()
      equal(afterGlobal.childNodes.length, 0, 'Reused renderer output did not dispose')
      equal(new Set(disposed).size, created, 'Some output occurrence was disposed twice')
      equal(disposed.length, created, 'Some output occurrence was never disposed')
      equal(calls, { render: 3, renderTo: 4, renderBlock: 1 }, 'Public subclass overrides did not run exactly once per direct call')
      target.remove()
      return {
        checks: { subclass: true, publicOverrides: true, customRegistration: true,
          detachedRender: true, renderToEquivalent: true, incrementalReuse: true,
          changedBlockIsolation: true, callerDataUnchanged: true,
          targetDisposal: true, detachedDisposal: true, directBlockDisposal: true,
          disposalIdempotence: true, reusableAfterTargetDisposal: true, reusableAfterGlobalDisposal: true },
        calls, created, disposed: disposed.length, output: expected,
      }
    }, version)
    results.push({ version, ...result })
    await page.close()
  }
  assert.deepEqual(results[0].checks, results[1].checks)
  assert.deepEqual(results[0].output, results[1].output)
  assert.deepEqual(results[0].calls, results[1].calls)
  assert.equal(results[0].created, results[1].created)
  assert.equal(results[0].disposed, results[1].disposed)
  console.log(JSON.stringify({ baselineSha,
    verifiedBaselineRendererSha256: createHash('sha256').update(source).digest('hex'),
    browser: await browser.version(), boundary: 'Unmodified source public EditorRenderer in real DOM; document/schema adapters only in this oracle',
    excludes: ['Built-in renderer feature inventory', 'Legacy document migration', 'Factory and async alias compatibility', 'Cross-realm/CSP/style acquisition'],
    parity: 'PASS', results }, null, 2))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
