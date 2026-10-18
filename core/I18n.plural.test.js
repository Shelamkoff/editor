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
test('fallback English plural forms use English categories under Russian UI locale', () => {
  const i18n = new I18n(
    { primary: forms },
    { fallback: { one: '{count} item', other: '{count} items' } },
    'ru',
  )
  for (const [value, expected] of [
    [1, '1 item'], [2, '2 items'], [21, '21 items'], [101, '101 items'],
  ]) assert.equal(i18n.plural('fallback', value), expected)
  assert.equal(i18n.plural('primary', 21), 'one:21', 'primary language still uses Russian grammar')
})

test('late English fallback plugin translations retain English plural grammar after freeze', () => {
  const i18n = new I18n({ __lang: 'ru', existing: forms }, {}, 'ru')
  i18n.mergeFallback({ 'plugin.count': { one: 'One ({count})', other: 'Many ({count})' } })
  i18n.freeze()
  assert.equal(i18n.plural('plugin.count', 21), 'Many (21)')
  assert.equal(i18n.plural('plugin.count', 1), 'One (1)')
  assert.equal(i18n.plural('existing', 21), 'one:21')
})
