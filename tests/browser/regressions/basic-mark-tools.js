import { basicMarkCases, runBasicMarkCase } from '../basic-mark-tools-parity-fixture.js'
import { test, assert, equal } from './harness.js'

for (const spec of basicMarkCases) test(`basic mark action ${spec.id}`, async () => {
  const result = await runBasicMarkCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__basicMarkResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Basic mark action did not complete every phase')
  equal(result.diagnostics, [], 'Unexpected editor diagnostic')
  equal(result.unsupported, [], 'Current mark action must be supported')
  equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Basic mark action contract failed')
  for (const value of result.observations) equal(value.actual, value.expected,
    `${value.phase}/${value.property}: recorded evidence differs from the observed verdict`)
})
