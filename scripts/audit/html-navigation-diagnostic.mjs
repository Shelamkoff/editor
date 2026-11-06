import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { findChrome } from '../../tests/browser/environment.mjs'
import { captureNavigationDependencies,verifyNavigationDependencies } from '../parity/git-navigation-roots.mjs'
import { createDiagnostics } from './navigation-diagnostics.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const expectedHead = process.env.EDITOR_NAVIGATION_EXPECTED_HEAD
assert(/^[0-9a-f]{40}$/.test(expectedHead ?? ''), 'Provide the exact current diagnostic checkout SHA')
const diagnostics = await createDiagnostics({ root, expectedHead, originalRunnerSha256: '9c9cd595c89f7697cf237602d51ccd51c0d38418c8ecefa42c304486eaab46cf', runnerPath: fileURLToPath(import.meta.url) })
const playwrightModule = process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : import.meta.resolve('playwright')
await diagnostics.capturePlaywright(playwrightModule)
const { chromium } = await import(playwrightModule)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const files = ['scripts/parity/html-content-navigation.mjs','scripts/parity/git-navigation-roots.mjs',
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

const requests = []
let server,browser,origin='',browserExecutable=null
const makeServer = () => createServer({ root, cacheDir:diagnostics.cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'decision-destinations', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url.startsWith('/boundary-')) { next(); return }
      if (request.url.startsWith('/boundary-destination')) requests.push({ url: request.url, referer: request.headers.referer ?? '' })
      response.setHeader('content-type', 'text/html')
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; require-trusted-types-for 'script'; trusted-types rector dompurify")
      response.end('<!doctype html><html><head><title>Boundary decision</title><style>body{margin:0;font:20px sans-serif}#middle{width:900px;height:760px;border:0}#owner{width:700px;height:650px;border:0}section{width:600px;margin:40px}</style></head><body><p>Controlled destination</p></body></html>')
    })
  },
}] })
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
let serial=0
async function runVariant(specification,kind,phase) {
  const context=await browser.newContext({ viewport:{width:1100,height:800} })
  const id=String(++serial).padStart(3,'0')+'-'+phase+'-'+specification.name+'-'+kind
  const trace=diagnostics.beginCase(context,id,specification,kind,phase)
  try {
      const page=await context.newPage(), errors=[], activations=[]
      await trace.attachRoot(page)
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
      assert(policyEnforced,'The navigation owner did not enforce Trusted Types')
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
        if(kind==='bare-paragraph'||kind==='sanitized-only') {
          const paragraph=document.createElement('p');paragraph.className='oe-paragraph'
          if(kind==='bare-paragraph') {
            const anchor=document.createElement('a');anchor.id='subject';anchor.href=href
            anchor.target=target;anchor.rel='noopener noreferrer';anchor.textContent='Requested destination';paragraph.append(anchor)
          } else {
            const {setSanitizedHtml}=await import('/plugin-kit/index.js')
            setSanitizedHtml(paragraph,source)
          }
          holder.append(paragraph)
        } else if(kind!=='platform-control') {
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
      const direct=kind==='platform-control'||kind==='bare-paragraph'||kind==='sanitized-only'||kind.startsWith('paragraph-')
      const targetFrame=direct?owner:owner.childFrames()[0]
      const subject=targetFrame.locator(kind.startsWith('paragraph-')||kind==='sanitized-only'?'#content-owner a':'#subject')
      const inspected=await owner.evaluate(({kind,origin})=>{
        const holder=document.querySelector('#content-owner')
        const anchor=kind==='platform-control'||kind==='bare-paragraph'?holder.querySelector('#subject'):kind.startsWith('paragraph-')||kind==='sanitized-only'?holder.querySelector('a'):holder.querySelector('iframe').contentDocument.querySelector('#subject')
        const record=event=>window.__recordBoundaryActivation({type:event.type,trusted:event.isTrusted,button:event.button,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey})
        anchor.addEventListener('click',record,{capture:true});anchor.addEventListener('auxclick',record,{capture:true})
        const href=new URL(anchor.href)
        return{href:href.href.replace(origin,''),sameOrigin:href.origin===origin,target:anchor.getAttribute('target'),rel:(anchor.getAttribute('rel')??'').split(/\s+/).filter(Boolean).sort()}
      },{kind,origin})
      await trace.readiness('before-click',{middle,owner})
      await trace.inspectAnchor(subject)
      trace.snapshot('before-click');trace.note('click-start')
      await subject.click({ ...(specification.modifiers?{modifiers:specification.modifiers}:{}), ...(specification.button?{button:specification.button}:{}) })
      trace.note('click-return');trace.snapshot('click-return')
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
      trace.note('outcome-poll-finished',{wanted,settled:settled(),deadline});trace.snapshot('after-outcome-poll')
      const pages=[]
      for(const opened of context.pages()) {
        await opened.waitForLoadState('domcontentloaded').catch(error=>trace.note('popup-loadstate-error',{url:opened.url(),error:String(error)}))
        pages.push({url:opened.url().replace(origin,''),openerIsNull:await opened.evaluate(()=>opener===null)})
      }
      if(!owner.isDetached())await owner.waitForLoadState('domcontentloaded').catch(error=>trace.note('owner-loadstate-error',{url:owner.url(),error:String(error)}))
      const activationDeadline=Date.now()+3000
      while(activations.length===0&&Date.now()<activationDeadline)await page.waitForTimeout(25)
      const actual={pages,middleUrl:middle.isDetached()?'detached':middle.url().replace(origin,''),ownerUrl:owner.isDetached()?'detached':owner.url().replace(origin,''),requests:requests.slice(start),errors,settled:settled(),policyEnforced,inspected,activations}

      trace.note('original-outcome',{actual});trace.snapshot('before-teardown')
      return {kind,actual}
  } catch(error) {
    trace.fail(error)
    throw error
  } finally {
    trace.note('teardown-begin')
    try { await context.close() }
    catch(error) { diagnostics.noteLoggerError(error);throw error }
    finally { trace.note('teardown-end');trace.finish() }
  }
}

const originalVariants=['platform-control','raw-editor','raw-renderer','carousel-editor','carousel-renderer','paragraph-editor','paragraph-renderer']
const selectedCases=diagnostics.originalScope==='full'?cases:cases.filter(specification=>specification.name==='fragment-control-click')
const controlKinds=['bare-paragraph','sanitized-only','paragraph-editor','paragraph-renderer']
const buildControlBatches=origin=>[
  {id:'relative-forward',href:'#destination',kinds:controlKinds},
  {id:'relative-reverse',href:'#destination',kinds:[...controlKinds].reverse()},
  {id:'absolute-forward',href:origin+'/boundary-owner#destination',kinds:controlKinds},
  {id:'absolute-reverse',href:origin+'/boundary-owner#destination',kinds:[...controlKinds].reverse()},
]
let controlBatches=[],executionPhase='setup'
const results=[],causalResults=[],phaseErrors=[]
function compare(specification,variants,controlKind,output,phase) {
  const control=variants.find(row=>row.kind===controlKind)
  const candidates=variants.filter(row=>row.kind!==controlKind)
  const navigation=specification.expectedPage
    ? control.actual.pages.some(page=>page.url===specification.expectedPage)
    : control.actual.requests.some(request=>request.url==='/boundary-destination?case='+specification.name)
  assert(navigation&&control.actual.settled,'The independent native control did not navigate: '+specification.name)
  for(const candidate of candidates) {
    let failure=null
    try { assert.deepEqual(candidate.actual,control.actual) } catch(error) {failure=String(error)}
    output.push({name:specification.name,surface:candidate.kind,control,candidate,status:failure?'FAIL':'PASS',failure,phase})
  }
}
try {
  server=await makeServer()
  await server.listen()
  origin=server.resolvedUrls.local[0].replace(/\/$/, '')
  diagnostics.setOrigin(origin)
  browserExecutable=findChrome()
  browser=await chromium.launch({executablePath:browserExecutable,headless:true})
  controlBatches=buildControlBatches(origin)
  await diagnostics.attachBrowser(browser)
  executionPhase='original-and-causal-execution'
  try {
    for(const specification of selectedCases) {
      const variants=[]
      for(const kind of originalVariants)variants.push(await runVariant(specification,kind,'original'))
      compare(specification,variants,'platform-control',results,'original')
    }
  } catch(error) { phaseErrors.push({phase:'original',error:error.stack??String(error)}) }
  for(const batch of controlBatches) {
    const specification={name:'fragment-control-click',target:'_self',modifiers:['Control'],href:batch.href,expectedPage:'/boundary-owner#destination'}
    try {
      const variants=[]
      for(const kind of batch.kinds)variants.push(await runVariant(specification,kind,batch.id))
      compare(specification,variants,'bare-paragraph',causalResults,batch.id)
    } catch(error) { phaseErrors.push({phase:batch.id,error:error.stack??String(error)}) }
  }
  executionPhase='source-and-dependencies'
  for(const [path,expected] of Object.entries(sourceHashes))assert.equal(sha256(await readFile(resolve(root,path))),expected,'Source changed: '+path)
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),head,'HEAD changed')
  await verifyNavigationDependencies(root,dependencies)
} catch(error) { phaseErrors.push({phase:executionPhase,error:error.stack??String(error)}) }
finally {
  try { await browser?.close() }
  catch(error) { phaseErrors.push({phase:'browser-cleanup',error:error.stack??String(error)});diagnostics.noteLoggerError(error) }
  try { await server?.close() }
  catch(error) { phaseErrors.push({phase:'server-cleanup',error:error.stack??String(error)});diagnostics.noteLoggerError(error) }
}
const originalExpectedRows=selectedCases.length*6
const originalCandidatePass=results.length===originalExpectedRows&&results.every(result=>result.status==='PASS')&&!phaseErrors.some(row=>row.phase==='original')
const causalControlsPass=causalResults.length===12&&causalResults.every(result=>result.status==='PASS')
const report=await diagnostics.finish({scope:'Bounded navigation diagnostic; preserved original comparison oracle and 5000 ms outcome deadline, plus predetermined causal controls',
  head,startedAt,finishedAt:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,
  browser:browser?.version()??null,browserExecutable,sourceHashes,dependencies,
  originalExpectedRows,originalCandidatePass,originalCaseNames:selectedCases.map(row=>row.name),originalVariants,results,
  causalExpectedRows:12,causalControlsPass,controlBatches,causalResults,phaseErrors,
  executedContexts:serial,success:originalCandidatePass&&causalControlsPass&&phaseErrors.length===0,
})
console.log(JSON.stringify(report,null,2))
if(!report.success)process.exitCode=1
