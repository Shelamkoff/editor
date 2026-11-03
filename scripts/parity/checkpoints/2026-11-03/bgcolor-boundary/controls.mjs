import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--mode','green','--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=data=>data.results[2].cases
const observation=(data,phase,property,predicate=()=>true)=>{const o=cases(data).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['field-root-recolored',d=>scalar(observation(d,'apply','fieldStyle',c=>c.spec.tag==='span'&&c.spec.styled),'rgb(255, 0, 0)')],
 ['ancestor-formatting-active',d=>scalar(observation(d,'load','toolActive',c=>c.spec.ancestor),true)],
 ['ancestor-prefill',d=>scalar(observation(d,'apply','prefill',c=>c.spec.ancestor),'ddeeff')],
 ['lost-canonical-format',d=>both(observation(d,'apply','canonical'),v=>{v[0].data.text='Alpha'})],
 ['missing-history',d=>scalar(observation(d,'apply','history'),[false,false])],
 ['wrong-redo',d=>scalar(observation(d,'redo','text'),'Alpha')],
 ['untrusted-apply',d=>scalar(observation(d,'apply','trustedApply'),false)],
 ['missing-span-controls',d=>{d.results[2].cases=cases(d).filter(c=>c.spec.tag!=='span')}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1600)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
