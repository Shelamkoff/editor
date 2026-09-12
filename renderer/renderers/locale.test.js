import assert from 'node:assert/strict'
import test from 'node:test'
import { localeText, localePluralText } from './locale.js'

test('renderer locale helpers ignore inherited values without evaluating them', () => {
  let reads = 0
  const prototype = {}
  for (const key of ['label', '__lang']) {
    Object.defineProperty(prototype, key, {
      configurable: true,
      get() { reads++; throw new Error(`inherited locale ${key} accessed`) },
    })
  }
  const locale = Object.create(prototype)
  assert.equal(localeText(locale, 'label', 'fallback'), 'fallback')
  assert.equal(localePluralText(locale, 'files', 1, 'fallback'), 'fallback')
  assert.equal(reads, 0)
})

test('renderer plural locale helper ignores inherited plural categories', () => {
  let reads = 0
  const formsPrototype = {}
  Object.defineProperty(formsPrototype, 'one', {
    configurable: true,
    get() { reads++; throw new Error('inherited plural form accessed') },
  })
  const forms = Object.create(formsPrototype)
  forms.other = 'files'
  const locale = { files: forms, __lang: 'en' }
  assert.equal(localePluralText(locale, 'files', 1, 'fallback'), 'files')
  assert.equal(reads, 0)
})
