import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['lost-authored-open',d=>both(observation(d,'activate','canonical',c=>c.spec.kind==='toggle-closed'&&!c.spec.readOnly),v=>{v[1].data.open=false})],
 ['persisted-spoiler-disclosure',d=>both(observation(d,'activate','canonical',c=>c.spec.kind==='spoiler'),v=>{v[1].data.open=true})],
 ['keyboard-did-not-activate',d=>scalar(observation(d,'activate','trustedActivation',c=>c.spec.gesture==='Enter'),[])],
 ['wrong-control-clicked',d=>both(observation(d,'activate','trustedActivation'),v=>{v[0].onDisclosureControl=false})],
 ['expanded-content-hidden',d=>both(observation(d,'activate','view',c=>c.spec.kind==='toggle-closed'),v=>{v.visible=false})],
 ['reader-created-history',d=>scalar(observation(d,'activate','history',c=>c.spec.readOnly),[true,false])],
 ['remount-lost-open',d=>both(observation(d,'remount','canonical',c=>c.spec.kind==='toggle-closed'&&!c.spec.readOnly),v=>{v[1].data.open=false})],
 ['remount-kept-transient-view',d=>both(observation(d,'remount','view',c=>c.spec.kind==='spoiler'&&!c.spec.readOnly),v=>{v.expanded='false';v.visible=false})],
 ['lost-redo',d=>scalar(observation(d,'history','revealedHistory',c=>c.spec.readOnly),[false,false])],
 ['missing-space-cases',d=>{d.results[2].cases=cases(d).filter(c=>c.spec.gesture!=='Space')}],
 ['hidden-historical-enter',d=>{const c=d.results[0].cases.find(c=>c.spec.kind==='toggle-closed'&&c.spec.gesture==='Enter'&&!c.spec.readOnly),o=c.observations.find(o=>o.phase==='activate'&&o.property==='canonical');o.actual=structuredClone(o.expected);o.status='PASS'}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
