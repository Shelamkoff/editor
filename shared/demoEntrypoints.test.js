import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const editorRoot = new URL('../', import.meta.url)

const expectedPackages = [
  '@shelamkoff/event-bus',
  '@shelamkoff/color-picker',
  '@shelamkoff/cropper',
  '@shelamkoff/carousel',
  '@shelamkoff/expose',
]

test('browser entry point uses relative editor modules and maps published dependencies', async () => {
  for (const path of ['index.html']) {
    const html = await readFile(new URL(path, editorRoot), 'utf8')
    const importMapSource = html.match(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/i)?.[1]
    assert.ok(importMapSource, `${path} must map published package dependencies for direct browser use`)
    const importMap = JSON.parse(importMapSource)
    assert.deepEqual(Object.keys(importMap.imports ?? {}), expectedPackages, `${path} has an incomplete dependency import map`)
    for (const target of Object.values(importMap.imports)) {
      assert.match(target, /^\.\.\//, `${path} import-map target must stay workspace-relative: ${target}`)
    }
    for (const match of html.matchAll(/\b(?:import|export)\s+[^;\n]*?\sfrom\s*['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^\.\.?\//, `${path} contains bare module import ${match[1]}`)
    }
  }
})
