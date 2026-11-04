import { residualCutCases, runResidualCutCase } from './compound-residual-cut-fixture.js'
import { warningMergeCases, runWarningMergeCase } from './warning-merge-fixture.js'
import { warningConversionCases, runWarningConversionCase } from './warning-conversion-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Compound residual Trusted Types policy is enforced', () => {
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>unsafe</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked)
})
const nativeInput = (method, params) => method === 'Input.dispatchMouseEvent'
  ? window.__testInput('Input.hover', { x: params.x, y: params.y }) : window.__testInput(method, params)
for (const [cases, execute, label] of [[residualCutCases, runResidualCutCase, 'Compound Cut'], [warningMergeCases, runWarningMergeCase, 'Warning merge'], [warningConversionCases, runWarningConversionCase, 'Warning conversion']]) {
  for (const spec of cases) test(`${label} ${spec.id}`, async () => {
    const result = await execute({ spec, nativeInput })
    ;(window.__compoundResidualResults ??= []).push(result)
    assert(!result.error, result.error)
    equal(result.completedPhases, result.planned)
    equal(result.diagnostics, [])
    equal(result.unsupported, [])
    for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
  })
}
await run()
