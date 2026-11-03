import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,structurePath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath)),structure=JSON.parse(readFileSync(structurePath));mkdirSync(output,{recursive:true})
const review=(path,structureFile,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--structure',structureFile,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,structurePath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',(d)=>{d.sources[2].sha=d.sources[1].sha}],
 ['readonly-authored',d=>both(observation(d,'denied','canonical'),v=>{v[0].data.text='Mutated'})],
 ['editable-root-in-reader-mode',d=>both(observation(d,'read-only','fields'),v=>{v[0]='true'})],
 ['reader-cannot-reveal',d=>scalar(observation(d,'reader','view0',c=>c.spec.reader==='spoiler'),{expanded:'false',visible:false})],
 ['reader-wrote-document',d=>both(observation(d,'reader','canonical0',c=>c.spec.reader==='toggle-closed'),v=>{v[1].data.open=true})],
 ['lost-redo',d=>scalar(observation(d,'editable','history',c=>c.spec.history==='redo'),[false,false])],
 ['duplicate-mode-fact',d=>both(observation(d,'read-only','modeFacts'),v=>{v.push(structuredClone(v[0]))})],
 ['untrusted-key',d=>both(observation(d,'denied','trustedKeys'),v=>{v[0].trusted=false})],
 ['fresh-input-disabled',d=>scalar(observation(d,'author','trustedInput'),[])],
 ['missing-empty-and-initial-reader',d=>{d.results[2].cases=cases(d).filter(c=>c.spec.history!=='empty'&&!c.spec.initial)}],
 ['readonly-host-update-denied',(d,s)=>scalar(observation(s,'apply','producerCalls',c=>c.spec.variant==='update-data'&&c.spec.mode==='read-only'),0)],
 ['host-redo-lost',(d,s)=>scalar(observation(s,'replay','redoAvailable',c=>c.spec.variant==='insert-middle'&&c.spec.mode==='read-only'),false)],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw),s=structuredClone(structure);mutate(d,s);const path=join(output,name+'.json'),structureFile=join(output,name+'-structure.json');writeFileSync(path,JSON.stringify(d));writeFileSync(structureFile,JSON.stringify(s));const r=review(path,structureFile,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),structureSha256:createHash('sha256').update(readFileSync(structureFile)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
