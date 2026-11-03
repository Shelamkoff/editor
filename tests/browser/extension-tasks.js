import { extensionTaskCases,runExtensionTaskCase } from './extension-tasks-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of extensionTaskCases)test(`Public extension task ${spec.id}`,async()=>{
 const result=await runExtensionTaskCase({spec})
 ;(window.__extensionTaskResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Task phases did not complete')
 equal(result.diagnostics,[],'Task operation raised diagnostics');equal(result.unsupported,[],'Current public task must be available')
 for(const observation of result.observations)equal(observation.actual,observation.expected,`${observation.phase}/${observation.property}`)
})
await run()
