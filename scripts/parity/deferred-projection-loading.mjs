import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { findChrome } from '../../tests/browser/environment.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const paths = ['scripts/parity/deferred-projection-loading.mjs', 'shared/embeddedHtml.js',
  'shared/embeddedHtmlDocument.js', 'shared/rebaseContentViewport.js', 'shared/galleryMasonry.js',
  'shared/sanitize/sanitizeRawHtml.js', 'plugins/gallery/index.js', 'plugins/gallery/uploader.js',
  'plugins/raw/index.js', 'plugins/carousel/index.js', 'renderer/EditorRenderer.js', 'package-lock.json']
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(resolve(root, path)))])))
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
const startedAt = new Date().toISOString(), results = [], errors = []
const server = await createServer({ root, cacheDir: 'test-results/deferred-projection-cache', logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'deferred-projection-reference', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/deferred-projection-reference') { next(); return }
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify")
      response.end('<!doctype html><title>Deferred projection ownership</title>')
    })
  } }] })
await server.listen()
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })

// Hold the real module response, rather than adding a loader hook to production.
async function heldPage(modulePath) {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  let release, requested
  const gate = new Promise(resolve => { release = resolve })
  const request = new Promise(resolve => { requested = resolve })
  await page.route('**/' + modulePath, async route => {
    requested()
    const action = await gate
    if (action === 'fail') await route.abort('failed')
    else await route.continue()
  })
  await page.goto(server.resolvedUrls.local[0] + 'deferred-projection-reference')
  return { page, release, request }
}

