import { test, equal } from './regressions/harness.js'
import { dispatchKey, printable } from './native-input-helpers.js'
import { presentationValueCases, runPresentationValueCase } from './presentation-values-fixture.js'

for (const specification of presentationValueCases) {
  test(`Presentation differential: ${specification.id} survives save/render and neighboring native edit/Undo`, async () => {
    const result = await runPresentationValueCase(specification, {
      sourceBase: new URL('../../', import.meta.url).href,
      typeText: printable,
      shortcut: action => dispatchKey('z', 'KeyZ', 90, action === 'redo' ? 10 : 2),
    })
    equal(result.failures, [], 'Typography, canonical formatting or native history changed')
  })
}
