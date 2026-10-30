import { test, equal, run } from './regressions/harness.js'
import { printable, dispatchKey } from './native-input-helpers.js'
import { mediaRoundtripCases, runMediaRoundtripCase } from './media-roundtrip-review-fixture.js'
for (const spec of mediaRoundtripCases) test(spec.id, async () => {
  const result = await runMediaRoundtripCase(spec, { sourceBase: new URL('../../', import.meta.url).href,
    typeText: printable, shortcut: action => dispatchKey('z', 'KeyZ', 90, action === 'redo' ? 10 : 2) })
  equal(result.failures, [], JSON.stringify(result))
})
await run()
