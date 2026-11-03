import { disclosureStateCases,runDisclosureStateCase } from './disclosure-state-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Disclosure Trusted Types policy rejects untrusted HTML',()=>{
 assert(window.trustedTypes,'Trusted Types API is unavailable')
 let blocked=false
 try{document.createElement('div').innerHTML='<b>untrusted control</b>'}catch(error){blocked=error instanceof TypeError}
 assert(blocked,'The disclosure fixture did not enforce its Trusted Types policy')
})
for(const spec of disclosureStateCases)test(`Disclosure state ${spec.id}`,async()=>{
 const result=await runDisclosureStateCase({spec,nativeInput:(method,params)=>window.__testInput(method,params)})
 ;(window.__disclosureStateResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Disclosure phases did not complete')
 equal(result.diagnostics,[],'Unexpected disclosure diagnostic');equal(result.unsupported,[],'Current disclosure contract must be supported')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Disclosure contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
