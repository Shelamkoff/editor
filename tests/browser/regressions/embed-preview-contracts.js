import { runEmbedPreviewCase } from '../embed-preview-parity-fixture.js'
import { equal, test } from './harness.js'

for (const kind of ['timeout', 'timely']) {
  test(`Embed preview ${kind}: public resolver deadline preserves author data and history`, async () => {
    const result = await runEmbedPreviewCase({ kind })
    equal(result.failures, [])
  })
}
