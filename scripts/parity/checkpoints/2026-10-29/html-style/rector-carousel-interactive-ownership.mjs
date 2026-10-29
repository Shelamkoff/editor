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
sources.push({name: 'current-no-swipe', root: sources[1].root, sha: sources[1].sha})
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
    let bytes = await readFile(join(source?.root ?? repo, relative))
    if (source?.name === 'current-no-swipe' && relative === 'renderer/renderers/carousel/index.js') {
      const original = bytes.toString()
      const needle = "const plugins = [createKeyboard({ scope: 'container' }), createSwipe({ mouse: true })]"
      assert.equal(original.split(needle).length, 2)
      bytes = Buffer.from(original.replace(needle, "const plugins = [createKeyboard({ scope: 'container' })]"))
    }
    response.end(bytes)
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
    const block = { id: 'probe', type, ...(version !== 'v1' ? { dataVersion: 1 } : {}), data }
    const documentData = { version: version !== 'v1' ? '2.0.0' : '1.0.0', blocks: [block] }
    if (surface.endsWith('renderer')) {
      const { EditorRenderer } = await import('/' + version + '/renderer/index.js')
      const renderer = new EditorRenderer({ blockTypes: [type], injectStyles: true })
      renderer.renderTo(documentData, holder)
      window.__owner = renderer
    } else {
      const { createEditor } = await import('/' + version + '/core/index.js')
      const module = await import('/' + version + '/plugins/' + type + '/index.js')
      const plugin = version !== 'v1'
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

const observations=[]
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try {
  for(const source of sources) for(const scenario of ['fragment','download','native-popover','native-video-keyboard']) {
    let entry
    try {
      const html=scenario==='fragment'?'<a id="ehtml-action" href="#ehtml-destination">Read local content</a><div style="height:900px">Long body</div><h2 id="ehtml-destination">Local destination</h2>'
        :scenario==='download'?'<a id="ehtml-action" href="/download.txt" download="local-proof.txt">Download proof</a>'
        :scenario==='native-popover'?'<button id="ehtml-action" popovertarget="ehtml-details">Open details</button><div id="ehtml-details" popover>Small local detail</div>'
        :'<video id="ehtml-action" controls muted playsinline src="/probe.webm" style="width:480px;height:270px" aria-label="Local sample video"></video>'
      entry=await mount(source,'carousel-renderer',html)
      const {page}=entry
      const downloads=[];page.on('download',download=>downloads.push(download))
      await page.evaluate(()=>{
        window.__inputEvents=[]
        for(const type of ['pointerdown','gotpointercapture','pointerup','lostpointercapture','click','keydown'])document.addEventListener(type,event=>{
          window.__inputEvents.push({type:event.type,target:event.target.id||event.target.className||event.target.nodeName,isTrusted:event.isTrusted,defaultPrevented:event.defaultPrevented,key:event.key??null})
        },true)
      })
      if(scenario==='native-video-keyboard') {
        await page.waitForFunction(()=>document.querySelector('#ehtml-action').readyState>=2)
        await page.locator('#ehtml-action').press('Space')
      } else await page.locator('#ehtml-action').click()
      await wait(250)
      const actual=await page.evaluate(()=>({url:location.href,events:window.__inputEvents,popoverOpen:!!document.querySelector('#ehtml-details:popover-open'),media:document.querySelector('video')?{paused:document.querySelector('video').paused,currentTime:document.querySelector('video').currentTime}:null,linkPresent:!!document.querySelector('#ehtml-action')}))
      actual.downloads=downloads.map(value=>value.suggestedFilename())
      const pass=scenario==='fragment'?actual.url.endsWith('#ehtml-destination')
        :scenario==='download'?actual.downloads.includes('local-proof.txt')
        :scenario==='native-popover'?actual.popoverOpen
        :!actual.media.paused&&actual.media.currentTime>0
      observations.push({source:source.name,scenario,status:pass?'PASS':'FAIL',actual,errors:entry.errors})
    }catch(error){observations.push({source:source.name,scenario,status:'ERROR',error:String(error)})}
    finally{await entry?.page.close()}
  }
  console.log(JSON.stringify({scope:'Diagnostic only: actual v1/current public Carousel renderer versus an isolated current archive transform omitting createSwipe installation. No repository edits and no proposed production removal of swipe. Native trusted input event traces.',timestamp:new Date().toISOString(),node:process.version,browser:await browser.version(),scriptSha256:digest(await readFile(new URL(import.meta.url))),dependencySwipeSha256:digest(await readFile(join(repo,'node_modules/@shelamkoff/carousel/dist/src/plugins/swipe.js'))),sources,observations},null,2))
  if(observations.some(result=>result.status!=='PASS'))process.exitCode=1
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
