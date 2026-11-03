import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,runDirectory,output]=process.argv.slice(2)
assert.ok(rawPath&&candidate&&runDirectory&&output&&process.env.EDITOR_PYTHON_PATH)
const root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--browser',join(runDirectory,'browser.log'),'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=data=>data.results[2].cases
const observation=(data,phase,property,predicate=()=>true)=>{const o=cases(data).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const both=(item,change)=>{change(item.actual);item.expected=structuredClone(item.actual)}
const variants=[
 ['wrong-source',data=>{data.sources[2].sha=data.sources[1].sha}],
 ['missing-independent-subscriber',data=>both(observation(data,'dispose','eventTrace'),value=>{value.splice(value.findIndex(t=>t.role==='last'),1)})],
 ['mutable-fact',data=>both(observation(data,'dispose','eventTrace'),value=>{value.find(t=>t.type==='transaction:committed').deepFrozen=false})],
 ['wrong-sequence',data=>both(observation(data,'dispose','eventTrace'),value=>{value.find(t=>t.type==='transaction:committed').payload.sequence=99})],
 ['wrong-undo-graph',data=>both(observation(data,'dispose','eventTrace'),value=>{value.find(t=>t.type==='transaction:committed'&&t.payload.action==='undo').payload.changes[0].after.data.text='Beta'})],
 ['diagnostic-content-leak',data=>{cases(data).find(c=>c.spec.profile==='throw').diagnostics[0].message='private observer failure'}],
 ['unsubscribe-ignored',data=>both(observation(data,'dispose','eventTrace',c=>c.spec.profile==='unsubscribe-before'),value=>{const at=value.findIndex(t=>t.type==='document:changed');value.splice(at+1,0,{...structuredClone(value[at]),role:'middle'})})],
 ['accepted-action-rolled-back',data=>both(observation(data,'commit','canonical'),value=>{value[0].data.text='Alpha'})],
 ['missing-falsy-rejections',data=>{data.results[2].cases=cases(data).filter(c=>c.spec.profile!=='reject'||c.spec.cause==='error')}],
]
const results=[]
for(const[name,mutate]of variants){const data=structuredClone(raw);mutate(data);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(data));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1600)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
