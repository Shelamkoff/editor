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
const observation=(data,phase,property)=>{const o=cases(data)[0].observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const both=(item,change)=>{change(item.actual);item.expected=structuredClone(item.actual)}
const variants=[
 ['wrong-source',data=>{data.sources[2].sha=data.sources[1].sha}],
 ['retired-input-read',data=>both(observation(data,'retained','blocks.insert'),value=>{value.reads=1})],
 ['retired-task-accepted',data=>both(observation(data,'retained','tasksDenied'),value=>{value.results[0]=true;value.producers=1})],
 ['double-disposal',data=>both(observation(data,'destroy','ownersDisposed'),value=>{value[0]=2})],
 ['double-destroy-event',data=>{const o=observation(data,'retained','destroyEvents');o.actual=o.expected=2}],
 ['successor-lease-lost',data=>{const o=observation(data,'destroy','holderReacquired');o.actual=o.expected=false}],
 ['wrong-live-undo',data=>both(observation(data,'live','undoCanonical'),value=>{value[0].data.text='corrupted'})],
 ['foreign-focus-stolen',data=>both(observation(data,'retained','foreignFocusAndRange'),value=>{value.active=false})],
 ['missing-microtasks',data=>{data.results[2].cases=cases(data).filter(c=>c.spec.timing!=='microtask')}],
]
const results=[]
for(const[name,mutate]of variants){const data=structuredClone(raw);mutate(data);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(data));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1600)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
