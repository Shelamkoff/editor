import { test, assert, equal } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { codeSourceLanguageCases, runCodeSourceLanguageCase } from '../code-source-language-parity-fixture.js'

const keys = { Home: ['Home', 36], ArrowRight: ['ArrowRight', 39], ArrowLeft: ['ArrowLeft', 37],
  ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], Tab: ['Tab', 9], Enter: ['Enter', 13], Escape: ['Escape', 27], z: ['KeyZ', 90] }
for (const specification of codeSourceLanguageCases) {
  test(`Code source-language parity ${specification.id}`, async () => {
    const result = await runCodeSourceLanguageCase(specification, { native: async (action, value) => {
      if (action === 'type') { for (const character of value) await printable(character) }
      else if (action === 'click') await window.__testInput('Input.click', value)
      else if (action === 'key') {
        const parts = value.split('+'), key = parts.at(-1), [code, number] = keys[key]
        await dispatchKey(key, code, number, (parts.includes('Control') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0))
      } else throw new Error(`Unknown Code input action: ${action}`)
    } })
    assert(!result.error, result.error)
    equal(result.pageErrors, [], 'Code control raised a page error')
    equal(result.completedPhases, result.plannedPhases, 'Code case did not complete its phase plan')
    equal(result.observations.filter(value => value.status !== 'PASS'), [], 'Code source/language contract failed')
    for (const value of result.observations) equal(value.actual, value.expected, `Recorded verdict differs at ${value.phase}/${value.property}`)
  })
}
