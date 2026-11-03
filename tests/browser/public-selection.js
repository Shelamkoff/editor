import { publicSelectionCases,runPublicSelectionCase } from './public-selection-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of publicSelectionCases)test(`Public block selection ${spec.id}`,async()=>{
 const result=await runPublicSelectionCase({spec})
 ;(window.__publicSelectionResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Public control phases did not complete')
 equal(result.diagnostics,[],'Unexpected control diagnostic');equal(result.unsupported,[],'Current control must be available')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Public control contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
