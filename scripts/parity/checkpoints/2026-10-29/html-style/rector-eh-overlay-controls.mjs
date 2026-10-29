import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const sources = [
  { name: 'v1', root: '/tmp/rector-v1-5e5c7f8', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340' },
  { name: 'current', root: '/tmp/rector-eh-current-948bc554', sha: '948bc5544dcf57a343733f589883973ec7db6cd7' },
]
const files = ['plugins/raw/index.js', 'plugins/carousel/index.js', 'renderer/renderers/raw/index.js', 'renderer/renderers/carousel/index.js', 'shared/sanitize/sanitizeRawHtml.js', 'shared/sanitize/sanitizeStyle.js', 'shared/sanitize/walker.js']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
for (const source of sources) {
  source.fileHashes = {}
  for (const file of files) {
    const bytes = await readFile(join(source.root, file))
    assert.deepEqual(bytes, execFileSync('git', ['show', `${source.sha}:${file}`], { cwd: repo }))
    source.fileHashes[file] = digest(bytes)
  }
}
const imports = { dompurify: '/node_modules/dompurify/dist/purify.es.mjs' }
for (const name of ['carousel', 'color-picker', 'cropper', 'event-bus', 'expose', 'infinite-scroll', 'masonry']) {
  const id = '@shelamkoff/' + name
  const manifest = JSON.parse(await readFile(join(repo, 'node_modules', id, 'package.json'), 'utf8'))
  const entry = typeof manifest.exports['.'] === 'string' ? manifest.exports['.'] : manifest.exports['.'].import
  imports[id] = '/node_modules/' + id + '/' + entry.replace(/^\.\//, '')
}
const requests = []
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  try {
    if (url.pathname === '/fixture') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports }) + '</script><style>html{font-size:16px}body{margin:0;font:20px sans-serif;color:rgb(18,28,38)}#holder{width:600px;margin:140px 40px 30px;border:2px solid #888}.article-accent{color:rgb(12,84,156);font-size:1.5em}.app-screen-cover{position:fixed;inset:0;z-index:2147483647;background:rgb(240,200,200)}#outside{position:fixed;top:20px;right:20px}</style></head><body><button id="outside">Host action</button><section id="holder"></section></body></html>')
      return
    }
    if (url.pathname === '/destination') {
      requests.push(url.pathname + url.search)
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><title>Permitted destination</title><p>Destination</p>')
      return
    }
    if (url.pathname === '/download.txt') {
      requests.push(url.pathname + url.search)
      response.setHeader('content-type', 'text/plain')
      response.end('Rector controlled download\n')
      return
    }
    if (url.pathname === '/probe.webm') {
      response.setHeader('content-type', 'video/webm')
      response.end(await readFile('/tmp/rector-eh-media.webm'))
      return
    }
    const source = sources.find(value => url.pathname.startsWith('/' + value.name + '/'))
    const relative = source ? url.pathname.slice(source.name.length + 2) : url.pathname.slice(1)
    response.setHeader('content-type', extname(relative) === '.css' ? 'text/css' : 'text/javascript')
    response.end(await readFile(join(source?.root ?? repo, relative)))
  } catch (error) { response.statusCode = 404; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true })
