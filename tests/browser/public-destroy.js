import { publicDestroyCases,runPublicDestroyCase } from './public-destroy-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of publicDestroyCases)test(`Public editor destroy ${spec.id}`,async()=>{
 const result=await runPublicDestroyCase({spec})
 ;(window.__publicDestroyResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Destroy phases did not complete')
 equal(result.diagnostics,[],'Unexpected terminal diagnostic');equal(result.unsupported,[],'Current terminal API must be observed')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Terminal public capability contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
