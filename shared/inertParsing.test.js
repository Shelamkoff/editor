import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const editorRoot = new URL('../', import.meta.url)

test('untrusted HTML entry points parse through inert template content', async () => {
  const paths = [
    'shared/sanitize/sanitizeHtml.js',
    'shared/sanitize/parseInline.js',
    'core/clipboard/pasteInsert.js',
    'core/clipboard/pasteUtils.js',
  ]

  for (const path of paths) {
    const source = await readFile(new URL(path, editorRoot), 'utf8')
    assert.match(source, /document\.createElement\('template'\)/, `${path} must use an inert template`)
    assert.doesNotMatch(source, /document\.createElement\('div'\)\s*\n\s*\w+\.innerHTML\s*=\s*(?:html|text)/)
  }

  const pasteUtils = await readFile(new URL('core/clipboard/pasteUtils.js', editorRoot), 'utf8')
  assert.doesNotMatch(pasteUtils, /document\.createElement\('p'\)/)
})
