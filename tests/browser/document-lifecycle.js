import { documentLifecycleCases,runDocumentLifecycleCase } from './document-lifecycle-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
for(const spec of documentLifecycleCases)test(`Public document lifecycle ${spec.id}`,async()=>{
  const result=await runDocumentLifecycleCase({spec})
  ;(window.__documentLifecycleResults??=[]).push(result)
  assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Document lifecycle case did not complete')
  equal(result.unsupported,[],'Current lifecycle contract must be supported')
  const expected=spec.operation==='invalid'?[{code:'command.failed',operation:'document.render',errorName:['no-version','wrong-blocks'].includes(spec.invalid)?'TypeError':'RangeError'}]:[]
  equal(result.diagnostics.map(({code,operation,errorName})=>({code,operation,errorName})),expected,'Unexpected diagnostic')
  equal(result.observations.filter(o=>o.status!=='PASS'),[],'Document lifecycle contract failed')
  for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
