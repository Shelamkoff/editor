import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import en from '../locale/en.js'
import ru from '../locale/ru.js'
import * as pluginPreset from '../plugins/index.js'
import { createColorSwatchPlugin } from '../inline-plugins/color.js'
import { createMentionPlugin } from '../inline-plugins/mention/index.js'
import { BLOCK_TYPES } from './blockTypes.js'

function localeKeys(locale) {
  return Object.keys(locale).filter(key => key !== '__lang').sort()
}

function assertLocaleKey(key,label) {
  assert.ok(Object.hasOwn(en,key), `${label} uses missing English locale key ${key}`)
  assert.ok(Object.hasOwn(ru,key), `${label} uses missing Russian locale key ${key}`)
}

function literalRuntimeKeys(source) {
  return new Set([
    ...[...source.matchAll(/runtimeContext\.t\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
  ])
}

test('English and Russian aggregate locales expose the same non-empty keys and no obsolete inline namespace', () => {
  assert.deepEqual(localeKeys(ru), localeKeys(en))
  for (const key of localeKeys(en)) {
    assert.equal(key.startsWith('inline.'), false, `obsolete inline locale namespace returned: ${key}`)
    for (const [name, locale] of [['en', en], ['ru', ru]]) {
      const value = locale[key]
      if (typeof value === 'string') assert.ok(value.trim(), `${name}.${key} is empty`)
      else {
        assert.equal(typeof value, 'object', `${name}.${key} has an unsupported locale value`)
        assert.ok(
          Object.values(value).every(form => typeof form === 'string' && form.trim()),
          `${name}.${key} has an empty plural form`,
        )
      }
    }
  }
})

test('every synchronous block factory resolves labels and runtime translation calls through plugin.<type>', async () => {
  const factories = Object.entries(pluginPreset)
    .filter(([name,value]) => /^create.+Plugin$/.test(name) && typeof value === 'function')
  const definitions = factories.map(([,factory]) => factory())
  const byType = new Map(definitions.map(definition => [definition.type,definition]))

  assert.deepEqual(
    [...byType.keys()].sort(),
    [...BLOCK_TYPES].sort(),
    'synchronous plugin preset must expose every canonical block factory exactly once',
  )

  const pathByType = new Map(BLOCK_TYPES.map(type => [type, type === 'linkPreview' ? 'link-preview' : type]))
  for (const type of BLOCK_TYPES) {
    const definition = byType.get(type)
    assert.ok(definition, `missing block definition ${type}`)
    assert.equal(typeof definition.label?.key, 'string', `${type} label must be locale-backed`)
    assertLocaleKey(`plugin.${type}.${definition.label.key}`, type)

    const source = await readFile(join(process.cwd(), 'plugins', pathByType.get(type), 'index.js'), 'utf8')
    for (const key of literalRuntimeKeys(source)) {
      assert.equal(key.startsWith('plugin.'), false, `${type} must use local runtime translation keys`)
      assertLocaleKey(`plugin.${type}.${key}`, type)
    }
  }
})

test('inline definitions resolve labels and runtime translation calls through inlinePlugin.<type>', async () => {
  const definitions = [
    createColorSwatchPlugin(),
    createMentionPlugin(),
  ]
  const pathByType = new Map([
    ['color', join(process.cwd(), 'inline-plugins', 'color.js')],
    ['mention', join(process.cwd(), 'inline-plugins', 'mention', 'index.js')],
  ])

  for (const definition of definitions) {
    assert.equal(typeof definition.label?.key, 'string')
    assertLocaleKey(`inlinePlugin.${definition.type}.${definition.label.key}`, definition.type)
    const source = await readFile(pathByType.get(definition.type), 'utf8')
    for (const key of literalRuntimeKeys(source)) {
      assert.equal(key.startsWith('inlinePlugin.'), false, `${definition.type} must use local runtime translation keys`)
      assertLocaleKey(`inlinePlugin.${definition.type}.${key}`, definition.type)
    }
  }

  assert.equal(en['inlinePlugin.mention.noResults'], 'No results found')
  assert.equal(ru['inlinePlugin.mention.noResults'], 'Ничего не найдено')
  assert.equal(en['inlinePlugin.mention.loading'], 'Loading...')
  assert.equal(ru['inlinePlugin.mention.loading'], 'Загрузка...')
})
