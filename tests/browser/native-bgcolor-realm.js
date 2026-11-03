import { bgColorRealmCases, runBgColorRealmCase } from './bgcolor-realm-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
for (const spec of bgColorRealmCases) test(`Background color foreign document ${spec.id}`, async () => {
  const result = await runBgColorRealmCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__bgColorRealmResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