const results = []
const surfaces = ['raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer']
async function mount(source, surface, html) {
  const page = await context.newPage()
  page.setDefaultTimeout(2500)
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(origin + '/fixture')
  await page.evaluate(async ({ version, surface, html }) => {
    window.__hostClicks = 0
    document.querySelector('#outside').addEventListener('click', () => window.__hostClicks++)
    const holder = document.querySelector('#holder')
    const type = surface.startsWith('raw') ? 'raw' : 'carousel'
    const data = type === 'raw' ? { html } : {
      slides: [{ id: 'html-slide', type: 'html', html, caption: '' }],
      options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
    }
    const block = { id: 'probe', type, ...(version === 'current' ? { dataVersion: 1 } : {}), data }
    const documentData = { version: version === 'current' ? '2.0.0' : '1.0.0', blocks: [block] }
    if (surface.endsWith('renderer')) {
      const { EditorRenderer } = await import('/' + version + '/renderer/index.js')
      const renderer = new EditorRenderer({ blockTypes: [type], injectStyles: true })
      renderer.renderTo(documentData, holder)
      window.__owner = renderer
    } else {
      const { createEditor } = await import('/' + version + '/core/index.js')
      const module = await import('/' + version + '/plugins/' + type + '/index.js')
      const plugin = version === 'current'
        ? (type === 'raw' ? module.createRawPlugin : module.createCarouselPlugin)({ injectStyles: true })
        : new (type === 'raw' ? module.Raw : module.CarouselBlock)({ injectStyles: true })
      window.__owner = createEditor({ holder, plugins: [plugin], inlineTools: [], inlinePlugins: [],
        defaultBlock: type, readOnly: true, injectStyles: true, minHeight: 0, data: documentData })
    }
  }, { version: source.name, surface, html })
  await page.waitForTimeout(100)
  let content = page
  if (surface === 'raw-editor') {
    const iframe = page.locator('#holder iframe')
    await iframe.waitFor()
    content = await (await iframe.elementHandle()).contentFrame()
    await content.waitForLoadState('domcontentloaded')
  }
  return { page, content, errors }
}
async function hostHit(page) {
  const box = await page.locator('#outside').boundingBox()
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const element = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 180), point)
  await page.mouse.click(point.x, point.y)
  return { element, clicked: await page.evaluate(() => window.__hostClicks) }
}
const overlay = '<p>Local content</p><div id="attack" style="position:fixed;inset:0;z-index:2147483647;background:rgb(240,200,200)">Foreign full-screen surface</div><script>window.__payloadRan=1</script><img src="/missing.png" onerror="window.__payloadRan=1">'
const popover = '<p>Local content</p><button id="ehtml-trigger" popovertarget="ehtml-popover">Open local detail</button><div id="ehtml-popover" popover style="position:fixed;inset:0;margin:0;width:100vw;height:100vh;border:0;background:rgb(240,200,200)">Escaping native popover</div>'
try {
  for (const source of sources) for (const surface of surfaces) {
    for (const scenario of ['overlay', 'paint-prototype-popover']) {
      let entry
      try {
        entry = await mount(source, surface, scenario === 'overlay' ? overlay : popover)
        if (scenario === 'paint-prototype-popover') {
          await entry.page.evaluate(() => {
            const root = document.querySelector('.editor-raw,.oe-carousel-block__html,.editor-carousel-block__html')
            if (root) { root.style.contain = 'layout paint'; root.style.isolation = 'isolate' }
          })
          await entry.content.locator('#ehtml-trigger').click()
          await entry.page.waitForTimeout(30)
        }
        const hit = await hostHit(entry.page)
        const markup = await entry.content.evaluate(() => ({
          activeMarkup: !!document.querySelector('#holder script,[onerror]'),
          payloadRan: window.__payloadRan ?? 0,
          attackPresent: !!document.querySelector('#attack'),
          attackRect: document.querySelector('#attack')?.getBoundingClientRect().toJSON() ?? null,
          popoverOpen: !!document.querySelector('#ehtml-popover:popover-open'),
          popoverAttribute: document.querySelector('#ehtml-popover')?.getAttribute('popover') ?? null,
        }))
        results.push({ source: source.name, surface, scenario, status: hit.clicked === 1 && !markup.payloadRan ? 'PASS' : 'FAIL', hit, markup, errors: entry.errors })
      } catch (error) { results.push({ source: source.name, surface, scenario, status: 'ERROR', error: String(error) }) }
      finally { await entry?.page.close() }
    }
  }
  console.log(JSON.stringify({ scope: 'E-HTML decision probe; isolated source archives; injectStyles:true; paint containment is a scratch-only counterexample experiment',
    timestamp: new Date().toISOString(), node: process.version, browser: await browser.version(), scriptSha256: digest(await readFile(new URL(import.meta.url))),
    currentDOMPurify: JSON.parse(await readFile(join(repo, 'node_modules/dompurify/package.json'), 'utf8')).version,
    v1DOMPurify: 'vendored 3.4.12', sources, results }, null, 2))
  if (results.some(value => value.status !== 'PASS')) process.exitCode = 1
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
