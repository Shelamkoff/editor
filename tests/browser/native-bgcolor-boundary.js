import { bgColorBoundaryCases,runBgColorBoundaryCase } from './bgcolor-boundary-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Background boundary Trusted Types policy rejects untrusted HTML',()=>{
 assert(window.trustedTypes,'Trusted Types API is unavailable')
 let blocked=false
 try{document.createElement('div').innerHTML='<b>untrusted control</b>'}catch(error){blocked=error instanceof TypeError}
 assert(blocked,'The background fixture did not enforce its Trusted Types policy')
})
for(const spec of bgColorBoundaryCases)test(`Background color field boundary ${spec.id}`,async()=>{
 const result=await runBgColorBoundaryCase({spec,nativeInput:(method,params)=>window.__testInput(method,params)})
 ;(window.__bgColorBoundaryResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Background field case did not complete')
 equal(result.diagnostics,[],'Unexpected background diagnostic');equal(result.unsupported,[],'Current field contract must be supported')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Background field ownership failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
