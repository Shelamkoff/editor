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
  await page.waitForTimeout(150)
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

const observations = []
const localHtml = '<p class="article-accent" id="ehtml-theme">Themed long article</p><video id="ehtml-video" src="/probe.webm" controls muted playsinline style="width:240px;height:135px" aria-label="Local sample video"></video><div style="height:900px">Long content body</div><a id="ehtml-tail" href="#ehtml-theme">Reachable final link</a>'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  for (const source of sources) for (const surface of surfaces) {
    let entry
    try {
      entry = await mount(source, surface, localHtml)
      const { page, content } = entry
      await content.locator('#ehtml-video').waitFor()
      await content.waitForFunction(() => document.querySelector('#ehtml-video').readyState >= 2, { timeout: 3000 })
      const before = await content.evaluate(() => {
        const theme = document.querySelector('#ehtml-theme')
        const video = document.querySelector('#ehtml-video')
        const tail = document.querySelector('#ehtml-tail')
        return { theme: { className: theme.className, color: getComputedStyle(theme).color, fontSize: getComputedStyle(theme).fontSize },
          viewport: { height: innerHeight, width: innerWidth }, documentHeight: document.documentElement.scrollHeight,
          tailTop: tail.getBoundingClientRect().top, media: { controls: video.controls, source: video.currentSrc, readyState: video.readyState, paused: video.paused, ariaLabel: video.getAttribute('aria-label') } }
      })
      const iframe = surface === 'raw-editor' ? await page.locator('#holder iframe').evaluate(frame => ({ height: frame.getBoundingClientRect().height, parentCanRead: frame.contentDocument !== null, sandbox: frame.getAttribute('sandbox'), title: frame.title })) : null
      // Native keyboard activation after a trusted click; no programmatic play().
      await content.locator('#ehtml-video').click({ position: { x: 20, y: 115 } })
      await wait(250)
      const playback = await content.locator('#ehtml-video').evaluate(video => ({ paused: video.paused, currentTime: video.currentTime, error: video.error?.code ?? null }))
      await content.locator('#ehtml-tail').focus()
      const accessibleTail = await content.locator('#ehtml-tail').evaluate(tail => ({ focus: document.activeElement === tail, top: tail.getBoundingClientRect().top, bottom: tail.getBoundingClientRect().bottom, viewport: innerHeight, text: tail.textContent }))
      await page.setViewportSize({ width: 420, height: 800 })
      await page.evaluate(() => document.querySelector('#holder').style.width = 'calc(100vw - 80px)')
      const responsive = await page.evaluate(() => ({ viewport: innerWidth, holder: document.querySelector('#holder').getBoundingClientRect().toJSON(), scrollWidth: document.documentElement.scrollWidth }))
      const hostCssPreserved = before.theme.color === 'rgb(12, 84, 156)'
      const tallNaturalFlow = iframe ? iframe.height >= before.documentHeight - 2 : true
      const actualPlayback = !playback.paused && playback.currentTime > 0
      observations.push({ source: source.name, surface, scenario: 'theme-tall-native-media-accessibility-responsive',
        status: hostCssPreserved && tallNaturalFlow && actualPlayback && accessibleTail.focus && responsive.scrollWidth <= 420 ? 'PASS' : 'FAIL',
        checks: { hostCssPreserved, tallNaturalFlow, actualPlayback, tailFocusable: accessibleTail.focus, noNarrowOverflow: responsive.scrollWidth <= 420 }, before, iframe, playback, accessibleTail, responsive, errors: entry.errors })
    } catch (error) { observations.push({ source: source.name, surface, scenario: 'theme-tall-native-media-accessibility-responsive', status: 'ERROR', error: String(error) }) }
    finally { await entry?.page.close() }
    for (const scenario of ['fragment', 'download', 'named-window']) {
      entry = undefined
      const opened = []
      try {
        const html = scenario === 'fragment'
          ? '<a id="ehtml-link" href="#ehtml-anchor">Read local section</a><div style="height:900px">Long article</div><h2 id="ehtml-anchor">Local section</h2>'
          : scenario === 'download'
            ? '<a id="ehtml-link" href="/download.txt" download="rector-sample.txt">Download local sample</a>'
            : '<a id="ehtml-link" href="/destination?from=named-link" target="rector-report-window">Open named report</a>'
        entry = await mount(source, surface, html)
        const { page, content } = entry
        const downloads = []
        page.on('download', download => downloads.push(download))
        page.on('popup', popup => opened.push(popup))
        let namedWindow = null
        if (scenario === 'named-window') {
          await page.evaluate(() => {
            const opener = document.createElement('button')
            opener.id = 'ehtml-host-opener'; opener.textContent = 'Open report window'; opener.style.cssText = 'position:fixed;top:20px;left:20px'
            opener.addEventListener('click', () => window.open('/destination?initial=1', 'rector-report-window'))
            document.body.appendChild(opener)
          })
          const popup = page.waitForEvent('popup')
          await page.locator('#ehtml-host-opener').click()
          namedWindow = await popup
          await namedWindow.waitForLoadState('domcontentloaded')
        }
        const attrs = await content.locator('#ehtml-link').evaluate(link => ({ href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel'), download: link.getAttribute('download') }))
        const start = requests.length
        const previousMainUrl = page.url()
        const previousContentUrl = content.url()
        const clickFacts = []
        page.on('console', message => { if (message.type() === 'error') clickFacts.push(message.text()) })
        await content.locator('#ehtml-link').click()
        await wait(300)
        const after = { mainUrl: page.url(), contentUrl: content.url(), previousMainUrl, previousContentUrl,
          originalLinkStillPresent: await content.locator('#ehtml-link').count(), localAnchorStillPresent: await content.locator('#ehtml-anchor').count(),
          opened: opened.map(popup => ({ url: popup.url(), originalNamedWindow: popup === namedWindow })),
          namedWindowUrl: namedWindow?.url() ?? null,
          downloads: downloads.map(download => download.suggestedFilename()), requests: requests.slice(start), browserErrors: clickFacts }
        const okay = scenario === 'fragment' ? after.localAnchorStillPresent === 1 && after.contentUrl.endsWith('#ehtml-anchor')
          : scenario === 'download' ? after.downloads.includes('rector-sample.txt') && after.originalLinkStillPresent === 1
          : attrs.target === 'rector-report-window' && after.originalLinkStillPresent === 1 && after.opened.some(popup => popup.url.includes('from=named-link'))
        observations.push({ source: source.name, surface, scenario, status: okay ? 'PASS' : 'FAIL', attrs, after, errors: entry.errors })
      } catch (error) { observations.push({ source: source.name, surface, scenario, status: 'ERROR', error: String(error) }) }
      finally { for (const popup of opened) await popup.close(); await entry?.page.close() }
    }
  }
  console.log(JSON.stringify({ scope: 'E-HTML bounded positive controls on immutable archives; trusted pointer activation; native media play not scripted; no production edits; no acceptance of a candidate topology',
    timestamp: new Date().toISOString(), node: process.version, browser: await browser.version(), scriptSha256: digest(await readFile(new URL(import.meta.url))),
    currentDOMPurify: JSON.parse(await readFile(join(repo, 'node_modules/dompurify/package.json'), 'utf8')).version,
    v1DOMPurify: 'vendored 3.4.12', sources, observations }, null, 2))
  if (observations.some(value => value.status !== 'PASS')) process.exitCode = 1
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
