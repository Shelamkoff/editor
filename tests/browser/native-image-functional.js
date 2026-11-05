import { imageFunctionalCases, runImageFunctionalCase } from './image-functional-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Image functionality enforces Trusted Types', () => {
  let denied = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' }
  catch (error) { denied = error instanceof TypeError }
  assert(denied)
})

for (const spec of imageFunctionalCases) test('Image functionality/' + spec.id, async () => {
  const result = await runImageFunctionalCase({ spec, nativeInput: window.__testInput })
  assert(!result.error, result.error)
  equal(result.unsupported, [])
  assert(result.phases.includes('dispose'), 'The complete Image scenario must execute')
  for (const observation of result.observations) equal(observation.actual, observation.expected, observation.phase + '/' + observation.property)
})
await run()
