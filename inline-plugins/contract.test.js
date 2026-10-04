import test from 'node:test'
import assert from 'node:assert/strict'

import { createColorSwatchPlugin, createColorSwatchRenderer } from './color.js'
import { createMentionPlugin, createMentionRenderer } from './mention/index.js'

const factories=[
  ['color',createColorSwatchPlugin,createColorSwatchRenderer],
  ['mention',createMentionPlugin,createMentionRenderer],
]

for(const [type,createPlugin,createRenderer] of factories){
  test(`${type} inline plugin and renderer share one exact current schema`,()=>{
    const definition=createPlugin()
    const renderer=createRenderer()
    assert.equal(definition.type,type)
    assert.equal(renderer.type,type)
    assert.strictEqual(renderer.schema,definition.schema)
    assert.ok(Number.isSafeInteger(definition.schema.currentVersion))
    assert.ok(definition.schema.currentVersion>=1)
    const encoded=definition.schema.encode(definition.schema.createDefault())
    assert.equal(encoded.dataVersion,definition.schema.currentVersion)
    const decoded=definition.schema.decode(encoded)
    assert.equal(decoded.dataVersion,definition.schema.currentVersion)
    assert.deepEqual(decoded.data,encoded.data)
    assert.equal(Object.isFrozen(definition),true)
  })
}
