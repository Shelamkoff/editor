import { i18nContextsCases, runI18nContextsCase } from './i18n-contexts-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('I18n Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The I18n page did not enforce Trusted Types')
})
for (const spec of i18nContextsCases) test(`I18n ${spec.id}`, async () => {
  const result = await runI18nContextsCase({ spec, nativeInput: (method, params) => window.__testInput(method, params) })
  ;(window.__i18nContextsResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
