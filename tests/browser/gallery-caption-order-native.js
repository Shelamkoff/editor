import { test, equal } from './regressions/harness.js'
import { dispatchKey, printable } from './native-input-helpers.js'
import { galleryCaptionOrderCases, runGalleryCaptionOrderCase } from './gallery-caption-order-fixture.js'

for (const specification of galleryCaptionOrderCases) test(`Gallery caption/order: ${specification.mode} ${specification.action}`, async () => {
  const result = await runGalleryCaptionOrderCase(specification, {
    sourceBase: new URL('../../', import.meta.url).href,
    input: async (action, value) => {
      if (action === 'click') await window.__testInput('Input.click', value)
      else if (action === 'type') await printable(value)
      else if (action === 'undo' || action === 'redo') await dispatchKey('z', 'KeyZ', 90, action === 'redo' ? 2 | 8 : 2)
      else if (action === 'drag') await window.__testInput('Input.drag', { ...value,
        via: [{ x: value.from.x + 12, y: value.from.y + 6 }, value.to],
      })
      else throw new Error('Unknown Gallery native action: ' + action)
    },
  })
  equal(result.failures, [], 'Gallery caption/order changed content, sidecars, identity or keyboard history')
  equal(result.incompletePhases, [], 'Gallery caption/order did not execute the full interaction')
})
