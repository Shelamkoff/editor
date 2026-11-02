import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
const [path,candidate]=process.argv.slice(2)
assert(path&&candidate,'Provide raw JSON and pinned candidate')
const git=(...args)=>execFileSync('git',args,{cwd:process.cwd(),maxBuffer:32*1024*1024})
const sha=ref=>git('rev-parse',ref).toString().trim(),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const raw=JSON.parse(await readFile(path,'utf8'))
assert.deepEqual(raw.sources.map(s=>[s.label,s.sha]),[['v1',sha('5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340')],['spec-baseline',sha('e981ff308000c1d92d7e820df95113c1e19bcee8')],['parent',sha('69c8425e0081fde69cf5176ccb73d032720c15fc')],['candidate',sha(candidate)]])
assert.equal(raw.candidatePass,true);assert.deepEqual(raw.serverErrors,[])
assert.equal(raw.runnerSha256,hash(await readFile('scripts/parity/renderer-errors.mjs')))
assert.equal(raw.fixtureSha256,hash(await readFile('tests/browser/renderer-error-parity-fixture.js')))
assert.deepEqual(raw.sources.map(s=>Object.keys(s.loaded).length),[54,88,88,93])
const modes=['none','record','throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty','reject','reject-false','then-getter','then-call','reentrant','async-reentrant']
const inventory=[]
for(const method of ['renderBlock','render','renderTo'])for(const signature of ['data','revision'])for(const kind of ['unknown','version','data'])for(const mode of kind==='unknown'?['placeholder','strict']:modes)inventory.push([false,method,signature,kind,mode])
for(const method of ['renderBlock','render','renderTo'])for(const signature of ['data','revision'])for(const kind of ['version','data'])for(const mode of modes)inventory.push([true,method,signature,kind,mode])
const id=([builtin,...parts])=>(builtin?'builtin/':'')+parts.join('/')
let verdicts=0,modules=0,dependencies=0
const classifications={}
for(const source of raw.sources){
 assert.equal(source.tree,sha(source.sha+'^{tree}'))
 for(const [p,digest]of Object.entries(source.loaded)){assert.equal(hash(git('show',source.sha+':'+p)),digest);modules++}
 const result=raw.results.find(r=>r.source===source.label);assert(result);assert.deepEqual(result.pageErrors,[])
 assert.deepEqual(result.cases.map(c=>c.id),inventory.map(id))
 let observations=0,failures=0
 for(let at=0;at<inventory.length;at++){
  const [builtin,method,signature,kind,mode]=inventory[at],entry=result.cases[at],legacy=source.label==='v1'
  assert.equal(entry.complete,true);assert.deepEqual(entry.errors,[])
  const make=(blockId,text)=>({id:blockId,type:'paragraph',...(!legacy?{dataVersion:builtin?2:1}:{}),...(signature==='revision'?{revision:blockId}:{}),data:{text}})
  const bad=make('bad',kind==='data'?{invalid:true}:'Invalid');if(kind==='unknown')bad.type='missing-renderer';if(kind==='version')bad.dataVersion=99
  const input=method==='renderBlock'?bad:{version:legacy?'1.0.5':'2.0.0',blocks:[make('staged','Staged'),bad]}
  const expected=new Map(),put=(key,value)=>expected.set(key,value)
  const reject=kind!=='unknown'||mode==='strict'
  for(let repeat=0;repeat<2;repeat++){
   put('error/'+repeat,kind==='unknown'?(mode==='strict'?'UnknownBlockTypeError':null):'InvalidBlockDataError')
   if(reject){
    put('errorType/'+repeat,bad.type);put('errorId/'+repeat,'bad')
    if(builtin)put('cause/'+repeat,kind==='version'?'RangeError':'TypeError')
    else{
     if(kind==='data')put('authoritativeCause/'+repeat,true)
     if(kind==='version')put('versionCause/'+repeat,'RangeError')
    }
    if(builtin)put('priorIdentity/'+repeat,true)
    else{put('priorWrapper/'+repeat,true);put('priorNode/'+repeat,true)}
   }else put('placeholder/'+repeat,{type:'missing-renderer',text:''})
   put('input/'+repeat,JSON.stringify(input));put('observerCount/'+repeat,kind==='unknown'||mode==='none'?0:repeat+1);put('unhandled/'+repeat,[])
  }
  if(kind!=='unknown'&&mode!=='none'){
   put('issues',Array.from({length:2},()=>({keys:['blockId','reason','type'],frozen:true,blockId:'bad',type:'paragraph',reason:kind==='version'?'unsupported-data-version':'invalid-data'})))
   if(mode==='reentrant'||mode==='async-reentrant')put('nested',['InvalidBlockDataError','InvalidBlockDataError'])
  }
  if(builtin)put('validRecovery','Recovered')
  else if(reject){
   const staged=kind!=='version'&&method!=='renderBlock'
   put('created',staged?['prior','staged','staged']:['prior']);put('stagedCleanup',staged?['Staged','Staged']:[]);put('finalCleanup',staged?['Staged','Staged','Prior']:['Prior'])
  }
  assert.deepEqual(entry.observations.map(o=>o.property).sort(),[...expected.keys()].sort(),'Observation inventory: '+entry.id)
  for(const observation of entry.observations){
   assert.deepEqual(observation.expected,expected.get(observation.property),'Independent oracle: '+entry.id+'/'+observation.property)
   const status=isDeepStrictEqual(observation.actual,observation.expected)?'PASS':'FAIL'
   assert.equal(observation.status,status,'Stale verdict: '+entry.id+'/'+observation.property)
   verdicts++;observations++
   if(source.label!=='v1')assert.equal(status,'PASS')
   if(status==='FAIL'){
    failures++
    assert.notEqual(kind,'unknown','A shared unknown-type property regressed')
    const category=!builtin?'v1 registered overrides lack schema/version admission':kind==='version'?'v1 has no dataVersion admission':observation.property.startsWith('cause/')?'v1 omits authoritative schema cause':observation.property==='issues'?'v1 diagnostic shape/freeze differs':observation.property.startsWith('observerCount/')?'v1 lacks per-source observer recursion guard':observation.property.startsWith('unhandled/')?'v1 leaves observer rejection uncontained':null
    assert(category,'Unclassified historical failure: '+entry.id+'/'+observation.property)
    classifications[category]=(classifications[category]??0)+1
   }
  }
 }
 assert.equal(observations,6918)
 assert.equal(failures,source.label==='v1'?3636:0)
}
const dependencyRoot=resolve('node_modules')
for(const [p,digest]of Object.entries(raw.dependencyFiles)){
 const absolute=resolve(dependencyRoot,p);assert(absolute.startsWith(dependencyRoot+sep));assert.equal(hash(await readFile(absolute)),digest);dependencies++
}
console.log(JSON.stringify({candidate:sha(candidate),casesPerSource:348,observationsPerSource:6918,verdicts,modules,dependencies,classifications,status:'PASS'},null,2))
