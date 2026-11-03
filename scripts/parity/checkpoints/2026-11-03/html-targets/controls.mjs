import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { dirname,join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [navigationPath,comparisonPath,nativePath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),primary=JSON.parse(readFileSync(navigationPath)),comparison=JSON.parse(readFileSync(comparisonPath));mkdirSync(output,{recursive:true})
const review=(navigation,comparison,native,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--navigation',navigation,'--comparison',comparison,'--native',native,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(navigationPath,comparisonPath,nativePath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,name)=>{const r=d.results.find(r=>r.name===name);assert.ok(r);return r},both=(d,name,change)=>{const r=row(d,name);change(r.control.actual);r.candidate.actual=structuredClone(r.control.actual)}
const variants=[
 ['wrong-source',(p,c)=>{c.head=p.head='0'.repeat(40)}],
 ['parent-forced-to-top',p=>both(p,'_parent',a=>{a.middleUrl='detached';a.pages=[{url:'/boundary-destination?case=_parent',openerIsNull:true}]})],
 ['top-confined-to-parent',p=>both(p,'_top',a=>{a.middleUrl='/boundary-destination?case=_top';a.pages=[{url:'/boundary-host',openerIsNull:true}]})],
 ['blank-opener-restored',p=>both(p,'_blank',a=>{a.pages[1].openerIsNull=false})],
 ['named-target-coerced',p=>both(p,'articlePreview',a=>{a.inspected.target='_blank'})],
 ['navigation-suppressed',p=>both(p,'_self',a=>{a.settled=false;a.ownerUrl='/boundary-owner';a.requests=[]})],
 ['activation-untrusted',p=>both(p,'_self',a=>{a.activations[0].trusted=false})],
 ['middle-button-lost',p=>both(p,'middle-click',a=>{a.activations[0].button=0;a.activations[0].type='click'})],
 ['policy-not-enforced',p=>both(p,'_blank',a=>{a.policyEnforced=false})],
 ['dependency-bytes-changed',(p,c)=>{const path=Object.keys(p.dependencies.files)[0];p.dependencies.files[path]=c.dependencies.files[path]='0'.repeat(64)}],
 ['immutable-module-changed',(p,c)=>{const s=c.sources[2];s.files['core/index.js']=s.served['core/index.js']='0'.repeat(64)}],
 ['missing-historical-parent',(p,c)=>{c.results=c.results.filter(r=>!(r.source==='v1'&&r.name==='_parent'))}],
]
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),results=[]
for(const[name,mutate]of variants){const p=structuredClone(primary),c=structuredClone(comparison);mutate(p,c);const navigation=join(output,name+'-navigation.json'),comparisonFile=join(output,name+'-comparison.json');writeFileSync(navigation,JSON.stringify(p));writeFileSync(comparisonFile,JSON.stringify(c));const r=review(navigation,comparisonFile,nativePath,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,navigationSha256:hash(navigation),comparisonSha256:hash(comparisonFile),stderr:r.stderr.slice(-1400)})}
const mutated=join(dirname(nativePath),'targets-mutated-native.log'),text=readFileSync(nativePath,'utf8'),line=text.split('\n').find(l=>l.startsWith('{"native-html-content.html":'));assert.ok(line);const native=JSON.parse(line),retirement=native['native-html-content.html'].find(r=>r.name.includes('retirement during a parent activation'));assert.ok(retirement);retirement.status='FAIL';writeFileSync(mutated,text.replace(line,JSON.stringify(native)));const rejected=review(navigationPath,comparisonPath,mutated,'retired-navigation-ignored');assert.equal(rejected.status,1);results.push({name:'retired-navigation-ignored',exitCode:rejected.status,nativeSha256:hash(mutated),stderr:rejected.stderr.slice(-1400)})
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
