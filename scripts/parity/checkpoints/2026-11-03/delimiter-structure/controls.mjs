import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const[rawPath,normal,trusted,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--normal',normal,'--trusted',trusted,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['wrong-insertion-order',d=>both(observation(d,'apply','order',c=>c.spec.variant==='insert-head'),v=>v.reverse())],
 ['selection-created-history',d=>scalar(observation(d,'select','history',c=>!c.spec.readOnly),[true,false])],
 ['delimiter-became-editable',d=>both(observation(d,'select','hrContract',c=>c.spec.variant==='select'),v=>{v.editable='true'})],
 ['neighbor-dom-replaced',d=>scalar(observation(d,'apply','neighborsRetained'),false)],
 ['lost-undo',d=>scalar(observation(d,'replay','undoAvailable'),false)],
 ['untrusted-pointer',d=>both(observation(d,'apply','nativeClick'),v=>{v[0].trusted=false})],
 ['output-lost-neighbor-mark',d=>both(observation(d,'output','rendered'),v=>{v.find(r=>r.type==='paragraph').html='Alpha'})],
 ['extra-publication',d=>{cases(d)[0].transactions.push(structuredClone(cases(d)[0].transactions[0]))}],
 ['missing-reader-cases',d=>{d.results[2].cases=cases(d).filter(c=>!c.spec.readOnly)}],
 ['hidden-old-default-history',d=>{const o=d.results[0].cases.find(c=>c.spec.variant==='remove-final'&&c.spec.readOnly).observations.find(o=>o.phase==='replay'&&o.property==='undoCanonical');o.actual=structuredClone(o.expected);o.status='PASS'}],
 ['reused-default-identity',d=>{const c=cases(d).find(c=>c.spec.variant==='remove-final');c.allocatedId='d'}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
