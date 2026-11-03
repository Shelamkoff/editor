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
const observation=(data,phase,property,predicate=c=>c.spec.operation==='render-change')=>{const o=cases(data).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o}
const both=(item,change)=>{change(item.actual);item.expected=structuredClone(item.actual)}
const variants=[
 ['wrong-source',data=>{data.sources[2].sha=data.sources[1].sha}],
 ['changed-document',data=>both(observation(data,'apply','canonical'),value=>{value[0].data.text+=' unwanted'})],
 ['mutated-caller-input',data=>both(observation(data,'apply','callerInputUnchanged'),value=>{value.blocks[0].data.text+=' unwanted'})],
 ['wrong-undo',data=>both(observation(data,'undo','canonical'),value=>{value[0].data.text+=' unwanted'})],
 ['retired-options-read',data=>both(observation(data,'apply','oldTasksDenied'),value=>{value.options=1})],
 ['history-owner-revived',data=>both(observation(data,'redo','previousTasksDenied'),value=>{value.results[0]=true;value.producers=1})],
 ['fresh-task-denied',data=>both(observation(data,'apply','liveBlockNoop'),value=>{value.result=false;value.producers=0})],
 ['wrong-validation-reason',data=>both(observation(data,'reject','validationIssues',c=>c.spec.operation==='invalid'&&c.spec.validationChannel==='callback'),value=>{value[0].issue.reason='wrong'})],
 ['missing-equal-read-only',data=>{data.results[2].cases=cases(data).filter(c=>c.spec.operation!=='render-equal'&&c.spec.mode!=='read-only')}],
]
const results=[]
for(const[name,mutate]of variants){const data=structuredClone(raw);mutate(data);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(data));const r=review(path,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),stderr:r.stderr.slice(-1600)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
