import { quoteFieldsCases, runQuoteFieldsCase } from './quote-fields-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Quote Trusted Types policy rejects untrusted HTML', () => {
  assert(window.trustedTypes)
  let blocked = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' } catch (error) { blocked = error instanceof TypeError }
  assert(blocked, 'The Quote page did not enforce Trusted Types')
})
const nativeInput = (method, params) => {
  if (method === 'Input.dispatchMouseEvent') {
    assert(params.type === 'mouseMoved')
    return window.__testInput('Input.hover', { x: params.x, y: params.y })
  }
  return window.__testInput(method, params)
}
for (const spec of quoteFieldsCases) test(`Quote fields ${spec.id}`, async () => {
  const result = await runQuoteFieldsCase({ spec, nativeInput })
  ;(window.__quoteFieldsResults ??= []).push(result)
  assert(!result.error, result.error); equal(result.completedPhases, result.planned)
  equal(result.diagnostics, []); equal(result.unsupported, [])
  for (const observation of result.observations) equal(observation.actual, observation.expected, `${observation.phase}/${observation.property}`)
})
await run()
