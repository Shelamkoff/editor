import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,lifetimePath,redPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),root='scripts/parity/checkpoints/2026-11-04/embed-metadata'
mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--lifetime',lifetimePath,'--red',redPath,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,source='candidate',trusted=false)=>{const r=d.results.find(r=>r.source===source&&r.trustedPolicy===trusted);assert.ok(r);return r},item=(d,id='action/throw',source='candidate')=>{const c=row(d,source).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,phase,key,value)=>{const o=c.observations.find(o=>o.phase===phase&&o.property===key);assert.ok(o);o.actual=o.expected=structuredClone(value);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['altered-module',d=>{const m=d.sources[2].loaded;m[Object.keys(m)[0]]='0'.repeat(64)}],
 ['escaped-synchronous-error',d=>replace(item(d),'failure','faults',[{kind:'error',message:'Cover source failed synchronously'}])],
 ['lost-caption',d=>{const c=item(d,'action/caption/resolve'),v=structuredClone(c.observations.find(o=>o.phase==='late'&&o.property==='canonical').actual);v[0].data.caption='Author caption';replace(c,'late','canonical',v)}],
 ['stale-cover-committed',d=>{const c=item(d,'upload/mode/resolve'),v=structuredClone(c.observations.find(o=>o.phase==='late'&&o.property==='canonical').actual);v[0].data.cover='https://foreign.example/old.png';replace(c,'late','canonical',v)}],
 ['retired-request-not-aborted',d=>replace(item(d,'upload/mode/resolve'),'retire','aborted',false)],
 ['lost-exact-undo',d=>replace(item(d,'upload/caption/resolve'),'replay','undo',[])],
 ['synthetic-file-change',d=>{item(d,'upload/live/resolve').nativeEvents[2].trusted=false}],
 ['wrong-file-bytes',d=>{const c=item(d,'upload/live/resolve'),v={...c.fileTrace,base64:'d3Jvbmc='};c.fileTrace=v;replace(c,'pending','file',v)}],
 ['pointer-missed-control',d=>{item(d).pointTrace[0].hit=false}],
 ['local-url-not-revoked',d=>replace(item(d,'upload/local'),'dispose','localRevoked',false)],
 ['late-preview-painted',d=>replace(item(d,'preview/timeout'),'settle','preview',{src:'https://foreign.example/old.png',alt:'Late preview'})],
 ['fresh-source-blocked',d=>replace(item(d,'upload/mode/reject'),'fresh','calls',1)],
 ['cancelled-source-authored-history',d=>replace(item(d,'action/null'),'failure','history',[true,false])],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['hidden-historical-failure',d=>replace(item(d,'action/throw','spec-baseline'),'failure','faults',[])],
 ['unenforced-policy',d=>{row(d,'candidate',true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const result=review(path,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:hash(readFileSync(path)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
