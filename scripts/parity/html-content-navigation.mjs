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
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const files = ['scripts/parity/html-content-navigation.mjs',
  'shared/sanitize/walker.js', 'shared/sanitize/parseInline.js', 'shared/sanitize/sanitizeHtml.js',
  'shared/sanitize/contentClasses.js', 'shared/contentClassStyles.js', 'shared/contentClassSelectors.js',
  'core/InlineProjectionRuntime.js', 'renderer/inlineWidgets.js', 'plugins/paragraph/index.js', 'renderer/renderers/paragraph/index.js',
  'shared/embeddedHtml.js', 'shared/embeddedHtmlDocument.js', 'shared/rebaseContentViewport.js', 'shared/contentStyles.js',
  'plugins/raw/index.js', 'plugins/carousel/index.js', 'core/createEditorRuntime.js',
  'renderer/EditorRenderer.js', 'renderer/renderers/raw/index.js', 'renderer/renderers/carousel/index.js',
  'shared/sanitize/sanitizeRawHtml.js', 'shared/sanitize/sanitizeUrl.js', 'shared/sanitize/trustedHtml.js',
  'node_modules/dompurify/dist/purify.es.mjs', 'package-lock.json']
const sourceHashes = Object.fromEntries(await Promise.all(files.map(async path => [path, sha256(await readFile(resolve(root, path)))])))
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
const startedAt = new Date().toISOString()

