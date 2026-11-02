// Actual public editor/renderer versus a bare native glyph. No source transforms.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(process.env.EDITOR_GLYPH_RESULTS_DIR ?? 'test-results/inline-content-glyph')
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const git = (...args) => execFileSync('git', args, { cwd: repo })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const source = () => ({ head: git('rev-parse', 'HEAD').toString().trim(), patch: digest(git('diff', '--binary', 'HEAD')) })
const before = source(), results = []
const server = await createServer({ root: repo, cacheDir: 'test-results/inline-glyph-vite-cache', logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'native-glyph-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/inline-glyph') { next(); return }
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify")
      response.end('<!doctype html><style>body{margin:0;background:white}#holder{margin:40px 80px;width:600px;font:20px serif}#holder p{margin:0}.article-accent{font:italic 201px serif;color:red}.app-screen-cover{position:fixed;inset:0;z-index:2147483647;background:rgba(200,20,20,.2)}#outside{position:fixed;right:20px;top:10px}</style><button id="outside">Host action</button><div id="holder"></div>')
    })
  } }] })
let browser, nativeGlyph
try {
  await mkdir(output, { recursive: true }); await server.listen()
  browser = await chromium.launch({ headless: true,
    ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}) })
  for (const kind of ['native-benign', 'native-hostile', 'editor', 'renderer']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = []
    page.on('pageerror', error => errors.push(String(error)))
    try {
      await page.goto(server.resolvedUrls.local[0] + 'inline-glyph')
      const view = await page.evaluate(async kind => {
        const holder = document.querySelector('#holder')
        const classes = kind === 'native-benign' ? 'article-accent' : 'article-accent app-screen-cover'
        const html = `<span class="${classes}" style="font-size:201px">j</span> tail`
        const data = { version: '2.0.0', blocks: [{ id: 'p', type: 'paragraph', dataVersion: 2, data: { text: html } }] }
        const original = JSON.stringify(data), contentStyles = [':scope{font:20px serif}.article-accent{font:italic 201px serif;color:red}']
        if (kind.startsWith('native-')) {
          const { toTrustedHtml } = await import('/shared/sanitize/trustedHtml.js')
          const p = document.createElement('p'); p.innerHTML = toTrustedHtml(html, document); holder.append(p)
        } else if (kind === 'editor') {
          const [{ createEditor }, { createParagraphPlugin }] = await Promise.all([import('/core/index.js'), import('/plugins/paragraph/index.js')])
          window.owned = createEditor({ holder, data, contentStyles, injectStyles: false, plugins: [createParagraphPlugin({ injectStyles: false })] })
        } else {
          const { EditorRenderer } = await import('/renderer/index.js')
          window.owned = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false, contentStyles }); window.owned.renderTo(data, holder)
        }
        window.clicks = 0; window.trusted = false
        document.querySelector('#outside').addEventListener('click', event => { window.clicks++; window.trusted = event.isTrusted })
        await document.fonts.ready
        const span = holder.querySelector('span'), css = getComputedStyle(span)
        return { position: css.position, fontSize: css.fontSize, fontStyle: css.fontStyle, color: css.color,
          classValue: span.getAttribute('class'), inputUnchanged: JSON.stringify(data) === original }
      }, kind)
      const glyph = await page.screenshot({ clip: { x: 50, y: 40, width: 700, height: 260 }, caret: 'hide' })
      await writeFile(resolve(output, kind + '.png'), glyph)
      if (kind === 'native-benign') nativeGlyph = glyph
      await page.locator('#outside').click({ force: true })
      const host = await page.evaluate(() => ({ clicks: window.clicks, trusted: window.trusted }))
      assert.equal(view.fontSize, '201px'); assert.equal(view.fontStyle, 'italic'); assert.equal(view.color, 'rgb(255, 0, 0)')
      assert.equal(view.inputUnchanged, true); assert.deepEqual(errors, [])
      if (kind === 'native-hostile') { assert.equal(view.position, 'fixed'); assert.equal(host.clicks, 0) }
      else { assert.equal(view.position, 'static'); assert.equal(host.clicks, 1); assert.equal(host.trusted, true) }
      const sameGlyphPng = kind === 'editor' || kind === 'renderer' ? glyph.equals(nativeGlyph) : null
      if (sameGlyphPng !== null) assert.equal(sameGlyphPng, true, kind + ' clipped or changed the native glyph pixels')
      results.push({ kind, view, host, sameGlyphPng, pngSha256: digest(glyph), errors })
      await page.evaluate(() => window.owned?.destroy())
    } finally { await page.close() }
  }
  assert.deepEqual(source(), before, 'Source changed during glyph comparison')
  console.log(JSON.stringify({ scope: 'Native italic glyph, actual public APIs and hostile-class positive control; no source transforms',
    browser: browser.version(), source: before, results }, null, 2))
} finally { await browser?.close(); await server.close() }
