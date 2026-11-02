import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, sep, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
const [directory, baseline, candidate, rawOverride] = process.argv.slice(2)
assert(directory && baseline && candidate, 'Provide complete structural result directory, baseline and candidate')
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024}),sha=ref=>git('rev-parse',ref).toString().trim()
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const resultBytes=await readFile(rawOverride??join(directory,'results.json')),raw=JSON.parse(resultBytes)
assert.equal(raw.outcome,'passed');assert.equal(raw.sourceUnchanged,true)
assert.deepEqual(raw.pageErrors,[]);assert.deepEqual(raw.serverErrors,[])
assert.equal(raw.runnerSha256,hash(await readFile('benchmarks/structural-authoring.mjs')))
assert.equal(raw.fixtureSha256,hash(await readFile('tests/browser/structural-authoring-fixture.js')))
assert.equal(raw.lockSha256,hash(await readFile('package-lock.json')))
const small=raw.requestedStages.length===1
assert.deepEqual(raw.requestedStages,small?['timing']:['controls','timing','attribution','memory'])
assert.equal(raw.warmup,5);assert.equal(raw.repeats,21)
assert.deepEqual(raw.sources.map(s=>[s.label,s.sha,s.storage]),[['baseline',sha(baseline),'git-object'],['candidate',sha(candidate),'git-object']])
assert.deepEqual(raw.sources.map(s=>Object.keys(s.files).length),[184,184])
assert.deepEqual(Object.keys(raw.sources[0].files).sort(),Object.keys(raw.sources[1].files).sort())
assert.deepEqual(Object.keys(raw.sources[0].files).filter(path=>raw.sources[0].files[path]!==raw.sources[1].files[path]),['core/InlineProjectionRuntime.js'])
assert.equal(git('diff','--name-only',sha(baseline),sha(candidate),'--','core','shared','plugins','plugin-kit','inline-plugins','inline-tools','preset','renderer','locale','package.json','package-lock.json').toString().trim(),'core/InlineProjectionRuntime.js')
let modules=0,dependencies=0,quantiles=0
for(const source of raw.sources)for(const [path,digest]of Object.entries(source.files)){assert.equal(hash(git('show',source.sha+':'+path)),digest);modules++}
const depRoot=resolve(process.env.EDITOR_DEPENDENCIES_ROOT??'node_modules')
for(const [path,digest]of Object.entries(raw.dependencies.files)){const target=resolve(depRoot,path);assert(target.startsWith(depRoot+sep));assert.equal(hash(await readFile(target)),digest);dependencies++}
for(const [name,version]of Object.entries(raw.dependencies.versions))assert.equal(JSON.parse(await readFile(join(depRoot,name,'package.json'),'utf8')).version,version)
const shapes=[['paragraph-small',1],['table-small',4],['table-large',400],['gallery-small',3],['gallery-large',48],['columns-small',2],['columns-large',3]].filter(([id])=>!small||id.endsWith('-small'))
const kinds=['noop-empty','noop-equal','public','native'],variants=['baseline','candidate']
const expected=shapes.flatMap(([shape])=>kinds.flatMap(kind=>variants.map(variant=>variant+'/'+shape+'/'+kind))).sort()
const key=row=>row.variant+'/'+row.shape+'/'+row.kind
assert.deepEqual(raw.timings.map(key).sort(),expected);assert.deepEqual(raw.attribution.map(key).sort(),small?[]:expected)
const checkSteps=(row,steps)=>{
 const noop=row.kind.startsWith('noop-'),names=noop?[row.kind]:[row.kind,'undo','redo']
 assert.deepEqual(steps.map(s=>s.kind),names)
 for(const [at,step]of steps.entries()){
  for(const metric of ['transactions','documents','notifications'])assert.equal(step[metric],noop?0:1)
  assert.equal(step.trustedNativeInput,row.kind==='native'&&at===0?true:null)
  for(const metric of ['synchronousMs','notificationMs','settledRenderOpportunityMs']){
   if((noop&&metric==='notificationMs')||(row.kind==='composition'&&at===0&&metric==='synchronousMs'))assert.equal(step[metric],null)
   else assert(Number.isFinite(step[metric])&&step[metric]>=0)
  }
 }
}
for(const row of raw.timings){
 assert.equal(row.rawSamples.length,21)
 assert.equal(row.metadata.fields,shapes.find(([id])=>id===row.shape)[1]);assert.equal(row.metadata.widgets,3)
 assert.equal(row.metadata.opaqueSidecars,1);assert.equal(row.metadata.configuredHistoryMaxStack,1);assert.equal(row.metadata.configuredChangeDebounceMs,0)
 assert.deepEqual(row.metadata.viewport,{width:1100,height:900});assert(row.metadata.documentUtf8Bytes>500)
 for(const sample of row.rawSamples)checkSteps(row,sample)
 assert.deepEqual(row.summaries.map(s=>s.kind),row.rawSamples[0].map(s=>s.kind))
 for(const [at,summary]of row.summaries.entries())for(const metric of ['synchronousMs','notificationMs','settledRenderOpportunityMs']){
  const values=row.rawSamples.map(sample=>sample[at][metric]).filter(value=>value!==null).sort((a,b)=>a-b)
  const expected=values.length?{p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],min:values[0],max:values.at(-1)}:null
  assert.deepEqual(summary.metrics[metric],expected,'Stale distribution: '+key(row)+'/'+metric);quantiles++
 }
}
assert.equal(raw.controls.length,small?0:74)
if(!small)for(const variant of variants)for(const [shape]of shapes)for(const kind of [...kinds,'composition']){
 const control=raw.controls.find(r=>r.variant===variant&&r.shape===shape&&r.kind===kind);assert(control);assert.equal(control.outcome,'passed');checkSteps(control,control.observations)
}
if(!small)for(const variant of variants)for(const sensitivity of ['sibling-data','missing-notification']){
 const control=raw.controls.find(r=>r.variant===variant&&r.sensitivity===sensitivity);assert(control);assert.equal(control.outcome,'deliberate-failure-detected');assert.match(control.failure,sensitivity==='sibling-data'?/Structural DOM differs/:/Missing scheduled onChange/)
}
const artifacts={}
async function artifact(name){assert(/^[a-z0-9-]+\.(?:trace|allocation)\.json\.gz$/.test(name));const bytes=await readFile(join(directory,name));artifacts[name]=hash(bytes);return JSON.parse(gunzipSync(bytes))}
for(const row of raw.attribution){
 checkSteps(row,row.counted)
 for(const step of row.counted){assert.deepEqual(Object.keys(step.counters).sort(),['childListsRead','elementsCreated','jsonRecordVisits','nodeClones','structuredPayloadVisits'].sort());for(const value of Object.values(step.counters))assert(Number.isSafeInteger(value)&&value>=0)}
 const trace=await artifact(row.trace.artifact),traceId=row.trace.artifact.replace('.trace.json.gz','')
 const windows=row.counted.map((step,at)=>{
  const suffix=at===0?'edit':step.kind,start=trace.traceEvents.find(e=>e.name===traceId+':'+suffix+':start'),end=trace.traceEvents.find(e=>e.name===traceId+':'+suffix+':end');assert(start&&end&&end.ts>=start.ts)
  const totals={}
  for(const name of ['Layout','Paint','UpdateLayoutTree']){const events=trace.traceEvents.filter(e=>e.pid===start.pid&&e.name===name&&e.ph==='X'&&e.ts>=start.ts&&e.ts<end.ts);totals[name]={count:events.length,durationMs:events.reduce((sum,e)=>sum+(e.dur??0),0)/1000}}
  return{kind:step.kind,totals}
 });assert.deepEqual(row.trace.windows,windows)
 const profile=await artifact(row.allocation.artifact);assert.equal(row.allocation.samplingInterval,8192);assert.equal(row.allocation.sampledBytes,profile.samples.reduce((sum,s)=>sum+s.size,0));assert.equal(row.allocation.samples,profile.samples.length);assert.equal(row.allocation.includesCollectedObjects,true);assert.equal(row.allocation.includesResetAndOracle,true)
}
assert.equal(raw.memory.length,small?0:14)
if(!small)for(const variant of variants)for(const [shape,fields]of shapes){
 const memory=raw.memory.find(r=>r.variant===variant&&r.shape===shape);assert(memory);assert.equal(memory.iterations,12)
 const o=memory.observation;assert.equal(o.livePositiveControl,true);assert.equal(o.liveFieldControls,fields);assert.equal(o.observedReleasedObjects,1008);assert.equal(o.retainedReleasedObjects,0)
 assert.equal(Object.keys(o.categories).length,20);assert.equal(Object.values(o.categories).reduce((sum,c)=>sum+c.observed,0),1008);for(const c of Object.values(o.categories))assert.equal(c.retained,0)
}
const comparisons=[]
if(!small)for(const shape of ['table-large','gallery-large','columns-large'])for(const kind of ['public','native']){
 const rows=variants.map(variant=>raw.attribution.find(r=>r.variant===variant&&r.shape===shape&&r.kind===kind).counted[0].counters)
 assert(rows[1].childListsRead<rows[0].childListsRead);assert(rows[1].elementsCreated<rows[0].elementsCreated)
 const timing=variants.map(variant=>raw.timings.find(r=>r.variant===variant&&r.shape===shape&&r.kind===kind).summaries[0].metrics)
 // Assess the complete path; retain every synchronous/notification sub-metric, including slower ones.
 assert(timing[1].settledRenderOpportunityMs.p50<timing[0].settledRenderOpportunityMs.p50)
 comparisons.push({shape,kind,counters:{baseline:rows[0],candidate:rows[1]},timing:{baseline:timing[0],candidate:timing[1]}})
}
console.log(JSON.stringify({scope:'Independent evidence consistency and measured large-structure improvement; small-input distributions retain their separate assessment, no universal latency SLA.',mode:small?'small-input-repeat':'complete',reviewerSha256:hash(await readFile(new URL(import.meta.url))),resultSha256:hash(resultBytes),baseline:sha(baseline),candidate:sha(candidate),modules,dependencies,quantiles,artifactCount:Object.keys(artifacts).length,artifacts,comparisons,status:'PASS'},null,2))
