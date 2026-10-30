import { toolActionCases, runToolActionCase } from '../tool-actions-parity-fixture.js'
import { test, assert, equal } from './harness.js'

for (const spec of toolActionCases) test(`tool action ${spec.id}`, async () => {
  const result = await runToolActionCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__toolActionResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Tool action did not complete every phase')
  equal(result.diagnostics, [], 'Unexpected editor diagnostic')
  equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Tool action contract failed')
  for (const value of result.observations) equal(value.actual, value.expected,
    `${value.phase}/${value.property}: recorded evidence differs from the observed verdict`)
})
