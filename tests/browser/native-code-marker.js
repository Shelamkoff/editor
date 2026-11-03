import { codeMarkerCases, runBasicMarkCase } from './basic-mark-tools-parity-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

for (const spec of codeMarkerCases) test(`code/marker action ${spec.id}`, async () => {
  const result = await runBasicMarkCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__codeMarkerResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Code/Marker action did not complete every phase')
  equal(result.diagnostics, [], 'Unexpected editor diagnostic')
  equal(result.unsupported, [], 'Current Code/Marker action must be supported')
  equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Code/Marker contract failed')
  for (const value of result.observations) equal(value.actual, value.expected,
    `${value.phase}/${value.property}: recorded evidence differs from the observed verdict`)
})

await run()
