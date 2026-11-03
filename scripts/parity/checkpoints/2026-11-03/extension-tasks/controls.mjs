import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,continuationPath,browserPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url))
const raw=JSON.parse(readFileSync(rawPath)),continuation=JSON.parse(readFileSync(continuationPath));mkdirSync(output,{recursive:true})
const review=(task,history,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',task,'--continuation',history,'--browser',browserPath,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,continuationPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['unrelated-task-revoked',d=>scalar(observation(d,'transition','taskAborted',c=>c.spec.lifetime==='other-edit'),true)],
 ['retired-options-read',d=>scalar(observation(d,'completion','callbackCounts',c=>c.spec.lifetime==='mode'),[1,0,[]])],
 ['producer-after-render',d=>scalar(observation(d,'completion','callbackCounts',c=>c.spec.lifetime==='render'),[1,1,[0]])],
 ['stale-widget-view',d=>scalar(observation(d,'live','visible',c=>c.spec.kind==='inline'&&c.spec.projection==='remount'),'A:0')],
 ['canonical-increment-lost',d=>both(observation(d,'live','canonical'),v=>{v[0].data.count=0})],
 ['cross-editor-mutation',d=>both(observation(d,'other-editor','firstCanonical'),v=>{v[0].data.count=101})],
 ['runtime-destroyed-twice',d=>scalar(observation(d,'dispose','runtimesDestroyedOnce'),false)],
 ['old-editor-destroys-successor',d=>scalar(observation(d,'live','accepted',c=>c.spec.lifetime==='destroy-successor'),false)],
 ['lost-history-cursor',d=>scalar(observation(d,'completion','undoHistory',c=>c.spec.lifetime==='other-edit'),[false,true])],
 ['extra-publication',d=>{cases(d)[0].events.push(structuredClone(cases(d)[0].events[0]))}],
 ['missing-remount-case',d=>{d.results[2].cases=cases(d).slice(0,-1)}],
 ['hidden-historical-options-read',d=>{const o=d.results[1].cases[0].observations.find(o=>o.phase==='completion'&&o.property==='repeatCallbackCounts');o.actual=structuredClone(o.expected);o.status='PASS'}],
 ['wrong-continuation-grouping',(_,c)=>{const t=c.results[2].traces[0],o=t.observations.find(o=>o.kind==='equal'&&typeof o.actual==='boolean');o.actual=o.expected=!o.actual}],
 ['hidden-historical-continuation',(_,c)=>{const t=c.results[1].traces.find(t=>!t.complete);t.complete=true;t.error=null}],
 ['late-rejection-rolls-back',(_,c)=>{const t=c.results[2].traces.find(t=>t.name.startsWith('publication late rejection'));const o=t.observations.find(o=>Array.isArray(o.actual));o.actual=o.expected=[]}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw),c=structuredClone(continuation);mutate(d,c);const task=join(output,name+'-tasks.json'),history=join(output,name+'-continuation.json');writeFileSync(task,JSON.stringify(d));writeFileSync(history,JSON.stringify(c));const r=review(task,history,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,taskSha256:createHash('sha256').update(readFileSync(task)).digest('hex'),continuationSha256:createHash('sha256').update(readFileSync(history)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
