import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { findChrome } from '../../tests/browser/environment.mjs'
import { createNavigationRoots,verifyNavigationRoots,captureNavigationDependencies,verifyNavigationDependencies } from './git-navigation-roots.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const files = ['scripts/parity/html-targets.mjs','scripts/parity/git-navigation-roots.mjs',
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
const dependencies = await captureNavigationDependencies(root)
const sources=await createNavigationRoots(root,[{label:'v1',sha:'5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',legacy:true},{label:'spec-baseline',sha:'e981ff308000c1d92d7e820df95113c1e19bcee8',legacy:false},{label:'candidate',sha:head,legacy:false}])

const requests = []
const server = await createServer({ root, cacheDir:'test-results/html-navigation-vite-cache', logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'decision-destinations', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const path=new URL(request.url,'http://localhost').pathname
      for(const source of sources)if(path.startsWith(source.webBase)){const relative=decodeURIComponent(path.slice(source.webBase.length));if(Object.hasOwn(source.files,relative))source.served[relative]=sha256(await readFile(resolve(source.root,relative)));break}
      if (!request.url.startsWith('/boundary-')) { next(); return }
      if (request.url.startsWith('/boundary-destination')) requests.push({ url: request.url, referer: request.headers.referer ?? '' })
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'")
      response.end('<!doctype html><html><head><title>Boundary decision</title><style>body{margin:0;font:20px sans-serif}#middle{width:900px;height:760px;border:0}#owner{width:700px;height:650px;border:0}section{width:600px;margin:40px}</style></head><body><p>Controlled destination</p></body></html>')
    })
  },
}] })
await server.listen()
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')
const browserExecutable = findChrome()
const browser = await chromium.launch({ executablePath: browserExecutable, headless: true })
const cases = [
  ...['_self','_blank','_parent','_top','articlePreview'].map(target => ({ name:target, target })),
  { name:'existing-named', target:'articlePreview', existing:true },

]
const results=[]
try {
  for (const source of sources) for (const specification of cases) {
    const variants=[]
    for (const kind of ['platform-control','paragraph-editor','paragraph-renderer']) {
      const context=await browser.newContext({ viewport:{width:1100,height:800} })
      const page=await context.newPage(), errors=[], activations=[]
      page.on('pageerror', error=>errors.push(String(error)))
      await page.exposeFunction('__recordBoundaryActivation', value=>activations.push(value))
      const start=requests.length
      await page.goto(origin+'/boundary-host')
      await page.evaluate(url=>{
        const frame=document.createElement('iframe');frame.id='middle';frame.name='middle';frame.src=url;document.body.replaceChildren(frame)
      },origin+'/boundary-middle')
      const middleElement=await page.locator('#middle').elementHandle(), middle=await middleElement.contentFrame()
      await middle.waitForLoadState('load')
      await middle.evaluate(url=>{
        const frame=document.createElement('iframe');frame.id='owner';frame.name='owner';frame.src=url;document.body.replaceChildren(frame)
      },origin+'/boundary-owner')
      const element=await middle.locator('#owner').elementHandle(), owner=await element.contentFrame()
      await owner.waitForLoadState('load')
      const policyEnforced=await owner.evaluate(()=>{
        try{document.createElement('div').innerHTML='<b>untrusted control</b>';return false}
        catch(error){return error instanceof TypeError}
      })
      assert(!policyEnforced,'The historical comparison requires its declared compatible plain policy')
      if(specification.existing) {
        await owner.evaluate(()=>{
          const button=document.createElement('button');button.id='existing';button.textContent='Existing named window'
          button.addEventListener('click',()=>window.open('/boundary-destination?initial=1','articlePreview'))
          document.body.append(button)
        })
        const opened=context.waitForEvent('page');await owner.locator('#existing').click();await (await opened).waitForLoadState('load')
      }
      await owner.evaluate(async({kind,target,name,sourceBase,legacy,href='/boundary-destination?case='+name})=>{
        const holder=document.createElement('section');holder.id='content-owner';document.body.append(holder)
        const source=`<a id="subject" href="${href}" target="${target}" rel="noopener noreferrer">Requested destination</a>`
        if(kind!=='platform-control') {
          const [type, mode] = kind.split('-')
          const data = { version:legacy?'1.0.5':'2.0.0', blocks:[{ id:'content', type, ...(!legacy?{dataVersion:type==='paragraph'?2:1}:{}),
            data:type==='paragraph'?{text:source}:type==='raw'?{html:source}:{slides:[{id:'html',type:'html',html:source,caption:''}],options:{loop:false,autoplay:false,autoplayDelay:3000,navigation:true,pagination:true,thumbnails:false}} }] }
          const contentStyles=['html,body{margin:0}body{display:flow-root;font:20px sans-serif}']
          if(mode==='editor') {
            const {createEditor}=await import(sourceBase+'core/index.js')
            const module=await import(sourceBase+'plugins/'+type+'/index.js')
            window.probe=createEditor({holder,data,contentStyles,readOnly:true,injectStyles:false,
              plugins:[type==='paragraph'?(legacy?new module.Paragraph({injectStyles:false}):module.createParagraphPlugin({injectStyles:false})):type==='raw'?module.createRawPlugin({injectStyles:false}):module.createCarouselPlugin({injectStyles:false})]})
          } else {
            const {EditorRenderer}=await import(sourceBase+'renderer/index.js')
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
      },{kind,...specification,sourceBase:source.webBase,legacy:source.legacy})
      const targetFrame=kind==='platform-control'||kind.startsWith('paragraph-')?owner:owner.childFrames()[0]
      const subject=targetFrame.locator(kind.startsWith('paragraph-')?'#content-owner a':'#subject')
      const inspected=await owner.evaluate(({kind,origin})=>{
        const holder=document.querySelector('#content-owner')
        const anchor=kind==='platform-control'?holder.querySelector('#subject'):kind.startsWith('paragraph-')?holder.querySelector('a'):holder.querySelector('iframe').contentDocument.querySelector('#subject')
        const record=event=>window.__recordBoundaryActivation({type:event.type,trusted:event.isTrusted,button:event.button,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey})
        anchor.addEventListener('click',record,{capture:true});anchor.addEventListener('auxclick',record,{capture:true})
        const href=new URL(anchor.href)
        return{href:href.href.replace(origin,''),sameOrigin:href.origin===origin,target:anchor.getAttribute('target'),rel:(anchor.getAttribute('rel')??'').split(/\s+/).filter(Boolean).sort()}
      },{kind,origin})
      await subject.click({ ...(specification.modifiers?{modifiers:specification.modifiers}:{}), ...(specification.button?{button:specification.button}:{}) })
      // Observe the requested native outcome, rather than assuming a fixed
      // sleep covers a browser's navigation/IPC scheduling under load.
      const wanted=specification.expectedPage??'/boundary-destination?case='+specification.name
      const settled=()=>{
        if(specification.target==='_self'&&!specification.modifiers&&!specification.button) return !owner.isDetached()&&owner.url().replace(origin,'')===wanted
        if(specification.target==='_parent')return !middle.isDetached()&&middle.url().replace(origin,'')===wanted
        if(specification.target==='_top')return page.url().replace(origin,'')===wanted
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
      const activationDeadline=Date.now()+3000
      while(activations.length===0&&Date.now()<activationDeadline)await page.waitForTimeout(25)
      const actual={pages,middleUrl:middle.isDetached()?'detached':middle.url().replace(origin,''),ownerUrl:owner.isDetached()?'detached':owner.url().replace(origin,''),requests:requests.slice(start),errors,settled:settled(),policyEnforced,inspected,activations}
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
      results.push({source:source.label,name:specification.name,surface:candidate.kind,control,candidate,status:failure?'FAIL':'PASS',failure})
    }
  }
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(sha256(await readFile(resolve(root, path))), expected, 'Source changed: '+path)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), head, 'HEAD changed')
  await verifyNavigationRoots(sources)
  await verifyNavigationDependencies(root,dependencies)
  const current=results.filter(result=>result.source==='candidate')
  const candidatePass=results.length===36&&current.length===12&&current.every(result=>result.status==='PASS')
  console.log(JSON.stringify({scope:'Three-source authored inline target navigation on public Paragraph editor/renderer surfaces, compatible allowing policy, distinct parent/top contexts and real native controls',head,startedAt,finishedAt:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,browser:browser.version(),browserExecutable,sourceHashes,dependencies,sourceUnchanged:true,candidatePass,sources:sources.map(({root,...source})=>source),results},null,2))
  if(!candidatePass||results.some(result=>result.status!=='PASS'))process.exitCode=1
} finally {await browser.close();await server.close()}
