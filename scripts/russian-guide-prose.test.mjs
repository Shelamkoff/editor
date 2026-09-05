import assert from 'node:assert/strict'
import test from 'node:test'
import { untranslatedGuideTerms } from './russian-guide-prose.mjs'

test('Russian guides may name build tools and their established API vocabulary', () => {
  assert.deepEqual(untranslatedGuideTerms('Для Vite и Nuxt: browser-native редактор, inline-плагины, runtime-ссылки и subpath.'), [])
})

test('unknown English prose remains a translation error', () => {
  assert.deepEqual(untranslatedGuideTerms('Текст. Please translate this sentence.'), ['please', 'translate', 'this', 'sentence'])
})

test('code, URLs and HTML attributes are not treated as translated prose', () => {
  assert.deepEqual(untranslatedGuideTerms('Пример `const opaqueName = 1`\n```js\nforeignCode()\n```\n[Ссылка](https://example.org/foreign) <span class="unknownClass">Текст</span>'), [])
})
