import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const candidate='e7fb76e98d8360c8e0a4867c47e36f145f8aa4f4'
export function verify(report,gitFiles=true){
 assert.equal(report.headBefore,candidate);assert.equal(report.headAfter,candidate)
 assert.equal(report.serverErrors.length,0)
 const current=report.results.filter(r=>r.source==='candidate');assert.equal(current.length,2)
 assert.deepEqual(current.map(r=>r.trustedPolicy),[false,true])
 const ids=['individual/0','individual/1','individual/2','individual/3','group/4','group/5','zip/6','zip/7','zip/8','zip/9']
 const bytes=[[0,1,127,255],[66,10,0]],names=['alpha Ω.bin','beta.txt']
 for(const r of current){
  assert.equal(r.policyEnforced,r.trustedPolicy)
  for(const p of ['pageErrors','inputErrors','externalRequests','unavailable'])assert.deepEqual(r[p],[])
  assert.deepEqual(r.cases.map(c=>c.id),ids)
  assert.equal(r.cases.reduce((n,c)=>n+c.observations.length,0),45)
  for(const c of r.cases){
   assert.equal(c.error,undefined);assert.deepEqual(c.unsupported,[]);assert.ok(c.phases.includes('render')&&c.phases.includes('dispose'))
   const get=(phase,property)=>{const matches=c.observations.filter(o=>o.phase===phase&&o.property===property);assert.equal(matches.length,1);return matches[0]}
   const equal=(phase,property,value)=>{const o=get(phase,property);assert.deepEqual(o.actual,value);assert.deepEqual(o.expected,value)}
   assert.ok(c.events.length>0&&c.events.every(e=>e.kind==='click'&&e.trusted===true))
   for(const o of c.observations){assert.deepEqual(o.actual,o.expected);assert.equal(o.status,'PASS')}
   if(c.kind==='individual'||c.kind==='group'){
    const i=c.kind==='group'?1:0;equal('download','completed',{name:names[i],bytes:bytes[i]});assert.ok(c.phases.includes('download'))
   }else if(c.mode==='complete'||c.mode==='partial'){
    const count=c.mode==='partial'?1:2;equal('download','filename','files.zip');equal('download','entries',names.slice(0,count));for(let i=0;i<count;i++)equal('download',names[i],bytes[i]);assert.ok(c.phases.includes('download'))
   }else{
    equal('pending','requests',2);const count=c.mode==='replacement'?4:2
    if(count===4){equal('replacement','requests',4);equal('replacement','oldSignals',[true,true])}
    equal('retire','allSignals',Array(count).fill(true));equal('retire','oldControlRequests',count);equal('retire','disabled',false)
    assert.ok(c.phases.includes('pending')&&c.phases.includes('retire'))
   }
  }
 }
 const historical=report.results.find(r=>r.source==='v1');assert.ok(historical)
 const oldFailures=historical.cases.flatMap(c=>c.observations.filter(o=>o.status==='FAIL').map(o=>[c.id,o.property,o.actual,o.expected]))
 assert.deepEqual(oldFailures,[['zip/8','oldControlRequests',4,2],['zip/9','oldControlRequests',6,4]])
 for(const source of report.sources){
  assert.equal(Object.keys(source.loaded).length,{'v1':6,'spec-baseline':18,parent:19,candidate:19}[source.label])
  assert.ok(Object.hasOwn(source.loaded,'renderer/renderers/attaches/index.js'))
  if(gitFiles)for(const[path,digest]of Object.entries(source.loaded))assert.equal(digest,sha(execFileSync('git',['show',`${source.sha}:${path}`],{maxBuffer:8*1024*1024})))
 }
 assert.equal(report.candidatePass,true)
 return {candidate,executions:20,observations:90,historicalFailures:2,policies:2}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const file=process.argv[2]??fileURLToPath(new URL('comparison.json.gz',import.meta.url));const bytes=readFileSync(file)
 console.log(JSON.stringify(verify(JSON.parse(file.endsWith('.gz')?gunzipSync(bytes):bytes))))
}
