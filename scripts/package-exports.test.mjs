import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('theme CSS exports support explicit extensions without breaking extensionless imports', () => {
  assert.equal(manifest.exports['./styles/themes/*.css'], './dist/core/themes/*.css')
  assert.equal(manifest.exports['./styles/themes/*'], './dist/core/themes/*.css')
})
