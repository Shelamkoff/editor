import { test, assert, equal } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { tableKeyboardCases, runTableKeyboardCase } from '../table-keyboard-parity-fixture.js'

const keys = {
  Enter: ['Enter', 'Enter', 13],
  'Shift+Enter': ['Enter', 'Enter', 13, 8],
  Tab: ['Tab', 'Tab', 9],
  'Shift+Tab': ['Tab', 'Tab', 9, 8],
  'Control+z': ['z', 'KeyZ', 90, 2],
  'Control+Shift+z': ['z', 'KeyZ', 90, 10],
}
for (const specification of tableKeyboardCases) {
  test(`Table keyboard parity ${specification.id}`, async () => {
    const result = await runTableKeyboardCase(specification, { native: async (action, value) => {
      if (action === 'type') await printable(value)
      else if (action === 'key' && keys[value]) await dispatchKey(...keys[value])
      else throw new Error(`Unknown Table keyboard test action: ${action} ${value}`)
    } })
    assert(!result.error, result.error)
    assert(!result.unsupported, result.unsupported)
    equal(result.pageErrors, [], 'Table keyboard browser error')
    equal(result.diagnostics, [], 'Table keyboard diagnostic')
    assert(result.observations.length > 0, 'Table keyboard case produced no observations')
    equal(result.completedPhases, result.plannedPhases, 'Table keyboard phases incomplete')
    const failures = result.observations.filter(observation => observation.status !== 'PASS')
    equal(failures, [], 'Table keyboard parity failed: ' + JSON.stringify(failures))
  })
}
