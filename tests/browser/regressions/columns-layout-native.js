import { test, assert, equal } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { columnsLayoutCases, runColumnsLayoutCase } from '../columns-layout-parity-fixture.js'

for (const specification of columnsLayoutCases) {
  test(`Columns layout parity ${specification.id}`, async () => {
    const result = await runColumnsLayoutCase(specification, { native: async (action, value) => {
      if (action === 'type') await printable(value)
      else if (action === 'click') await window.__testInput('Input.click', value)
      else if (action === 'undo') await dispatchKey('z', 'KeyZ', 90, 2)
      else if (action === 'redo') await dispatchKey('z', 'KeyZ', 90, 10)
      else throw new Error(`Unknown Columns test action: ${action}`)
    } })
    assert(!result.error, result.error)
    assert(!result.unsupported, 'The current Columns contract must be supported')
    const failures = result.observations.filter(observation => observation.status !== 'PASS')
    equal(failures, [], 'Columns layout parity failed: ' + JSON.stringify(failures))
  })
}
