import { linkToolCases, runLinkToolCase } from './link-tool-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Link Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The Link page did not enforce Trusted Types')
})
for (const spec of linkToolCases) test(`Link ${spec.id}`, async () => {
  const result = await runLinkToolCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__linkToolResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
