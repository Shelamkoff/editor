import { publicStructureCases,runPublicStructureCase } from './public-structure-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of publicStructureCases)test(`Public block structure ${spec.id}`,async()=>{
 const result=await runPublicStructureCase({spec})
 ;(window.__publicStructureResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Structural phases did not complete')
 equal(result.unsupported,[],'Current public structural action must be available')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'Structural contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
