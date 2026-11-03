import { publicEventsCases,runPublicEventsCase } from './public-events-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of publicEventsCases)test(`Public editor events ${spec.id}`,async()=>{
 const result=await runPublicEventsCase({spec})
 ;(window.__publicEventsResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Event phases did not complete')
 equal(result.unhandled,[],'Observer rejection escaped');equal(result.unsupported,[],'Current event contract must be available')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Public event contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
