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
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'nonce-rector-iframe-probe'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; require-trusted-types-for 'script'; trusted-types dompurify rector")
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><script type="importmap" nonce="rector-iframe-probe">' + JSON.stringify({ imports }) + '</script><style>html{font-size:16px}body{margin:0;font:20px sans-serif;color:rgb(18,28,38)}#holder{width:600px;margin:140px 40px 30px;border:2px solid #888}.article-accent{color:rgb(12,84,156);font-size:1.5em}.app-screen-cover{position:fixed;inset:0;z-index:2147483647;background:rgb(240,200,200)}#outside{position:fixed;top:20px;right:20px}</style></head><body><button id="outside">Host action</button><section id="holder"></section></body></html>')
      return
    }
    if (url.pathname === '/content-theme.css') {
      response.setHeader('content-type','text/css');response.end('html{font-size:16px}body{font:20px sans-serif;color:rgb(18,28,38)}.article-accent{color:rgb(12,84,156);font-size:1.5em}');return
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
    let bytes=await readFile(join(source?.root ?? repo,relative))
    if(source?.name==='current' && relative==='shared/sanitize/sanitizeRawHtml.js'){
      const original=bytes.toString();const needle='  USE_PROFILES: { html: true },';assert.equal(original.split(needle).length,2)
      bytes=Buffer.from(original.replace(needle,needle+"\n  ADD_ATTR: ['target'], // SCRATCH PROTOTYPE: preserve native target semantics."))
    }
    response.end(bytes)
  } catch (error) { response.statusCode = 404; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: '/tmp/rector-browsers/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true })

const results=[]
const modes=['opaque-control','bridge-no-theme','bridge-explicit-theme']
async function mountPrototype(mode,html){
 const page=await context.newPage();page.setDefaultTimeout(3000);const errors=[];page.on('pageerror',error=>errors.push(String(error)))
 await page.goto(origin+'/fixture')
 const setup=await page.evaluate(async({mode,html})=>{
  const {sanitizeRawHtmlForSink}=await import('/current/shared/sanitize/sanitizeRawHtml.js')
  const {sanitizeUrl}=await import('/current/shared/sanitize/sanitizeUrl.js')
  const model=Object.freeze({version:'2.0.0',blocks:[{id:'fixture',type:'raw',dataVersion:1,data:{html}}]})
  const before=JSON.stringify(model);const commands=[];const measurements=[];const violations=[]
  document.addEventListener('securitypolicyviolation',event=>violations.push(event.violatedDirective))
  let ttEnforced=false;try{document.createElement('template').innerHTML='<p>untrusted</p>'}catch{ttEnforced=true}
  window.__hostClicks=0;document.querySelector('#outside').addEventListener('click',()=>window.__hostClicks++)
  const frame=document.createElement('iframe');frame.title='Owned HTML content';frame.sandbox=mode==='opaque-control'?'':'allow-same-origin';frame.style.cssText='display:block;width:100%;height:150px;border:0'
  let active=true;let child=null;let controller=null;let observer=null;let boundedResizeStopped=false
  const loaded=new Promise(resolve=>frame.addEventListener('load',async()=>{
   child=frame.contentDocument
   if(!child){resolve();return}
   controller?.abort();observer?.disconnect();controller=new AbortController()
   const ownedDocument=child
   const owns=()=>active&&frame.isConnected&&frame.contentDocument===ownedDocument
   const resize=()=>{
    if(!owns())return
    const body=ownedDocument.body;if(!body)return
    const style=ownedDocument.defaultView.getComputedStyle(body)
    const rect=body.getBoundingClientRect();const top=rect.top+ownedDocument.defaultView.scrollY
    const height=Math.max(100,Math.ceil(Math.max(body.scrollHeight+top,rect.bottom+ownedDocument.defaultView.scrollY)+parseFloat(style.marginBottom)))
    if(measurements.length>=24){boundedResizeStopped=true;observer?.disconnect();return}
    if(frame.getBoundingClientRect().height!==height){measurements.push(height);frame.style.height=height+'px'}
   }
   if(mode==='bridge-explicit-theme'){
    const css=ownedDocument.createElement('link');css.rel='stylesheet';css.href='/content-theme.css'
    const ready=new Promise(resolve=>{css.onload=resolve;css.onerror=resolve});ownedDocument.head.append(css);await ready
   }
   ownedDocument.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return
    event.preventDefault()
    if(!owns()||!event.isTrusted||!navigator.userActivation.isActive)return
    const raw=link.getAttribute('href')||''
    const isDownload=link.hasAttribute('download')
    const href=sanitizeUrl(raw,{policy:isDownload?'download':'link',fallback:''})
    if(!href)return
    if(raw.startsWith('#')&&!isDownload){
     const id=decodeURIComponent(raw.slice(1));const target=ownedDocument.getElementById(id)
     if(target){ownedDocument.defaultView.location.hash=raw;target.scrollIntoView();commands.push({kind:'fragment',id})}
     return
    }
    const delegated=document.createElement('a');delegated.href=new URL(href,document.baseURI).href;delegated.target=link.getAttribute('target')||'_self';delegated.rel='noopener noreferrer'
    if(isDownload)delegated.download=link.getAttribute('download')||''
    commands.push({kind:isDownload?'download':'navigation',href:delegated.href,target:delegated.target,download:delegated.download,activation:navigator.userActivation.isActive})
    document.body.append(delegated);try{delegated.click()}finally{delegated.remove()}
   },{capture:true,signal:controller.signal})
   observer=new ResizeObserver(resize);observer.observe(ownedDocument.body);resize();resolve()
  }))
  frame.srcdoc=sanitizeRawHtmlForSink(html,document);document.querySelector('#holder').append(frame);await loaded
  window.__bridge={model,before,frame,commands,measurements,violations,ttEnforced,get stopped(){return boundedResizeStopped},destroy(){active=false;controller?.abort();observer?.disconnect();frame.remove()},snapshot(){return{modelUnchanged:JSON.stringify(model)===before,commands:[...commands],heights:[...measurements],boundedResizeStopped,ttEnforced,violations:[...violations],frameConnected:frame.isConnected,parentCanRead:frame.contentDocument!==null,sandbox:frame.getAttribute('sandbox'),frameHeight:frame.getBoundingClientRect().height}}}
  return window.__bridge.snapshot()
 },{mode,html})
 const iframe=await page.locator('#holder iframe').elementHandle();const content=await iframe.contentFrame();await content.locator('#ehtml-root').waitFor()
 return{page,content,errors,setup}
}
const scenarios=['long-theme-media','fragment','download','named-window','overlay-popover','synthetic-link-and-dispose','viewport-height-feedback']
try{
 for(const mode of modes)for(const scenario of scenarios){
  let entry;const opened=[]
  try{
   const body=scenario==='long-theme-media'?'<p id="ehtml-theme" class="article-accent">Themed article</p><video id="ehtml-video" controls muted playsinline src="/probe.webm" style="width:240px;height:135px" aria-label="Local sample"></video><div style="height:900px">Long body</div><a id="ehtml-tail" href="#ehtml-theme">Reachable tail</a>'
    :scenario==='fragment'?'<a id="ehtml-action" href="#ehtml-destination">Local section</a><div style="height:900px">Body</div><h2 id="ehtml-destination">Destination</h2>'
    :scenario==='download'?'<a id="ehtml-action" href="/download.txt" download="prototype-proof.txt">Download proof</a>'
    :scenario==='named-window'?'<a id="ehtml-action" href="/destination?from=frame-bridge" target="rector-prototype-report">Open report</a>'
    :scenario==='overlay-popover'?'<button id="ehtml-action" popovertarget="ehtml-popover">Open local detail</button><div id="ehtml-popover" popover style="position:fixed;inset:0;width:100vw;height:100vh;margin:0;background:rgb(220,120,120)">Native top layer</div><script>parent.__escaped=1</script><img src="/missing.png" onerror="parent.__escaped=1">'
    :scenario==='synthetic-link-and-dispose'?'<a id="ehtml-action" href="/destination?from=synthetic" target="_blank">Synthetic forbidden command</a>'
    :'<div style="height:calc(100vh + 20px)">Viewport-relative author content</div>'
   entry=await mountPrototype(mode,'<article id="ehtml-root">'+body+'</article>')
   const{page,content}=entry;const downloads=[];page.on('download',download=>downloads.push(download));page.on('popup',popup=>opened.push(popup))
   let detail={};let okay=false
   if(scenario==='long-theme-media'){
    await content.waitForFunction(()=>document.querySelector('#ehtml-video').readyState>=2)
    await content.locator('#ehtml-video').press('Space');await page.waitForTimeout(150)
    detail=await content.evaluate(()=>({color:getComputedStyle(document.querySelector('#ehtml-theme')).color,fontSize:getComputedStyle(document.querySelector('#ehtml-theme')).fontSize,scrollHeight:document.documentElement.scrollHeight,playback:{paused:document.querySelector('video').paused,currentTime:document.querySelector('video').currentTime}}))
    await content.locator('#ehtml-tail').focus();detail.tailFocusable=await content.locator('#ehtml-tail').evaluate(el=>document.activeElement===el)
    await page.setViewportSize({width:420,height:800});await page.evaluate(()=>document.querySelector('#holder').style.width='calc(100vw - 80px)');await page.waitForTimeout(80)
    detail.noHostOverflow=await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth)
    const state=await page.evaluate(()=>__bridge.snapshot())
    okay=detail.color==='rgb(12, 84, 156)'&&!detail.playback.paused&&detail.playback.currentTime>0&&detail.tailFocusable&&detail.noHostOverflow&&state.frameHeight>=detail.scrollHeight-2
   }else if(scenario==='fragment'){
    await content.locator('#ehtml-action').click();await page.waitForTimeout(100)
    detail={mainUrl:page.url(),frameUrl:content.url(),retainedAnchor:await content.locator('#ehtml-destination').count()}
    okay=detail.retainedAnchor===1&&detail.frameUrl.endsWith('#ehtml-destination')
   }else if(scenario==='download'){
    await content.locator('#ehtml-action').click();await page.waitForTimeout(150)
    detail={downloads:downloads.map(d=>d.suggestedFilename()),retainedSource:await content.locator('#ehtml-root').count(),mainUrl:page.url(),frameUrl:content.url()}
    okay=detail.downloads.includes('prototype-proof.txt')&&detail.retainedSource===1
   }else if(scenario==='named-window'){
    await page.evaluate(()=>{const b=document.createElement('button');b.id='host-opener';b.textContent='Host report';b.style.cssText='position:fixed;left:20px;top:20px';b.onclick=()=>window.open('/destination?initial=1','rector-prototype-report');document.body.append(b)})
    const promise=page.waitForEvent('popup');await page.locator('#host-opener').click();const report=await promise;await report.waitForLoadState('domcontentloaded')
    await content.locator('#ehtml-action').click();await page.waitForTimeout(150)
    detail={popups:opened.map(p=>p.url()),namedUrl:report.url(),retainedSource:await content.locator('#ehtml-root').count(),mainUrl:page.url(),frameUrl:content.url()}
    okay=detail.popups.some(url=>url.includes('from=frame-bridge'))&&detail.retainedSource===1&&detail.mainUrl.endsWith('/fixture')
   }else if(scenario==='overlay-popover'){
    await content.locator('#ehtml-action').press('Enter');await page.waitForTimeout(50)
    const rect=await page.locator('#outside').boundingBox();const x=rect.x+rect.width/2,y=rect.y+rect.height/2
    detail=await content.evaluate(()=>({open:!!document.querySelector(':popover-open'),activeMarkup:!!document.querySelector('script,[onerror]')}))
    detail.hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x,y});await page.mouse.click(x,y)
    detail.hostClicks=await page.evaluate(()=>__hostClicks);detail.payloadRan=await page.evaluate(()=>window.__escaped??0)
    okay=detail.open&&detail.hostClicks===1&&!detail.activeMarkup&&!detail.payloadRan
   }else if(scenario==='synthetic-link-and-dispose'){
    await content.locator('#ehtml-action').evaluate(el=>el.click());await page.waitForTimeout(100)
    detail={popupsBeforeDispose:opened.length,retainedSource:await content.locator('#ehtml-root').count()}
    await page.evaluate(()=>{const child=__bridge.frame.contentDocument;const link=child?.querySelector('#ehtml-action');__bridge.destroy();link?.click()});await page.waitForTimeout(50)
    detail.popupsAfterDispose=opened.length;detail.commands=await page.evaluate(()=>__bridge.commands)
    okay=detail.popupsBeforeDispose===0&&detail.popupsAfterDispose===0&&detail.commands.length===0
   }else{
    await page.waitForTimeout(700);detail=await page.evaluate(()=>__bridge.snapshot())
    okay=!detail.boundedResizeStopped&&detail.heights.length<5
   }
   const state=await page.evaluate(()=>__bridge.snapshot())
   results.push({mode,scenario,status:okay?'PASS':'FAIL',detail,state,errors:entry.errors})
   console.error(mode,scenario,okay?'PASS':'FAIL')
  }catch(error){results.push({mode,scenario,status:'ERROR',error:String(error)});console.error(mode,scenario,String(error))}
  finally{for(const popup of opened)await popup.close();await entry?.page.close()}
 }
 console.log(JSON.stringify({scope:'DECISION-ONLY iframe topology prototype, not integrated production. One allow-same-origin token, no scripts/top-navigation/popups/download grants; exact-owned trusted synchronous host navigation bridge; optional explicit theme asset. Parent enforces nonce script CSP and Trusted Types; authored style attributes are explicitly allowed. Existing sanitizer transformed ONLY to preserve target for this experiment. Bounded resize stop is a probe safety cutoff, not a proposed product cap.',timestamp:new Date().toISOString(),node:process.version,browser:await browser.version(),scriptSha256:digest(await readFile(new URL(import.meta.url))),sources,results},null,2))
 if(results.some(result=>result.status!=='PASS'))process.exitCode=1
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
