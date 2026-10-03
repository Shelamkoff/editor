import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('plugin-kit is a public core-independent extension boundary', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /(?:^|\n)\s*import[\s\S]*?['"]\.\.\/core\//)
  assert.doesNotMatch(source, /from\s+['"]\.\.\/core\//)
  assert.match(source, /shared\/sanitize/)
  assert.match(source, /shared\/richTextCodec/)
  assert.doesNotMatch(source, /setTrustedHtml|insertTrustedHtml/)
})
