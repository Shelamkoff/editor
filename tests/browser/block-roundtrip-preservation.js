import { test, equal, run } from './regressions/harness.js'
import { clickNative, printable, dispatchKey } from './native-input-helpers.js'
import { blockRoundtripCases, runBlockRoundtripCase } from './block-roundtrip-fixture.js'

for (const specification of blockRoundtripCases) test(`Block roundtrip differential: ${specification.id}`, async () => {
  const result = await runBlockRoundtripCase(specification, {
    sourceBase: new URL('../../', import.meta.url).href,
    focusField: clickNative,
    typeText: printable,
    shortcut: action => dispatchKey('z', 'KeyZ', 90, action === 'redo' ? 10 : 2),
  })
  equal(result.failures, [], 'Public block roundtrip changed content, presentation, history or ownership')
})

await run()
