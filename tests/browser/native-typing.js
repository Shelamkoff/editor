import { nativeTypingCases, runNativeTypingCase } from './native-typing-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Ordinary native input Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The Ordinary native input page did not enforce Trusted Types')
})
const nativeInput = (method, params) => {
  if (method === 'Input.dispatchMouseEvent') {
    assert(params.type === 'mouseMoved')
    return window.__testInput('Input.hover', { x: params.x, y: params.y })
  }
  return window.__testInput(method, params)
}
for (const spec of nativeTypingCases) test(`Ordinary native input fields ${spec.id}`, async () => {
  const result = await runNativeTypingCase({ spec, nativeInput })
  ;(window.__nativeTypingResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
