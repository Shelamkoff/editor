import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findChrome } from '../../tests/browser/environment.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url))
const {chromium}=await import(process.env.EDITOR_PLAYWRIGHT_PATH?pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href:'playwright')
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const paths=['scripts/parity/html-logical-viewport.mjs','shared/rebaseContentViewport.js','shared/sanitize/sanitizeRawHtml.js','shared/sanitize/trustedHtml.js','shared/sanitize/sanitizeUrl.js','node_modules/dompurify/dist/purify.es.mjs','package-lock.json']
const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,digest(await readFile(resolve(root,path)))])))
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),startedAt=new Date().toISOString()
const server=await createServer({root,cacheDir:'test-results/html-logical-vite-cache',logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'affine-decision',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url!=='/affine-decision'){next();return}
 res.setHeader('content-type','text/html');res.setHeader('content-security-policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify")
 res.end('<!doctype html><title>Logical CSS native reference</title>')
})}}]})
await server.listen()
const browser=await chromium.launch({headless:true,executablePath:findChrome()})
const results=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:800}})
 page.on('pageerror',error=>errors.push(String(error)))
 await page.goto(server.resolvedUrls.local[0]+'affine-decision')
 for(const intendedHeight of [100,231,599,600,601,1562]){
  results.push(await page.evaluate(async intendedHeight=>{
   const {toTrustedHtml}=await import('/shared/sanitize/trustedHtml.js')
   const {setSanitizedRawHtml}=await import('/shared/sanitize/sanitizeRawHtml.js')
   const {rebaseViewportUnits}=await import('/shared/rebaseContentViewport.js')
   const css='html{width:600px;writing-mode:vertical-rl;--logical:10vi}body{margin:0;display:flow-root}.horizontal{writing-mode:horizontal-tb}.vertical{writing-mode:vertical-rl}.sample{width:var(--logical);height:10vb}.direct{width:10vi;height:10vb}'
   const html='<div class="horizontal sample">H inherited variable</div><div class="vertical sample">V inherited variable</div><div class="horizontal direct">H direct</div><div class="vertical direct">V direct</div>'
   const frames=[],observations=[]
   const nativeHeight=intendedHeight===600?601:intendedHeight
   for(const kind of ['independent-native-reference','affine-candidate']){
    const frame=document.createElement('iframe');frames.push(frame);frame.sandbox='allow-same-origin'
    frame.style.cssText=`width:${kind==='affine-candidate'?600:1400}px;height:${kind==='affine-candidate'?nativeHeight:800}px;border:0`
    const ready=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));frame.srcdoc=toTrustedHtml('<!doctype html><html><head></head><body></body></html>');document.body.append(frame);await ready
    const child=frame.contentDocument;setSanitizedRawHtml(child.body,html)
    const a=(1400-800)/(600-nativeHeight),b=(800-a*nativeHeight)/100
    const transformed=rebaseViewportUnits(css,{width:1400,height:800,nativeWidth:600,nativeHeight})
    const sheet=new child.defaultView.CSSStyleSheet();sheet.replaceSync(kind==='affine-candidate'?transformed:css);child.adoptedStyleSheets=[sheet]
    const read=()=>[...child.querySelectorAll('.sample,.direct')].map(element=>{const s=child.defaultView.getComputedStyle(element);return {mode:s.writingMode,width:parseFloat(s.width),height:parseFloat(s.height)}})
    const initial=read();child.querySelector('.horizontal.sample').style.writingMode='vertical-rl';const changed=read()
    observations.push({kind,initial,changed,nativeViewport:[child.defaultView.innerWidth,child.defaultView.innerHeight],a,b})
   }
   const failures=[]
   for(const phase of ['initial','changed'])for(let i=0;i<4;i++)for(const dimension of ['width','height']){
    const actual=observations[1][phase][i][dimension],expected=observations[0][phase][i][dimension]
    if(!Number.isFinite(actual)||Math.abs(actual-expected)>1/32)failures.push({phase,index:i,dimension,actual,expected})
   }
   for(const phase of ['initial','changed'])for(let i=0;i<4;i++){
    if(observations[1][phase][i].mode!==observations[0][phase][i].mode)failures.push({phase,index:i,dimension:'writing-mode',actual:observations[1][phase][i].mode,expected:observations[0][phase][i].mode})
   }
   frames.forEach(frame=>frame.remove())
   return {intendedHeight,effectiveHeight:nativeHeight,observations,failures,status:failures.length?'FAIL':'PASS'}
  },intendedHeight))
 }
 for(const[path,expected]of Object.entries(sourceHashes))if(digest(await readFile(resolve(root,path)))!==expected)throw Error('Source changed: '+path)
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim()!==head)throw Error('HEAD changed')
 const candidatePass=errors.length===0&&results.length===6&&results.every(result=>result.status==='PASS')
 console.log(JSON.stringify({scope:'Actual product viewport-token helper compared with an independent 1400x800 native CSS reference; inherited custom properties, per-element modes and dynamic changes',head,sourceHashes,sourceUnchanged:true,startedAt,finishedAt:new Date().toISOString(),node:process.version,browser:browser.version(),fieldsCompared:96,modesCompared:48,errors,candidatePass,results},null,2))
 if(!candidatePass)process.exitCode=1
}finally{await browser.close();await server.close()}
