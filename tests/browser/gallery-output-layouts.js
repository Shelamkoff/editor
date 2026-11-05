import { galleryOutputLayoutCases, runGalleryOutputLayoutCase } from './gallery-output-layouts-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Gallery layout output enforces Trusted Types without a default policy', () => {
  let denied = false
  try { document.createElement('span').innerHTML = 'untrusted' } catch (error) { denied = error instanceof TypeError }
  assert(denied)
  equal(window.trustedTypes.defaultPolicy, null)
})
for (const spec of galleryOutputLayoutCases) test(`Gallery output ${spec.layout}: narrow/wide resize, reinsert and update retain every visible cell`, async () => {
  const result = await runGalleryOutputLayoutCase({ spec })
  assert(!result.error, result.error)
  equal(result.phases, ['render', 'width-320', 'width-600', 'reinsert', 'update', 'dispose'])
  for (const observation of result.observations) equal(observation.actual, observation.expected, observation.phase + '/' + observation.property)
})
await run()
