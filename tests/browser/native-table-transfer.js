import { runTableTransferCase, tableTransferCases } from './table-transfer-fixture.js'
import { assert, equal, run, test } from './regressions/harness.js'

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
  test('Table transfer rejects untrusted HTML', () => {
    let denied = false
    try { document.createElement('div').innerHTML = '<b>untrusted</b>' }
    catch (error) { denied = error instanceof TypeError }
    assert(denied)
  })
}

const nativeInput = (method, params) => method === 'Input.dispatchMouseEvent'
  ? window.__testInput('Input.hover', { x: params.x, y: params.y })
  : window.__testInput(method, params)

for (const spec of tableTransferCases) {
  test('Table transfer/' + spec.id, async () => {
    const result = await runTableTransferCase({ spec, nativeInput })
    assert(!result.error, result.error)
    equal(result.completedPhases, result.planned)
    equal(result.diagnostics, [])
    equal(result.unsupported, [])
    for (const observation of result.observations) equal(observation.actual, observation.expected, observation.phase + '/' + observation.property)
  })
}
await run()
