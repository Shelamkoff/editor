import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const guide = await readFile(new URL('docs/guide/getting-started.md', root), 'utf8')
const guideRu = await readFile(new URL('docs/ru/guide/getting-started.md', root), 'utf8')

test('Node engine contract matches the Vite 7 build floor in both guides', () => {
  assert.equal(manifest.engines.node, '^20.19.0 || >=22.12.0')
  assert.match(guide, /Node\.js 20\.19\+ or 22\.12\+/)
  assert.match(guideRu, /Node\.js 20\.19\+ или 22\.12\+/)
})
