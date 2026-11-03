import { bgColorToolCases, runBgColorToolCase } from './bgcolor-tools-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Background common Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The common background page did not enforce its Trusted Types policy')
})
for (const spec of bgColorToolCases) test(`Background common ${spec.id}`, async () => {
  const result = await runBgColorToolCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__bgColorToolResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