try {
  for (const [type, editing] of [['raw', true], ['raw', false], ['carousel', true], ['carousel', false]]) {
    for (const action of ['live', 'destroy', 'replace', 'remove-reappend', 'adopt', 'navigate', 'fail']) {
      const { page, release, request } = await heldPage('shared/embeddedHtmlDocument.js')
      try {
        await page.evaluate(async ({ type, editing }) => {
          const { createEditor } = await import('/core/index.js')
          const { EditorRenderer } = await import('/renderer/index.js')
          const { createRawPlugin } = await import('/plugins/raw/index.js')
          const { createCarouselPlugin } = await import('/plugins/carousel/index.js')
          const html = '<p id="proof">Owned content</p>'
          const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1,
            data: type === 'raw' ? { html } : { slides: [{ id: 'html', type: 'html', html, caption: '' }],
              options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
          const holder = document.createElement('section'); document.body.append(holder)
          let editor, renderer
          if (editing) editor = createEditor({ holder, data, readOnly: true, injectStyles: false,
            plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })] })
          else { renderer = new EditorRenderer({ blockTypes: [type], injectStyles: false }); renderer.renderTo(data, holder) }
          const frame = holder.querySelector('iframe')
          if (!frame || !frame.isConnected) throw Error('The synchronous output did not contain its frame')
          let childAcquisitions = 0, localErrors = 0
          const Observer = window.ResizeObserver
          window.ResizeObserver = class extends Observer {
            observe(target, ...args) { if (target.ownerDocument !== document) childAcquisitions++; return super.observe(target, ...args) }
          }
          frame.addEventListener('error', () => localErrors++)
          window.probe = { frame, holder, data, destroy: () => { editor?.destroy(); renderer?.destroy() },
            acquisitions: () => childAcquisitions, errors: () => localErrors,
            save: () => editor ? editor.save().blocks : data.blocks }
        }, { type, editing })
        await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(Error('Deferred module was not requested')), 5000))])
        await page.evaluate(async action => {
          const p = window.probe
          p.first = p.frame.contentDocument
          if (p.first.querySelector('#proof') || p.acquisitions()) throw Error('Content initialized before module delivery')
          if (action === 'destroy') { p.retiredSave = p.save(); p.destroy() }
          if (action === 'replace') {
            p.foreign = document.createElement('button'); p.foreign.textContent = 'Successor'
            p.frame.parentNode.replaceChildren(p.foreign)
          }
          if (action === 'remove-reappend') { const parent = p.frame.parentNode; p.frame.remove(); parent.append(p.frame) }
          if (action === 'adopt') {
            const foreignFrame = document.createElement('iframe'); document.body.append(foreignFrame)
            p.foreignParent = foreignFrame.contentDocument.body
            p.foreignParent.append(p.frame)
          }
          if (action === 'navigate') {
            const { toTrustedHtml } = await import('/shared/sanitize/trustedHtml.js')
            p.frame.srcdoc = toTrustedHtml('<!doctype html><p id="foreign">Replacement document</p>')
          }
        }, action)
        if (['remove-reappend', 'adopt', 'navigate'].includes(action)) await page.waitForTimeout(40)
        release(action === 'fail' ? 'fail' : 'load')
        if (action === 'live') await page.waitForFunction(() => window.probe.frame.contentDocument?.querySelector('#proof'))
        else await page.waitForTimeout(180)
        const observation = await page.evaluate(action => {
          const p = window.probe
          const result = { authorUnchanged: JSON.stringify(p.retiredSave ?? p.save()) === JSON.stringify(p.data.blocks),
            firstWritten: !!p.first.querySelector('#proof'), acquisitions: p.acquisitions(), errors: p.errors(),
            connected: p.frame.isConnected, successorPreserved: !p.foreign || p.foreign.isConnected,
            foreignPlacementPreserved: !p.foreignParent || p.frame.parentNode === p.foreignParent }
          p.destroy()
          return result
        }, action)
        assert.equal(observation.authorUnchanged, true)
        assert.equal(observation.firstWritten, action === 'live')
        assert.equal(observation.acquisitions, action === 'live' ? 1 : 0)
        assert.equal(observation.errors, action === 'fail' ? 1 : 0)
        assert.equal(observation.successorPreserved, true)
        assert.equal(observation.foreignPlacementPreserved, true)
        if (action !== 'adopt') assert.equal(observation.connected, action === 'live')
        results.push({ type, editing, action, observation, status: 'PASS' })
      } finally { release('load'); await page.close() }
    }
  }
  for (const action of ['live', 'destroy', 'fail']) {
    const { page, release, request } = await heldPage('shared/galleryMasonry.js')
    try {
      await page.evaluate(async () => {
        const { createEditor } = await import('/core/index.js')
        const { createGalleryPlugin } = await import('/plugins/gallery/index.js')
        const holder = document.createElement('section'); document.body.append(holder)
        const editor = createEditor({ holder, plugins: [createGalleryPlugin()], data: { version: '2.0.0', blocks: [{
          id: 'gallery', type: 'gallery', dataVersion: 2, data: { images: [
            { id: 'one', url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', caption: 'One' },
          ], layout: 'masonry', styles: {}, options: {} },
        }] } })
        const grid = holder.querySelector('.eg--masonry'), image = grid.querySelector('img')
        window.probe = { editor, grid, image, before: JSON.stringify(editor.save().blocks),
          destroy: () => editor.destroy() }
      })
      await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(Error('Masonry module was not requested')), 5000))])
      if (action === 'destroy') await page.evaluate(() => window.probe.destroy())
      release(action === 'fail' ? 'fail' : 'load')
      if (action === 'live') await page.waitForFunction(() => window.probe.grid.querySelector('[data-masonry-id]'))
      else await page.waitForTimeout(180)
      const observation = await page.evaluate(action => {
        const p = window.probe
        const result = { imagePreserved: p.image === p.grid.querySelector('img'),
          fallback: p.grid.classList.contains('eg--masonry-fallback'),
          mounted: !!p.grid.querySelector('[data-masonry-id]'),
          authorUnchanged: action === 'destroy' || p.before === JSON.stringify(p.editor.save().blocks) }
        p.destroy(); return result
      }, action)
      assert.equal(observation.imagePreserved, true)
      assert.equal(observation.authorUnchanged, true)
      assert.equal(observation.mounted, action === 'live')
      assert.equal(observation.fallback, action === 'fail')
      results.push({ type: 'gallery', action, observation, status: 'PASS' })
    } finally { release('load'); await page.close() }
  }
  for (const mode of ['remote', 'data']) for (const action of ['live', 'destroy', 'fail']) {
    const { page, release, request } = await heldPage('plugins/gallery/uploader.js')
    try {
      await page.evaluate(async mode => {
        const { createEditor } = await import('/core/index.js')
        const { createGalleryPlugin } = await import('/plugins/gallery/index.js')
        const holder = document.createElement('section'); document.body.append(holder)
        let calls = 0, readers = 0
        const Reader = window.FileReader
        window.FileReader = class extends Reader { constructor() { super(); readers++ } }
        const config = mode === 'remote' ? { uploadFile: async () => {
          calls++; return { url: '/remote-upload.gif', alt: 'Uploaded caption' }
        } } : {}
        const editor = createEditor({ holder, plugins: [createGalleryPlugin(config)], data: {
          version: '2.0.0', blocks: [{ id: 'gallery', type: 'gallery', dataVersion: 2,
            data: { images: [], layout: 'auto', styles: {}, options: {} } }],
        } })
        window.probe = { editor, holder, wrapper: holder.querySelector('.oe-gallery'),
          counts: () => ({ calls, readers }), destroy: () => editor.destroy() }
      }, mode)
      const chosen = page.waitForEvent('filechooser')
      await page.locator('.oe-gallery__select-link').first().click()
      await (await chosen).setFiles({ name: 'one.gif', mimeType: 'image/gif',
        buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') })
      await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(Error('Uploader module was not requested')), 5000))])
      assert.deepEqual(await page.evaluate(() => window.probe.counts()), { calls: 0, readers: 0 })
      if (action === 'destroy') await page.evaluate(() => window.probe.destroy())
      release(action === 'fail' ? 'fail' : 'load')
      if (action === 'live') await page.waitForFunction(() => window.probe.editor.save().blocks[0].data.images.length === 1)
      else await page.waitForTimeout(180)
      const observation = await page.evaluate(action => {
        const p = window.probe
        const result = { ...p.counts(), loading: p.wrapper.classList.contains('oe-gallery--loading'),
          images: action === 'destroy' ? [] : p.editor.save().blocks[0].data.images }
        p.destroy(); return result
      }, action)
      assert.equal(observation.calls, action === 'live' && mode === 'remote' ? 1 : 0)
      assert.equal(observation.readers, action === 'live' && mode === 'data' ? 1 : 0)
      assert.equal(observation.loading, false)
      assert.equal(observation.images.length, action === 'live' ? 1 : 0)
      if (action === 'live') {
        assert.equal(observation.images[0].caption, mode === 'remote' ? 'Uploaded caption' : '')
        assert.ok(observation.images[0].url.startsWith(mode === 'remote' ? '/remote-upload.gif' : 'data:image/gif;base64,'))
      }
      results.push({ type: 'gallery-upload', mode, action, observation, status: 'PASS' })
    } finally { release('load'); await page.close() }
  }
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile(resolve(root, path))), expected, 'Source changed: ' + path)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), head)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ head, sourceHashes, sourceUnchanged: true, startedAt, finishedAt: new Date().toISOString(),
    browser: browser.version(), candidatePass: true, results, errors }, null, 2))
} finally { await browser.close(); await server.close() }
