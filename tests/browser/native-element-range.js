import { elementRangeCases, runElementRangeCase } from './element-range-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
for (const spec of elementRangeCases) test(`Bold equivalent alpha ${spec.id}`, async () => {
  const result = await runElementRangeCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__elementRangeResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.planned, result.completedPhases, 'Bold case did not complete')
  equal(result.diagnostics, [], 'Unexpected Bold diagnostic'); equal(result.unsupported, [], 'Current Bold case must be supported')
  equal(result.observations.filter(item => item.status !== 'PASS'), [], 'Bold equivalent range contract failed')
  for (const item of result.observations) equal(item.actual, item.expected, `${item.phase}/${item.property}`)
})
await run()
