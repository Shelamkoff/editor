import assert from 'node:assert/strict'
import test from 'node:test'
import { I18n } from './I18n.js'

for (const value of ['$&', '$`', "$'", '$$', 'Price: $& / $$', '{second}']) {
  test(`interpolation preserves literal parameter ${JSON.stringify(value)}`, () => {
    const i18n = new I18n({ text: 'Hello {first}; {second}', plural: { one: '{first}', other: '{first}' } })
    assert.equal(i18n.t('text', { first: value, second: 'done' }), `Hello ${value}; done`)
    assert.equal(i18n.plural('plural', 2, { first: value }), value)
  })
}
