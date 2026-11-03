import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const[rawPath,redPath,normal,trusted,browser,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath)),red=JSON.parse(readFileSync(redPath));mkdirSync(output,{recursive:true})
const review=(path,redFile,trustedFile,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--red',redFile,'--normal',normal,'--trusted',trustedFile,'--browser',browser,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,redPath,trusted,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,id,phase,property)=>{const o=cases(d).find(c=>c.id===id).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['overwritten-host-title',d=>both(observation(d,'host-title','complete','canonical'),v=>{v[0].data.title='Metadata title'})],
 ['lost-away-back-ownership',d=>both(observation(d,'host-away-back','complete','canonical'),v=>{v[0].data.title='Metadata title'})],
 ['unrelated-task-revoked',d=>scalar(observation(d,'intervening','intervene','firstAborted'),true)],
 ['merged-unrelated-action',d=>both(observation(d,'intervening','replay','undoStates'),v=>{v.splice(0,2)})],
 ['restoration-refetched',d=>scalar(observation(d,'auto-replay','replay','requestCountAfterReplay'),2)],
 ['retired-result-authored',d=>both(observation(d,'destroy/resolve','complete','canonical'),v=>{v[0].data.title='Metadata title'})],
 ['late-rejection-escaped',d=>{cases(d).find(c=>c.id==='render/reject').unhandled=[{kind:'false'}]}],
 ['wrong-request-phase',d=>{cases(d).find(c=>c.id==='adjacent').requestTrace[0].phase='intervene'}],
 ['untrusted-other-input',d=>{cases(d).find(c=>c.id==='intervening').nativeEvents.find(e=>e.kind==='other-input').trusted=false}],
 ['missing-typed-teardown',d=>{d.results[2].cases=cases(d).filter(c=>!c.spec.variant.startsWith('typed-'))}],
 ['hidden-baseline-errors',d=>{d.results[1].pageErrors=[];for(const c of d.results[1].cases){c.pageErrors=[];const o=c.observations.find(o=>o.phase==='dispose'&&o.property==='pageErrors');o.actual=[];o.status='PASS'}}],
 ['hidden-legacy-delay',d=>{const o=d.results[0].cases.find(c=>c.id==='adjacent').observations.find(o=>o.phase==='submit'&&o.property==='canonical');o.actual=structuredClone(o.expected);o.status='PASS'}],
 ['unapproved-environment-host',d=>{d.results[2].environmentRequests=[{url:'http://provider.example/script.js?attr=foreign',type:'script',blocked:true}]}],
 ['ignored-product-network',d=>{d.results[2].externalRequests=[{url:'https://provider.example/implicit-metadata',type:'fetch',blocked:true}]}],
 ['altered-module',d=>{const loaded=d.sources[2].loaded;loaded[Object.keys(loaded)[0]]='0'.repeat(64)}],
 ['hidden-red-failure',(_,r)=>{r.results[2].pageErrors=[]}],
 ['missing-enforced-policy',()=>{},text=>text.split('\n').map(line=>{if(!line.startsWith('{"native-link-preview-metadata-trusted.html":'))return line;const d=JSON.parse(line);d['native-link-preview-metadata-trusted.html'].shift();return JSON.stringify(d)}).join('\n')],
]
const results=[]
for(const[name,mutate,mutateTrusted]of variants){const d=structuredClone(raw),r=structuredClone(red);mutate(d,r);const path=join(output,name+'.json'),redFile=join(output,name+'-red.json'),trustedFile=join(output,name+'-trusted.log');writeFileSync(path,JSON.stringify(d));writeFileSync(redFile,JSON.stringify(r));writeFileSync(trustedFile,mutateTrusted?mutateTrusted(readFileSync(trusted,'utf8')):readFileSync(trusted));const result=review(path,redFile,trustedFile,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),redSha256:createHash('sha256').update(readFileSync(redFile)).digest('hex'),trustedSha256:createHash('sha256').update(readFileSync(trustedFile)).digest('hex'),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
