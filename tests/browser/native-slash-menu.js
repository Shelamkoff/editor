import { slashMenuCases, runSlashMenuCase } from './slash-menu-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Slash Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The Slash page did not enforce Trusted Types')
})
const nativeInput = (method, params) => {
  if (method === 'Input.dispatchMouseEvent') {
    assert(params.type === 'mouseMoved')
    return window.__testInput('Input.hover', { x: params.x, y: params.y })
  }
  return window.__testInput(method, params)
}
for (const spec of slashMenuCases) test(`Slash ${spec.id}`, async () => {
  const result = await runSlashMenuCase({ spec, nativeInput })
  ;(window.__slashMenuResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
