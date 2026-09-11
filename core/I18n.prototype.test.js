// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { I18n } from './I18n.js'

test('I18n ignores inherited Object prototype keys', () => {
  const i18n = new I18n({ known: 'Known' })

  assert.equal(i18n.has('toString'), false)
  assert.equal(i18n.t('toString'), 'toString')
  assert.equal(i18n.has('constructor'), false)
  assert.equal(i18n.t('constructor'), 'constructor')
})

test('I18n merge cannot inject translations through __proto__', () => {
  const i18n = new I18n({ known: 'Known' })
  i18n.merge(JSON.parse('{"__proto__":{"polluted":"injected"}}'))

  assert.equal(i18n.has('polluted'), false)
  assert.equal(i18n.t('polluted'), 'polluted')
})

test('I18n fallback merge cannot inject translations through __proto__', () => {
  const i18n = new I18n({ known: 'Known' })
  i18n.mergeFallback(JSON.parse('{"__proto__":{"pollutedFallback":"injected"}}'))

  assert.equal(i18n.has('pollutedFallback'), false)
  assert.equal(i18n.t('pollutedFallback'), 'pollutedFallback')
})

test('I18n plural rules ignore inherited prototype language names', () => {
  const forms = { one: 'one', other: 'other' }

  for (const lang of ['__proto__', 'constructor', 'toString']) {
    const i18n = new I18n({ count: forms }, undefined, lang)
    assert.equal(i18n.plural('count', 1), 'one')
    assert.equal(i18n.plural('count', 2), 'other')
  }
})