const requests = []
const server = await createServer({ root, cacheDir:'test-results/html-navigation-vite-cache', logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'decision-destinations', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url.startsWith('/boundary-')) { next(); return }
      if (request.url.startsWith('/boundary-destination')) requests.push({ url: request.url, referer: request.headers.referer ?? '' })
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; require-trusted-types-for 'script'; trusted-types rector dompurify")
      response.end('<!doctype html><html><head><title>Boundary decision</title><style>body{margin:0;font:20px sans-serif}#owner{width:700px;height:650px;border:0}section{width:600px;margin:40px}</style></head><body><p>Controlled destination</p></body></html>')
    })
  },
}] })
await server.listen()
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const cases = [
  ...['_self','_blank','_parent','_top','articlePreview'].map(target => ({ name:target, target })),
  { name:'existing-named', target:'articlePreview', existing:true },
  { name:'control-click', target:'_self', modifiers:['Control'] },
  { name:'shift-click', target:'_self', modifiers:['Shift'] },
  { name:'middle-click', target:'_self', button:'middle' },
  { name:'relative', target:'_blank', href:'boundary-destination?case=relative' },
  { name:'fragment-new-tab', target:'_blank', href:'#destination', expectedPage:'/boundary-owner#destination' },
  { name:'fragment-control-click', target:'_self', modifiers:['Control'], href:'#destination', expectedPage:'/boundary-owner#destination' },
]
const results=[]
try {
  for (const specification of cases) {
    const variants=[]
    for (const kind of ['platform-control','raw-editor','raw-renderer','carousel-editor','carousel-renderer','paragraph-editor','paragraph-renderer']) {
      const context=await browser.newContext({ viewport:{width:1100,height:800} })
      const page=await context.newPage(), errors=[]
      page.on('pageerror', error=>errors.push(String(error)))
      const start=requests.length
      await page.goto(origin+'/boundary-host')
      await page.evaluate(url=>{
        const frame=document.createElement('iframe');frame.id='owner';frame.name='owner';frame.src=url;document.body.replaceChildren(frame)
      },origin+'/boundary-owner')
      const element=await page.locator('#owner').elementHandle(), owner=await element.contentFrame()
      await owner.waitForLoadState('load')
      if(specification.existing) {
        await owner.evaluate(()=>{
          const button=document.createElement('button');button.id='existing';button.textContent='Existing named window'
          button.addEventListener('click',()=>window.open('/boundary-destination?initial=1','articlePreview'))
          document.body.append(button)
        })
        const opened=context.waitForEvent('page');await owner.locator('#existing').click();await (await opened).waitForLoadState('load')
      }
      await owner.evaluate(async({kind,target,name,href='/boundary-destination?case='+name})=>{
        const holder=document.createElement('section');holder.id='content-owner';document.body.append(holder)
        const source=`<a id="subject" href="${href}" target="${target}" rel="noopener noreferrer">Requested destination</a>`
        if(kind!=='platform-control') {
          const [type, mode] = kind.split('-')
          const data = { version:'2.0.0', blocks:[{ id:'content', type, dataVersion:type==='paragraph'?2:1,
            data:type==='paragraph'?{text:source}:type==='raw'?{html:source}:{slides:[{id:'html',type:'html',html:source,caption:''}],options:{loop:false,autoplay:false,autoplayDelay:3000,navigation:true,pagination:true,thumbnails:false}} }] }
          const contentStyles=['html,body{margin:0}body{display:flow-root;font:20px sans-serif}']
          if(mode==='editor') {
            const {createEditor}=await import('/core/index.js')
            const module=await import('/plugins/'+type+'/index.js')
            window.probe=createEditor({holder,data,contentStyles,readOnly:true,injectStyles:false,
              plugins:[type==='paragraph'?module.createParagraphPlugin({injectStyles:false}):type==='raw'?module.createRawPlugin({injectStyles:false}):module.createCarouselPlugin({injectStyles:false})]})
          } else {
            const {EditorRenderer}=await import('/renderer/index.js')
            window.probe=new EditorRenderer({blockTypes:[type],contentStyles,injectStyles:false})
            window.probe.renderTo(data,holder)
          }
          const frame=holder.querySelector('iframe'),deadline=performance.now()+3000
          while(type!=='paragraph'&&!frame?.contentDocument?.querySelector('#subject')) {
            if(performance.now()>deadline)throw Error('No owned document')
            await new Promise(resolve=>setTimeout(resolve,10))
          }
        } else {
          const anchor=document.createElement('a');anchor.id='subject';anchor.href=href
          anchor.target=target;anchor.rel='noopener noreferrer';anchor.textContent='Requested destination';holder.append(anchor)
        }
      },{kind,...specification})
      const targetFrame=kind==='platform-control'||kind.startsWith('paragraph-')?owner:owner.childFrames()[0]
      await targetFrame.locator(kind.startsWith('paragraph-')?'#content-owner a':'#subject').click({ ...(specification.modifiers?{modifiers:specification.modifiers}:{}), ...(specification.button?{button:specification.button}:{}) })
      // Observe the requested native outcome, rather than assuming a fixed
      // sleep covers a browser's navigation/IPC scheduling under load.
      const wanted=specification.expectedPage??'/boundary-destination?case='+specification.name
      const settled=()=>{
        if(specification.target==='_self'&&!specification.modifiers&&!specification.button) return !owner.isDetached()&&owner.url().replace(origin,'')===wanted
        if(['_parent','_top'].includes(specification.target))return page.url().replace(origin,'')===wanted
        return context.pages().some(opened=>opened.url().replace(origin,'')===wanted)
      }
      const deadline=Date.now()+5000
      while(!settled()&&Date.now()<deadline)await page.waitForTimeout(25)
      const pages=[]
      for(const opened of context.pages()) {
        await opened.waitForLoadState('domcontentloaded').catch(()=>{})
        pages.push({url:opened.url().replace(origin,''),openerIsNull:await opened.evaluate(()=>opener===null)})
      }
      if(!owner.isDetached())await owner.waitForLoadState('domcontentloaded').catch(()=>{})
      const actual={pages,ownerUrl:owner.isDetached()?'detached':owner.url().replace(origin,''),requests:requests.slice(start),errors,settled:settled()}
      variants.push({kind,actual})
      await context.close()
    }
    const [control,...candidates]=variants
    const navigation=specification.expectedPage
      ? control.actual.pages.some(page=>page.url===specification.expectedPage)
      : control.actual.requests.some(request=>request.url==='/boundary-destination?case='+specification.name)
    assert(navigation&&control.actual.settled,'The independent native control did not navigate: '+specification.name)
    for(const candidate of candidates) {
      let failure=null
      try { assert.deepEqual(candidate.actual,control.actual) } catch(error) {failure=String(error)}
      results.push({name:specification.name,surface:candidate.kind,control,candidate,status:failure?'FAIL':'PASS',failure})
    }
  }
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(sha256(await readFile(resolve(root, path))), expected, 'Source changed: '+path)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), head, 'HEAD changed')
  const candidatePass=results.length===72&&results.every(result=>result.status==='PASS')
  console.log(JSON.stringify({scope:'Real target/modifier navigation on six public Raw/HTML Carousel/Paragraph surfaces compared to an independent bare anchor in the same owner hierarchy and CSP',head,startedAt,finishedAt:new Date().toISOString(),node:process.version,browser:browser.version(),sourceHashes,sourceUnchanged:true,candidatePass,results},null,2))
  if(!candidatePass)process.exitCode=1
} finally {await browser.close();await server.close()}
