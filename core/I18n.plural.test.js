import assert from 'node:assert/strict'
import test from 'node:test'
import { I18n } from './I18n.js'

const forms = { one: 'one:{count}', few: 'few:{count}', many: 'many:{count}', other: 'other:{count}' }

test('Russian plural forms use the absolute integer value and other for fractions', () => {
  const i18n = new I18n({ amount: forms }, undefined, 'ru')
  for (const [value, expected] of [
    [-21, 'one:-21'], [-2, 'few:-2'], [-1, 'one:-1'],
    [0, 'many:0'], [1, 'one:1'], [2, 'few:2'], [5, 'many:5'],
    [11, 'many:11'], [12, 'many:12'], [21, 'one:21'],
    [1.5, 'other:1.5'], [-2.5, 'other:-2.5'], [0.1, 'other:0.1'],
  ]) assert.equal(i18n.plural('amount', value), expected)
})

test('English plural selection ignores the sign but interpolation preserves it', () => {
  const i18n = new I18n({ amount: forms }, undefined, 'en')
  assert.equal(i18n.plural('amount', -1), 'one:-1')
  assert.equal(i18n.plural('amount', -2), 'other:-2')
  assert.equal(i18n.plural('amount', 1.5), 'other:1.5')
})

test('English and Russian integer categories agree with the platform plural rules', () => {
  for (const lang of ['en', 'ru']) {
    const i18n = new I18n({ amount: forms }, undefined, lang)
    const rules = new Intl.PluralRules(lang)
    for (let value = -150; value <= 150; value++) {
      assert.equal(i18n.plural('amount', value), `${rules.select(value)}:${value}`)
    }
  }
})
