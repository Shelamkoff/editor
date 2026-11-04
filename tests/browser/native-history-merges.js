import { compoundMergeCases, runCompoundMergeCase } from './compound-merge-fixture.js'
import { compoundCutMergeCases, runCompoundCutMergeCase } from './compound-cut-merge-fixture.js'
import { historyGestureCases, runHistoryGestureCase } from './history-gestures-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('History and compound merges enforce Trusted Types', () => {
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>unsafe</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked)
})
const nativeInput = (method, params) => method === 'Input.dispatchMouseEvent'
  ? window.__testInput('Input.hover', { x: params.x, y: params.y }) : window.__testInput(method, params)
for (const [cases, execute, label] of [[compoundMergeCases, runCompoundMergeCase, 'Compound merge'], [compoundCutMergeCases, runCompoundCutMergeCase, 'Compound residual Cut'], [historyGestureCases, runHistoryGestureCase, 'History gesture']]) {
  for (const spec of cases) test(`${label} ${spec.id}`, async () => {
    const result = await execute({ spec, nativeInput })
    ;(window.__historyMergeResults ??= []).push(result)
    assert(!result.error, result.error)
    equal(result.completedPhases, result.planned)
    equal(result.diagnostics, [])
    equal(result.unsupported, [])
    for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
  })
}
await run()
