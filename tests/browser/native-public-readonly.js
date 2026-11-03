import { publicReadOnlyCases,runPublicReadOnlyCase } from './public-readonly-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Read-only Trusted Types policy rejects untrusted HTML',()=>{
 assert(window.trustedTypes,'Trusted Types API is unavailable')
 let blocked=false
 try{document.createElement('div').innerHTML='<b>untrusted control</b>'}catch(error){blocked=error instanceof TypeError}
 assert(blocked,'The read-only fixture did not enforce its Trusted Types policy')
})
for(const spec of publicReadOnlyCases)test(`Public read-only ${spec.id}`,async()=>{
 const result=await runPublicReadOnlyCase({spec,nativeInput:(method,params)=>window.__testInput(method,params)})
 ;(window.__publicReadOnlyResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Read-only phases did not complete')
 equal(result.diagnostics,[],'Unexpected read-only diagnostic');equal(result.unsupported,[],'Current read-only contract must be supported')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Read-only contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
