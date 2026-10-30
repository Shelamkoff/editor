import { test, assert, equal } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { textBlockSettingsCases, runTextBlockSettingsCase } from '../text-block-settings-parity-fixture.js'

for (const specification of textBlockSettingsCases) {
  test(`Text block settings parity ${specification.id}`, async () => {
    const result = await runTextBlockSettingsCase(specification, { native: async (action, value) => {
      if (action === 'type') await printable(value)
      else if (action === 'click') await window.__testInput('Input.click', value)
      else if (action === 'undo') await dispatchKey('z', 'KeyZ', 90, 2)
      else if (action === 'redo') await dispatchKey('z', 'KeyZ', 90, 10)
      else throw new Error(`Unknown text-block input: ${action}`)
    } })
    assert(!result.error, result.error)
    assert(!result.unsupported, 'The current block capability must execute')
    equal(result.pageErrors, [], 'Text-block control raised a page error')
    const failures = result.observations.filter(observation => observation.status !== 'PASS')
    equal(failures, [], 'Text block settings parity failed: ' + JSON.stringify(failures))
  })
}
