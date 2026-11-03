import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath));mkdirSync(output,{recursive:true})
const review=(path,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--candidate',candidate,'--mode','green','--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const observation=(d,phase,property,action='alpha')=>{const o=d.results[0].cases.find(c=>c.spec.action===action).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const scalar=(o,value)=>{o.actual=o.expected=value}
const variants=[
 ['wrong-source',d=>{d.sources[0].sha='e981ff308000c1d92d7e820df95113c1e19bcee8'}],
 ['pending-rgb-lost',d=>{const o=observation(d,'action','intendedMeaning');for(const u of o.actual.slice(0,5))u.bg='#0000ff@0.5';o.expected=structuredClone(o.actual)}],
 ['wrong-alpha',d=>scalar(observation(d,'action','alphaValue'),'1')],
 ['unenforced-trusted-types',d=>{const o=d.results[0].cases.find(c=>c.spec.trustedTypes).observations.find(o=>o.property==='actualTrustedTypesPolicy');scalar(o,false)}],
 ['wrong-document',d=>scalar(observation(d,'auxiliary','nativeRealmOwner'),{owner:false,fallback:false,parentPickers:1})],
 ['lost-redo',d=>scalar(observation(d,'redo','history'),[false,false])],
 ['cancel-mutated',d=>scalar(observation(d,'action','cancelProducer','escape'),1)],
 ['untrusted-action',d=>scalar(observation(d,'action','trustedAction'),false)],
 ['retired-producer',d=>scalar(observation(d,'dispose','retiredProducer'),2)],
 ['missing-controls',d=>{d.results[0].cases=d.results[0].cases.filter(c=>c.spec.action==='alpha')}],
]
const results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
