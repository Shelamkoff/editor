import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,runDirectory,output]=process.argv.slice(2)
assert.ok(rawPath&&candidate&&runDirectory&&output&&process.env.EDITOR_PYTHON_PATH)
const root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--browser',join(runDirectory,'browser.log'),'--node',join(runDirectory,'node.log'),'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=data=>data.results[2].cases
const observation=(data,phase,property,predicate=()=>true)=>{const o=cases(data).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const both=(item,change)=>{change(item.actual);item.expected=structuredClone(item.actual)}
const variants=[
 ['wrong-source',data=>{data.sources[2].sha=data.sources[1].sha}],
 ['canonical-alias',data=>both(observation(data,'read','canonicalUnchanged'),value=>{value[0].tunes.layout.gap=99})],
 ['lost-own-prototype-key',data=>both(observation(data,'read','snapshots'),value=>{delete value[0].inline.opaque.data.__proto__})],
 ['mutable-envelope',data=>both(observation(data,'read','frozenEnvelopes'),value=>{value[0]=false})],
 ['wrong-undo',data=>both(observation(data,'update','undoCanonical',c=>c.spec.kind==='update'),value=>{value[0].data.text+=' unwanted'})],
 ['extra-history',data=>{const c=cases(data).find(c=>c.spec.kind==='update');c.transactions.push(structuredClone(c.transactions[0]))}],
 ['retired-iterator-accepted',data=>{const o=observation(data,'retired-iterator','iteratorDenied',c=>c.spec.kind==='retired-iterator');o.actual=o.expected=false}],
 ['mixed-iterator-status',data=>both(observation(data,'iterate','retainedSnapshot',c=>c.spec.kind==='iterator-status'),value=>{value.status='active'})],
 ['missing-read-only',data=>{data.results[2].cases=cases(data).filter(c=>c.spec.mode!=='read-only')}],
]
const results=[]
for(const[name,mutate]of variants){const data=structuredClone(raw);mutate(data);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(data));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1600)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
