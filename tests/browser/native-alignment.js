import { alignmentCases, runAlignmentCase } from './alignment-parity-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

const value = document.body.dataset.alignment
if (!['left', 'center', 'right', 'justify'].includes(value)) throw new Error('Unknown alignment matrix')
for (const spec of alignmentCases.filter(spec => spec.value === value)) test(`Alignment action ${spec.id}`, async () => {
  const result = await runAlignmentCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__alignmentResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Alignment case did not complete every phase')
  equal(result.diagnostics, [], 'Unexpected alignment diagnostic')
  equal(result.unsupported, [], 'Current alignment action must be supported')
  equal(result.observations.filter(item => item.status !== 'PASS'), [], 'Alignment contract failed')
  for (const item of result.observations) equal(item.actual, item.expected, `${item.phase}/${item.property}: verdict differs from evidence`)
})
await run()
