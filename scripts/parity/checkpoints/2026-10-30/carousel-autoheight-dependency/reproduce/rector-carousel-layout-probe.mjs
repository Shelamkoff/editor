import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = process.argv[2]
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const { createServer } = await import(pathToFileURL(join(repo, 'node_modules/vite/dist/node/index.js')).href)
const files = ['renderer/renderers/carousel/index.js', 'renderer/renderers/carousel/styles.css',
  'node_modules/@shelamkoff/carousel/package.json', 'node_modules/@shelamkoff/carousel/dist/src/TrackRenderer.js',
  'node_modules/@shelamkoff/carousel/dist/src/Carousel.js', 'node_modules/@shelamkoff/carousel/dist/styles/carousel.css']
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async path => [path, digest(await readFile(join(repo, path)))])))
const before = await hashes(), startedAt = new Date().toISOString()
const server = await createServer({ root: repo, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'local-layout-probe', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/__carousel_layout_probe__') return next()
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
    })
  } }],
})
let browser
const results = []
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ executablePath: process.env.EDITOR_CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const mode of ['rector-detached', 'upstream-detached', 'upstream-mounted']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }), pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error.stack ?? error)))
    await page.goto(origin + '/__carousel_layout_probe__')
    const result = await page.evaluate(async mode => {
      const { Carousel, carouselStylesUrl } = await import('/node_modules/@shelamkoff/carousel/dist/src/index.js')
      const { EditorRenderer } = await import('/renderer/index.js')
      const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
      const errors = [], frames = [], mutations = []
      let phase = 'setup'
      window.addEventListener('error', event => errors.push({ phase, message: event.message, stack: event.error?.stack }))
      window.addEventListener('unhandledrejection', event => errors.push({ phase, message: String(event.reason) }))
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = carouselStylesUrl; document.head.append(link)
      await new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject })
      const container = document.createElement('section'); container.style.width = '640px'
      const measure = label => {
        const viewport = container.querySelector('.carousel__viewport')
        const slide = container.querySelector('.carousel__slide')
        return { label, viewport: viewport ? { width: viewport.offsetWidth, height: viewport.offsetHeight } : null,
          slide: slide ? { width: slide.offsetWidth, height: slide.offsetHeight, style: slide.getAttribute('style') } : null }
      }
      const observer = new MutationObserver(records => {
        for (const record of records) if (record.type === 'attributes' && record.attributeName === 'style'
          && record.target.classList.contains('carousel__slide')) mutations.push({ phase, oldValue: record.oldValue, ...measure('style-mutation') })
      })
      observer.observe(container, { subtree: true, attributes: true, attributeOldValue: true })
      let dispose
      if (mode === 'upstream-mounted') document.body.append(container)
      phase = 'construct'
      if (mode === 'rector-detached') {
        const renderer = new EditorRenderer({ blockTypes: ['carousel'], injectStyles: true })
        const styles = renderer.injectStyles()
        while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(item => !item.sheet)) await new Promise(resolve => setTimeout(resolve, 10))
        const output = renderer.render({ version: '2.0.0', blocks: [{ id: 'probe', type: 'carousel', dataVersion: 1, data: {
          slides: ['Alpha', 'Bravo'].map((caption, index) => ({ id: 'slide-' + index, type: 'image', src: pixel, alt: caption, caption })),
          options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
        } }] })
        container.append(output)
        dispose = () => { renderer.destroy(output); renderer.destroy(); styles.destroy() }
      } else {
        const slides = ['Alpha', 'Bravo'].map(caption => ({ content: () => {
          const figure = document.createElement('figure'); figure.style.margin = '0'
          const image = document.createElement('img'); image.src = pixel; image.style.cssText = 'display:block;width:100%;height:auto'
          const label = document.createElement('figcaption'); label.textContent = caption
          figure.append(image, label); return figure
        } }))
        const carousel = new Carousel(container, slides, { loop: false })
        dispose = () => carousel.destroy()
      }
      frames.push(measure('constructed'))
      phase = 'attach'; if (!container.isConnected) document.body.append(container)
      for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); frames.push(measure('attach-frame-' + i)) }
      phase = 'resize'; container.style.width = '320px'
      for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); frames.push(measure('resize-frame-' + i)) }
      phase = 'dispose'; dispose(); observer.disconnect(); container.remove(); link.remove()
      await new Promise(requestAnimationFrame)
      return { mode, errors, frames, mutations }
    }, mode)
    results.push({ ...result, pageErrors })
    await page.close()
  }
  const after = await hashes(); assert.deepEqual(after, before)
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), runnerSha256: digest(await readFile(new URL(import.meta.url))), before, after, results }, null, 2))
  if (results.some(result => result.errors.length || result.pageErrors.length)) process.exitCode = 1
} finally { await browser?.close(); await server.close() }
