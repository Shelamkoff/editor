// Public LinkPreview navigation differential with real native link controls.
// Production modules are served unchanged from their exact Git objects.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const startedAt = new Date().toISOString()
const group = 'link-preview-navigation'
const runnerBytes = await readFile(fileURLToPath(import.meta.url))
assert.deepEqual(git('show',`${headBefore}:scripts/parity/link-preview-navigation.mjs`),runnerBytes,'Runner differs from committed source')


const fixturePath = 'tests/browser/link-preview-navigation-fixture.js'
const fixture = git('show',`${headBefore}:${fixturePath}`)
assert.deepEqual(fixture,await readFile(join(repo,fixturePath)),'Fixture differs from committed source')

const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', legacy: true, loaded: {} },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', legacy: false, loaded: {} },
  { label: 'candidate', sha: headBefore, legacy: false, loaded: {} },
].map(source => ({ ...source, tree: git('rev-parse', `${source.sha}^{tree}`).toString().trim() }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pending = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = `/dependencies/${name}/${imported.replace(/^\.\//, '')}`
  dependencyVersions[name] = dependency.version
  pending.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}

const cache = new Map(), dependencyFiles = {}, serverErrors = [], requests=[]
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if(pathname==='/destination'){requests.push({url:request.url,referer:request.headers.referer??''});response.setHeader('content-type','text/html');response.end('<!doctype html><title>Destination</title>Destination');return}
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/' || pathname === '/trusted') {
      if(pathname==='/trusted')response.setHeader('content-security-policy',"require-trusted-types-for 'script'; trusted-types rector dompurify")
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><title>Tool action comparison</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script><body></body>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixture); return }
    if (!cache.has(pathname)) {
      const source = sources.find(value => pathname.startsWith(`/${value.label}/`))
      assert(source || pathname.startsWith('/dependencies/'), `Unexpected source URL: ${pathname}`)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      assert(relative && !relative.split('/').includes('..'), 'Invalid source path')
      const bytes = source ? git('show', `${source.sha}:${relative}`) : await readFile(join(dependencyRoot, relative))
      if (source) source.loaded[relative] = digest(bytes)
      else dependencyFiles[relative] = digest(bytes)
      cache.set(pathname, bytes)
    }
    response.end(cache.get(pathname))
  } catch (error) {
    serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const {linkPreviewNavigationCases}=await import('../../tests/browser/link-preview-navigation-fixture.js')
const origin='http://127.0.0.1:'+server.address().port,results=[]
let browser
try{
 browser=await chromium.launch({executablePath:process.env.EDITOR_CHROME_PATH,headless:true})
 for(const source of sources)for(const spec of linkPreviewNavigationCases.filter(s=>(source.label==='candidate'||!s.trustedPolicy)&&(!process.env.EDITOR_LINK_PREVIEW_NAVIGATION_FILTER||s.id.includes(process.env.EDITOR_LINK_PREVIEW_NAVIGATION_FILTER)))){
  const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),pageErrors=[],externalRequests=[],environmentRequests=[]
  context.on('page',opened=>opened.on('pageerror',error=>pageErrors.push(String(error))))
  page.on('pageerror',error=>pageErrors.push(String(error)))
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){const entry={url:url.href,type:request.resourceType(),blocked:true};if(url.hostname==='gc.kis.v2.scr.kaspersky-labs.com'&&url.pathname==='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'&&entry.type==='script')environmentRequests.push(entry);else externalRequests.push(entry);return route.abort()}return route.continue()})
  const observations=[],check=(phase,property,actual,expected)=>{let status='PASS';try{assert.deepEqual(actual,expected)}catch{status='FAIL'}observations.push({phase,property,actual,expected,status})}
  let error=null,raw={}
  try{
   await page.goto(origin+(spec.trustedPolicy?'/trusted':'/'))
   const policyEnforced=await page.evaluate(()=>{try{document.createElement('div').innerHTML='<b>untrusted</b>';return false}catch(e){return e instanceof TypeError}})
   await page.evaluate(async({source,spec})=>{const {mountNavigationCase}=await import('/fixture.js');await mountNavigationCase({sourceBase:'/'+source.label+'/',legacy:source.legacy,spec})},{source:{label:source.label,legacy:source.legacy},spec})
   const before=await page.evaluate(()=>window.navigationProbe.inspect())
   const activate=async selector=>page.locator(selector).click(spec.gesture==='middle-click'?{button:'middle'}:spec.gesture==='ctrl-click'?{modifiers:['Control']}:{})
   const snapshots=async()=>Promise.all(context.pages().map(async opened=>({url:opened.url().replace(origin,''),openerIsNull:await opened.evaluate(()=>opener===null)})))
   const settle=async destination=>{const deadline=Date.now()+3000;while(!context.pages().some(p=>p.url()===origin+destination)&&Date.now()<deadline)await page.waitForTimeout(10);for(const opened of context.pages())await opened.waitForLoadState('domcontentloaded')}
   const startControl=requests.length;await activate('#control');await settle('/destination?case=control');const control={pages:await snapshots(),requests:requests.slice(startControl),activations:await page.evaluate(()=>window.controlActivations)}
   for(const opened of context.pages())if(opened!==page)await opened.close()
   const start=requests.length;await activate('#subject');await page.waitForFunction(()=>window.navigationProbe.inspect().activations.length>0)
   const activation=await page.evaluate(()=>window.navigationProbe.inspect().activations)
   if(!activation.at(-1).prevented)await settle('/destination?case=subject');else await page.waitForTimeout(100)
   const after=await page.evaluate(()=>window.navigationProbe.inspect()),pages=await snapshots(),navigationRequests=requests.slice(start)
   const allow=['reader','into-reader','renderer'].includes(spec.mode),button=spec.gesture==='middle-click'?1:0,type=button?'auxclick':'click',ctrlKey=spec.gesture==='ctrl-click'
   const block={id:'link',type:'linkPreview',...(!source.legacy?{dataVersion:1}:{}),data:{url:origin+'/destination?case=subject',title:'Navigation title',description:'Description',image:'',favicon:'',domain:'display.example',template:spec.template}}
   check('control','pages',control.pages,[{url:'/',openerIsNull:true},{url:'/destination?case=control',openerIsNull:true}].map((p,i)=>i===0&&spec.trustedPolicy?{...p,url:'/trusted'}:p));check('control','requests',control.requests,[{url:'/destination?case=control',referer:''}]);check('control','activations',control.activations,[{type,trusted:true,button,ctrlKey,prevented:false}])
   check('load','policyEnforced',policyEnforced,spec.trustedPolicy);check('load','canonical',before.canonical,[block]);check('load','history',before.history,spec.mode==='renderer'?null:[false,false]);check('load','href',before.href,'/destination?case=subject');check('load','target',before.target,'_blank');check('load','rel',before.rel,['noopener','noreferrer']);check('load','title',before.title,'Navigation title')
   check('activate','events',after.activations,[{type,trusted:true,button,ctrlKey,shiftKey:false,altKey:false,metaKey:false,prevented:!allow}]);check('activate','pages',pages,[{url:spec.trustedPolicy?'/trusted':'/',openerIsNull:true},...(allow?[{url:'/destination?case=subject',openerIsNull:true}]:[])]);check('activate','requests',navigationRequests,allow?[{url:'/destination?case=subject',referer:''}]:[]);check('activate','canonical',after.canonical,[block]);check('activate','history',after.history,spec.mode==='renderer'?null:[false,false]);check('activate','transactions',after.transactions,[])
   await page.evaluate(()=>window.navigationProbe.destroy());check('dispose','holderRemoved',await page.locator('#subject-holder').count(),0);check('dispose','pageErrors',pageErrors,[]);check('dispose','externalRequests',externalRequests,[])
   raw={before,after,pages,control,navigationRequests,policyEnforced}
  }catch(e){error=String(e.stack??e)}
  results.push({source:source.label,spec,observations,raw,error,pageErrors,externalRequests,environmentRequests});await context.close()
 }
 const headAfter=git('rev-parse','HEAD').toString().trim();assert.equal(headAfter,headBefore);assert.equal(git('diff','--name-only','HEAD').toString().trim(),'')
 const candidate=results.filter(r=>r.source==='candidate'),passed=row=>!row.error&&!row.pageErrors.length&&!row.externalRequests.length&&row.observations.length===19&&row.observations.every(o=>o.status==='PASS'),candidatePass=candidate.length>0&&candidate.every(passed)
 console.log(JSON.stringify({group,startedAt,finishedAt:new Date().toISOString(),headBefore,headAfter,node:process.version,platform:process.platform+' '+process.arch,browser:browser.version(),runnerSha256:digest(runnerBytes),fixtureSha256:digest(fixture),packageLockSha256:digest(await readFile(join(repo,'package-lock.json'))),legacyObservationLimitations:[{port:'transaction:committed',source:'v1',reason:'The legacy fixture has no public event subscription. Its empty harness trace is not evidence of zero legacy transaction events. Native destinations, canonical data and history are measured.'}],sources,dependencyVersions,dependencyFiles,serverErrors,filter:process.env.EDITOR_LINK_PREVIEW_NAVIGATION_FILTER??'',results,candidatePass},null,2))
 if(!candidatePass||results.some(row=>!passed(row)))process.exitCode=1
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
