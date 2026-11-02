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
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const paths = ['scripts/parity/html-responsive-content.mjs', 'shared/embeddedHtml.js',
  'shared/rebaseContentViewport.js', 'shared/contentStyles.js', 'core/createEditorRuntime.js',
  'plugins/raw/index.js', 'plugins/carousel/index.js', 'renderer/EditorRenderer.js',
  'renderer/renderers/raw/index.js', 'renderer/renderers/carousel/index.js',
  'shared/sanitize/sanitizeRawHtml.js', 'shared/sanitize/sanitizeUrl.js',
  'shared/sanitize/trustedHtml.js', 'node_modules/dompurify/dist/purify.es.mjs', 'package-lock.json']
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(resolve(root, path)))])))
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
const startedAt = new Date().toISOString()
const server = await createServer({ root, cacheDir: 'test-results/html-responsive-vite-cache', logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'responsive-reference', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/responsive-reference') { next(); return }
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify")
      response.end('<!doctype html><title>Native responsive CSS reference</title>')
    })
  } }] })
await server.listen()
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const results = [], errors = []
try {
  for (const [type, editing] of [['raw', true], ['raw', false], ['carousel', true], ['carousel', false]]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, colorScheme: 'light' })
    page.on('pageerror', error => errors.push({ type, editing, error: String(error) }))
    await page.goto(server.resolvedUrls.local[0] + 'responsive-reference')
    await page.evaluate(async ({ type, editing }) => {
      const { createEditor } = await import('/core/index.js')
      const { createRawPlugin } = await import('/plugins/raw/index.js')
      const { createCarouselPlugin } = await import('/plugins/carousel/index.js')
      const { EditorRenderer } = await import('/renderer/index.js')
      const { toTrustedHtml } = await import('/shared/sanitize/trustedHtml.js')
      const css = 'html,body{margin:0}body{display:flow-root;font:16px/20px sans-serif}'
        + '#proof{width:10vw;height:10vh;color:rgb(10,20,30);background:rgb(40,50,60);border:1px solid}'
        + '@media(min-width:90vi){#proof{color:rgb(12,84,156)}}'
        + '@media(min-width:90vi){@supports(display:grid){@media(prefers-color-scheme:dark){#proof{background:rgb(90,80,70)}}}}'
        + '@media(prefers-color-scheme:dark){#proof{border-width:7px}}'
      const html = '<div id="proof">Responsive content</div>'
      const reference = document.createElement('section'), holder = document.createElement('section')
      holder.style.width = '600px'; reference.innerHTML = toTrustedHtml(html)
      document.body.append(reference, holder)
      const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [sheet]
      const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1,
        data: type === 'raw' ? { html } : { slides: [{ id: 'html', type: 'html', html, caption: '' }],
          options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
      let editor, renderer
      if (editing) editor = createEditor({ holder, readOnly: true, injectStyles: false, contentStyles: [css], data,
        plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })] })
      else { renderer = new EditorRenderer({ blockTypes: [type], injectStyles: false, contentStyles: [css] }); renderer.renderTo(data, holder) }
      const frame = holder.querySelector('iframe'), deadline = performance.now() + 3000
      while (!frame.contentDocument?.querySelector('#proof')) {
        if (performance.now() > deadline) throw Error('Owned content never became available')
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      const read = element => {
        const style = element.ownerDocument.defaultView.getComputedStyle(element)
        return Object.fromEntries(['width', 'height', 'color', 'backgroundColor', 'borderTopWidth'].map(key => [key, style[key]]))
      }
      window.responsiveProbe = {
        read: () => ({ expected: read(reference.querySelector('#proof')), actual: read(frame.contentDocument.querySelector('#proof')) }),
        destroy() {
          if (editor) {
            const saved = editor.save()
            if (JSON.stringify({ version: saved.version, blocks: saved.blocks }) !== JSON.stringify(data)) throw Error('Presentation rewrote author data')
          }
          editor?.destroy(); renderer?.destroy(); reference.remove(); holder.remove(); document.adoptedStyleSheets = []
        },
      }
    }, { type, editing })
    for (const [width, height, colorScheme] of [[1100, 800, 'light'], [1100, 800, 'dark'],
      [1100, 800, 'light'], [800, 1100, 'light'], [1400, 650, 'dark']]) {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme })
      await page.waitForTimeout(120)
      const observation = await page.evaluate(() => window.responsiveProbe.read())
      let failure = null
      try { assert.deepEqual(observation.actual, observation.expected) } catch (error) { failure = String(error) }
      results.push({ type, editing, width, height, colorScheme, ...observation, status: failure ? 'FAIL' : 'PASS', failure })
    }
    await page.evaluate(() => window.responsiveProbe.destroy()); await page.close()
  }
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(digest(await readFile(resolve(root, path))), expected, 'Source changed: ' + path)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), head, 'HEAD changed')
  const candidatePass = results.length === 20 && results.every(result => result.status === 'PASS') && errors.length === 0
  console.log(JSON.stringify({ scope: 'Four public HTML surfaces compared to independent native parent CSS across logical media conditions, nested media/supports, viewport resize and preference changes',
    head, sourceHashes, sourceUnchanged: true, startedAt, finishedAt: new Date().toISOString(), node: process.version,
    browser: browser.version(), candidatePass, errors, results }, null, 2))
  if (!candidatePass) process.exitCode = 1
} finally { await browser.close(); await server.close() }
