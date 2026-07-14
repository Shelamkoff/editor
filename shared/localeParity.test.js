import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import en from '../locale/en.js'
import ru from '../locale/ru.js'
import * as pluginPreset from '../plugins/index.js'
import { BLOCK_TYPES } from './blockTypes.js'

function localeKeys(locale) {
  return Object.keys(locale).filter(key => key !== '__lang').sort()
}

test('English and Russian aggregate locales expose the same non-empty keys', () => {
  assert.deepEqual(localeKeys(ru), localeKeys(en))
  for (const key of localeKeys(en)) {
    for (const [name, locale] of [['en', en], ['ru', ru]]) {
      const value = locale[key]
      if (typeof value === 'string') assert.ok(value.trim(), `${name}.${key} is empty`)
      else {
        assert.equal(typeof value, 'object', `${name}.${key} has an unsupported locale value`)
        assert.ok(Object.values(value).every(form => typeof form === 'string' && form.trim()), `${name}.${key} has an empty plural form`)
      }
    }
  }
})

test('literal block-plugin translation calls exist in both aggregate locales', async () => {
  const constructorsByType = new Map()
  for (const value of Object.values(pluginPreset)) {
    if (typeof value !== 'function') continue
    try {
      const plugin = new value()
      if (BLOCK_TYPES.includes(plugin.type) && !constructorsByType.has(plugin.type)) constructorsByType.set(plugin.type, value)
    } catch {
      // Non-plugin exports and constructors with unrelated requirements are ignored.
    }
  }

  const pathByType = new Map(BLOCK_TYPES.map(type => [type, type === 'linkPreview' ? 'link-preview' : type]))
  for (const type of BLOCK_TYPES) {
    assert.ok(constructorsByType.has(type), `the synchronous preset does not construct ${type}`)
    const source = await readFile(join(process.cwd(), 'plugins', pathByType.get(type), 'index.js'), 'utf8')
    const keys = new Set([
      ...[...source.matchAll(/\._(?:t|p)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
      ...[...source.matchAll(/this\._(?:t|p)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
    ])
    for (const key of keys) {
      if (key.startsWith('plugin.')) continue
      const full = `plugin.${type}.${key}`
      assert.ok(full in en, `${type} uses missing English locale key ${full}`)
      assert.ok(full in ru, `${type} uses missing Russian locale key ${full}`)
    }
  }
})
