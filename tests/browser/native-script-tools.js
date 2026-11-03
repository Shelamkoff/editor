import { scriptToolCases, scriptHostCases, runBasicMarkCase } from './basic-mark-tools-parity-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

const mode = document.body.dataset.scriptMode
const host = document.body.dataset.scriptHost === 'true'
if (!host && !['sup', 'sub', 'none'].includes(mode)) throw new Error('Unknown Script matrix mode')
const cases = host ? scriptHostCases : scriptToolCases.filter(spec => spec.mode === mode)
for (const spec of cases) test(`Script action ${spec.id}`, async () => {
  const result = await runBasicMarkCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__scriptToolResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Script action did not complete every phase')
  equal(result.diagnostics, [], 'Unexpected editor diagnostic')
  equal(result.unsupported, [], 'Current Script action must be supported')
  equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Script action contract failed')
  for (const value of result.observations) equal(value.actual, value.expected,
    `${value.phase}/${value.property}: recorded evidence differs from the observed verdict`)
})

await run()
