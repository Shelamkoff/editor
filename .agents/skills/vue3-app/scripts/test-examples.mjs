// Execute the pure TypeScript URL parsers embedded in the actual skill reference.
// Requires Node with TypeScript stripping; no Vue runtime behavior is tested here.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'

const source = new URL('../../vue-pinia-best-practices/reference/state-url-for-ephemeral-filters.md', import.meta.url)
const markdown = await readFile(source, 'utf8')
const block = markdown.match(/^```ts\r?\n([\s\S]*?)^```\s*$/m)
assert.ok(block, 'The URL reference must contain its executable TypeScript example')
const directory = await mkdtemp(join(tmpdir(), 'ecom-skill-example-'))
after(() => rm(directory, { recursive: true, force: true }))
await writeFile(join(directory, 'package.json'), '{"type":"module"}\n')
const target = join(directory, 'url-example.ts')
await writeFile(target, block[1])
const { readFlag, readPage } = await import(pathToFileURL(target).href)

test('textual false and zero are false, not truthy strings', () => {
  assert.equal(readFlag('false'), false)
  assert.equal(readFlag('0'), false)
})
test('supported true encodings', () => {
  assert.equal(readFlag('true'), true)
  assert.equal(readFlag('1'), true)
})
test('ambiguous flag inputs remain undefined', () => {
  for (const value of [undefined, null, [], ['false'], ['true', 'false'], '', 'yes', 'FALSE', false, 0]) {
    assert.equal(readFlag(value), undefined)
  }
})
test('valid pages respect the supplied contract limit', () => {
  assert.equal(readPage('2', 20), 2)
  assert.equal(readPage('20', 20), 20)
  assert.equal(readPage('002', 20), 2)
})
test('partial, negative and non-integral strings are not accepted', () => {
  for (const value of ['2bad', '-2', '1.5', '1e2', ' 2 ', '', '0', '21']) {
    assert.equal(readPage(value, 20), 1)
  }
})
test('absent, repeated and non-string page values use the defined fallback', () => {
  for (const value of [undefined, null, ['2'], ['2', '3'], 2, {}, true]) {
    assert.equal(readPage(value, 20), 1)
  }
})
test('unsafe and infinite numeric conversions are rejected', () => {
  assert.equal(readPage('9007199254740992', Number.MAX_SAFE_INTEGER), 1)
  assert.equal(readPage('9'.repeat(400), Number.MAX_SAFE_INTEGER), 1)
})
test('invalid maximum is a contract error, not a hidden parser fallback', () => {
  for (const maximum of [0, -1, 1.2, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => readPage('2', maximum), RangeError)
  }
})
