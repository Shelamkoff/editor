import { personModeCases, runPersonModeCase } from '../person-modes-parity-fixture.js'
import { printable, dispatchKey } from '../native-input-helpers.js'
import { test, assert, equal } from './harness.js'

const keys = { Enter: ['Enter', 'Enter', 13], End: ['End', 'End', 35], Home: ['Home', 'Home', 36],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39], z: ['z', 'KeyZ', 90] }
for (const specification of personModeCases) test(`Person mode parity ${specification.id}`, async () => {
  const result = await runPersonModeCase(specification, { native: async (action, value) => {
    if (action === 'type') await printable(value)
    else if (action === 'click') await window.__testInput('Input.click', value)
    else if (action === 'key') {
      const parts = value.split('+'), key = parts.pop(), code = keys[key]
      if (!code) throw new Error('Unexpected Person native key: ' + value)
      await dispatchKey(...code, (parts.includes('Control') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0))
    } else throw new Error('Unexpected Person native action: ' + action)
  } })
  ;(window.__personModeResults ??= []).push(result)
  assert(!result.unsupported, 'Current Person contract must be supported')
  assert(!result.error, JSON.stringify(result.error))
  equal(result.pageErrors, [], 'Person mode generated an unexpected page error')
  equal(result.diagnostics, [], 'Person mode generated an unexpected diagnostic')
  equal(result.completedPhases, result.plannedPhases, 'Person mode phases did not complete')
  equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Person mode contract failed')
  for (const observation of result.observations) equal(observation.actual, observation.expected,
    `${observation.phase}/${observation.property}: observed verdict changed after capture`)
})
