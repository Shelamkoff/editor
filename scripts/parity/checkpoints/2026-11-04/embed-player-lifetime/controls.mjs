import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),root='scripts/parity/checkpoints/2026-11-04/embed-player-lifetime'
mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>{const r=d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted);assert.ok(r);return r},item=(d,id='youtube/mode/playing')=>{const c=row(d).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,phase,key,value)=>{const t=c.observations.find(o=>o.phase===phase&&o.property===key);assert.ok(t);t.actual=t.expected=structuredClone(value);t.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['altered-module',d=>{const loaded=d.sources[2].loaded;loaded[Object.keys(loaded)[0]]='0'.repeat(64)}],
 ['retired-frame-connected',d=>replace(item(d),'retire','oldFrameDetached',false)],
 ['stale-control-created-player',d=>replace(item(d,'youtube/mode/preview'),'stale','newFrameCount',1)],
 ['duplicate-player',d=>replace(item(d),'play','frameCount',2)],
 ['lost-author-data',d=>{const c=item(d),v=structuredClone(c.observations.find(o=>o.phase==='play'&&o.property==='canonical').actual);v[0].data.title='';replace(c,'play','canonical',v)}],
 ['mode-authored-history',d=>replace(item(d),'play','history',[true,false])],
 ['lost-exact-undo',d=>replace(item(d,'youtube/replace/playing'),'replay','undoStates',[])],
 ['synthetic-native-click',d=>{item(d).nativeEvents[0].trusted=false}],
 ['pointer-missed-control',d=>{item(d).pointTrace[0].hit=false}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['late-painted-retired-preview',d=>replace(item(d,'pending/mode/resolve'),'late','retiredPreview',{src:'https://foreign.example/old.png',alt:'Old preview'})],
 ['late-painted-current-preview',d=>replace(item(d,'pending/mode/resolve'),'late','currentPreview',{src:'https://foreign.example/old.png',alt:'Old preview'})],
 ['old-request-not-aborted',d=>{const c=item(d,'pending/mode/resolve');replace(c,'retire','oldRequestsAborted',false);c.requestTrace.find(r=>r.phase==='load').aborted=false}],
 ['current-preview-blocked',d=>replace(item(d,'pending/mode/resolve'),'fresh','preview',null)],
 ['unhandled-late-rejection',d=>{const c=item(d,'pending/mode/reject');c.unhandled=['false'];replace(c,'late','unhandled',['false']);replace(c,'fresh','unhandled',['false']);replace(c,'dispose','unhandled',['false'])}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const result=review(path,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:hash(readFileSync(path)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
