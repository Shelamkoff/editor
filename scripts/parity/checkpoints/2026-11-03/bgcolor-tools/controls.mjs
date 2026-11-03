import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results.find(s=>s.source==='candidate').cases
const observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['lost-selected-background',d=>both(observation(d,'action','intendedMeaning'),v=>{v[0][5].bg=null})],
 ['partial-reset-leaked',d=>both(observation(d,'action','intendedMeaning',c=>c.spec.partial&&c.spec.action==='reset'),v=>{v[0][13].bg=null})],
 ['widget-rewritten',d=>scalar(observation(d,'action','widgetIdentity'),false)],
 ['changed-sidecar',d=>both(observation(d,'action','sidecars'),v=>{v[0].swatch.data.value='#ff0000'})],
 ['wrong-backward-range',d=>both(observation(d,'action','selection',c=>c.spec.backward&&!c.spec.lifetime),v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['noop-lost-redo',d=>scalar(observation(d,'action','history',c=>!!c.spec.noop),[true,false])],
 ['cancel-produced',d=>scalar(observation(d,'action','producerCalls',c=>!!c.spec.cancel),1)],
 ['retired-produced',d=>scalar(observation(d,'inactive','retiredProducer',c=>!!c.spec.lifetime),1)],
 ['untrusted-action',d=>scalar(observation(d,'action','trustedAction'),false)],
 ['missing-controls',d=>{d.results[2].cases=cases(d).filter(c=>c.spec.shape==='single')}],
 ['historical-graph-tampered',d=>{const o=d.results[0].cases[0].observations.find(o=>o.property==='fixedMeaning');o.actual[0][0].text='Z';o.expected=structuredClone(o.actual)}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
