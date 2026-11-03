import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--mode','green','--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const observation=(d,phase,property,predicate=()=>true)=>{const o=d.results[2].cases.find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['root-reset',d=>scalar(observation(d,'reset','fieldStyles',c=>c.spec.tag==='span'&&c.spec.styled),['',''])],
 ['root-lost-on-undo',d=>scalar(observation(d,'undo','fieldStyles',c=>c.spec.tag==='span'&&c.spec.styled),['',''])],
 ['root-lost-on-redo',d=>scalar(observation(d,'redo','fieldStyles',c=>c.spec.tag==='span'&&c.spec.styled),['',''])],
 ['unselected-color-lost',d=>both(observation(d,'reset','authorMeaning'),v=>{v[0].colors=[]})],
 ['second-field-not-reset',d=>both(observation(d,'reset','authorMeaning'),v=>{v[1].sizes=['24px']})],
 ['wrong-backward-range',d=>both(observation(d,'reset','selection',c=>c.spec.backward),v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['missing-history',d=>scalar(observation(d,'reset','history'),[false,false])],
 ['untrusted-reset',d=>scalar(observation(d,'reset','trustedReset'),false)],
 ['missing-element-controls',d=>{d.results[2].cases=d.results[2].cases.filter(c=>c.spec.boundary==='Text')}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
