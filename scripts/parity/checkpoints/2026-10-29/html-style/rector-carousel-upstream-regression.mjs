import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const sources = ['published','upstream','deferred'].map(name=>({name,root:'/tmp/rector-eh-current-948bc554',sha:'948bc5544dcf57a343733f589883973ec7db6cd7'}))
const upstream = '/tmp/rector-carousel-upstream-9896ddf6'

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
      const dependency = url.searchParams.get('library') ?? 'published'
      const map = { ...imports, '@shelamkoff/carousel': '/dependency-' + dependency + '/src/index.js' }
      response.end('<!doctype html><html><head><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports: map }) + '</script><style>html{font-size:16px}body{margin:0;font:20px sans-serif;color:rgb(18,28,38)}#holder{width:600px;margin:140px 40px 30px;border:2px solid #888}.article-accent{color:rgb(12,84,156);font-size:1.5em}.app-screen-cover{position:fixed;inset:0;z-index:2147483647;background:rgb(240,200,200)}#outside{position:fixed;top:20px;right:20px}</style></head><body><button id="outside">Host action</button><section id="holder"></section></body></html>')
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
    if (url.pathname.startsWith('/dependency-')) {
      const [,dependency,...parts] = url.pathname.split('/')
      const kind = dependency.slice('dependency-'.length)
      const relative = parts.join('/')
      const root = kind === 'published' ? join(repo,'node_modules/@shelamkoff/carousel/dist') : upstream
      const bytes = kind === 'deferred' && relative === 'src/plugins/swipe.js' ? await readFile('/tmp/rector-carousel-deferred-capture.js') : await readFile(join(root,relative))
      response.setHeader('content-type',relative.endsWith('.css')?'text/css':'text/javascript')
      response.end(bytes);return
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
  await page.goto(origin + '/fixture?library=' + source.name)
  await page.evaluate(async ({ version, surface, html }) => {
    window.__hostClicks = 0
    document.querySelector('#outside').addEventListener('click', () => window.__hostClicks++)
    const holder = document.querySelector('#holder')
    const type = surface.startsWith('raw') ? 'raw' : 'carousel'
    const data = type === 'raw' ? { html } : {
      slides: [{ id: 'html-slide', type: 'html', html, caption: '' }, { id:'second-slide',type:'html',html:'<div style="height:300px">Second plain slide</div>',caption:'' }],
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
const scenarios=['fragment','download','native-popover','native-checkbox','native-video-keyboard','native-range-drag','ordinary-mouse-swipe','destroy-mid-drag']
try {
 for(const source of sources)for(const scenario of scenarios){
  let entry
  try{
   const html=scenario==='fragment'?'<a id="ehtml-action" href="#ehtml-destination">Read local content</a><div style="height:900px">Long body</div><h2 id="ehtml-destination">Local destination</h2>'
    :scenario==='download'?'<a id="ehtml-action" href="/download.txt" download="local-proof.txt">Download proof</a>'
    :scenario==='native-popover'?'<button id="ehtml-action" popovertarget="ehtml-details">Open details</button><div id="ehtml-details" popover>Small local detail</div>'
    :scenario==='native-checkbox'?'<input id="ehtml-action" type="checkbox" aria-label="Local setting">'
    :scenario==='native-video-keyboard'?'<video id="ehtml-action" controls muted playsinline src="/probe.webm" style="width:480px;height:270px" aria-label="Local sample video"></video>'
    :scenario==='native-range-drag'?'<label>Native range <input id="ehtml-action" type="range" min="0" max="100" value="10" style="width:400px"></label>'
    :'<div id="ehtml-action" style="height:300px;background:rgb(230,230,230)">Plain slide surface</div>'
   entry=await mount(source,'carousel-renderer',html)
   const {page}=entry;const downloads=[];page.on('download',download=>downloads.push(download))
   await page.evaluate(()=>{window.__inputEvents=[];for(const type of ['pointerdown','gotpointercapture','pointerup','lostpointercapture','click','keydown'])document.addEventListener(type,event=>window.__inputEvents.push({type:event.type,target:event.target.id||event.target.className||event.target.nodeName,isTrusted:event.isTrusted,defaultPrevented:event.defaultPrevented,key:event.key??null}),true)})
   if(scenario==='native-video-keyboard'){
    await page.waitForFunction(()=>document.querySelector('#ehtml-action').readyState>=2)
    await page.locator('#ehtml-action').press('Space')
   }else if(scenario==='native-range-drag'){
    const rect=await page.locator('#ehtml-action').boundingBox();const x=rect.x+8+(rect.width-16)*.1;const y=rect.y+rect.height/2
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.85,y,{steps:12});await page.mouse.up()
   }else if(['ordinary-mouse-swipe','destroy-mid-drag'].includes(scenario)){
    const rect=await page.locator('#ehtml-action').boundingBox();const from={x:rect.x+rect.width*.85,y:rect.y+100};const to={x:rect.x+rect.width*.15,y:from.y}
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12})
    if(scenario==='destroy-mid-drag')await page.evaluate(()=>window.__owner.destroy())
    await page.mouse.up();await wait(500)
   }else await page.locator('#ehtml-action').click()
   await wait(250)
   const actual=await page.evaluate(()=>({url:location.href,events:window.__inputEvents,popoverOpen:!!document.querySelector('#ehtml-details:popover-open'),checked:document.querySelector('#ehtml-action')?.checked??null,rangeValue:document.querySelector('input[type=range]')?.valueAsNumber??null,activePage:[...document.querySelectorAll('.carousel__dot')].findIndex(dot=>dot.classList.contains('carousel__dot--active')),media:document.querySelector('video')?{paused:document.querySelector('video').paused,currentTime:document.querySelector('video').currentTime}:null,remainingCarousel:!!document.querySelector('.carousel')}))
   actual.downloads=downloads.map(value=>value.suggestedFilename())
   const pass=scenario==='fragment'?actual.url.endsWith('#ehtml-destination')
    :scenario==='download'?actual.downloads.includes('local-proof.txt')
    :scenario==='native-popover'?actual.popoverOpen
    :scenario==='native-checkbox'?actual.checked===true
    :scenario==='native-video-keyboard'?!actual.media.paused&&actual.media.currentTime>0
    :scenario==='native-range-drag'?actual.rangeValue>=75&&actual.activePage===0
    :scenario==='ordinary-mouse-swipe'?actual.activePage===1
    :!actual.remainingCarousel&&entry.errors.length===0
   observations.push({source:source.name,scenario,status:pass?'PASS':'FAIL',actual,errors:entry.errors})
   console.error(source.name,scenario,pass?'PASS':'FAIL')
  }catch(error){observations.push({source:source.name,scenario,status:'ERROR',error:String(error)});console.error(source.name,scenario,String(error))}
  finally{await entry?.page.close()}
 }
 console.log(JSON.stringify({scope:'Rector actual public renderer with three external dependency arms: npm1.0.0, immutable upstream9896ddf6, and minimal scratch-only deferred capture proposal. No repository or installed dependency edits. No topology/security acceptance.',timestamp:new Date().toISOString(),node:process.version,browser:await browser.version(),scriptSha256:digest(await readFile(new URL(import.meta.url))),upstreamSha:'9896ddf60e594501b612ce38dbac66270f93181e',upstreamSwipeSha256:digest(await readFile(join(upstream,'src/plugins/swipe.js'))),candidateSwipeSha256:digest(await readFile('/tmp/rector-carousel-deferred-capture.js')),sources,observations},null,2))
 if(observations.some(result=>result.status!=='PASS'))process.exitCode=1
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
