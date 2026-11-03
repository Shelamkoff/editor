import { fontSizeToolCases, runFontSizeToolCase } from './fontsize-tools-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Font size common Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The common font size page did not enforce its Trusted Types policy')
})
for (const spec of fontSizeToolCases) test(`Font size common ${spec.id}`, async () => {
  const result = await runFontSizeToolCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__fontSizeToolResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
