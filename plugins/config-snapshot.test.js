import test from 'node:test'
import assert from 'node:assert/strict'
import * as plugins from './index.js'
import { createBlockPluginsAsync, preloadBlockPluginDefinitions } from './async.js'
const { createRawPlugin } = plugins

for (const [name, create] of [['list', createBlockPluginsAsync], ['map', preloadBlockPluginDefinitions]]) {
  test('Async ' + name + ' captures each requested configuration entry once before import', async () => {
    let reads = 0
    const configs = {
      get raw() {
        if (++reads > 1) throw new Error('requested config getter reread')
        return { injectStyles: false, css: 'https://example.test/host.css' }
      },
      get paragraph() { throw new Error('unrequested configuration accessed') },
    }
    const pending = create(['raw', 'raw'], configs)
    const immediateReads = reads
    // Observe an early rejection before an assertion can end the test.
    const outcome = await pending.then(definitions => ({ definitions }), error => ({ error }))
    assert.equal(immediateReads, 1)
    if (outcome.error) throw outcome.error
    const definitions = outcome.definitions
    const definition = Array.isArray(definitions) ? definitions[0] : definitions.get('raw')
    assert.deepEqual(definition.styles, ['https://example.test/host.css'])
    assert.equal(definitions.size ?? definitions.length, 1)
    assert.equal(reads, 1)
  })
}

test('Raw captures getter-backed style options once before validating and using them', () => {
  const reads = { injectStyles: 0, css: 0 }
  const config = {
    get injectStyles() {
      if (++reads.injectStyles > 1) throw new Error('injectStyles getter reread')
      return false
    },
    get css() {
      if (++reads.css > 1) throw new Error('css getter reread')
      return 'https://example.test/host.css'
    },
  }
  assert.deepEqual(createRawPlugin(config).styles, ['https://example.test/host.css'])
  assert.deepEqual(reads, { injectStyles: 1, css: 1 })
})

for (const [name, factory] of Object.entries(plugins)) {
  test(name + ' captures style getters once', () => {
    const reads = { injectStyles: 0, css: 0 }
    const config = {
      get injectStyles() {
        if (++reads.injectStyles > 1) throw new Error('injectStyles getter reread')
        return false
      },
      get css() {
        if (++reads.css > 1) throw new Error('css getter reread')
        return 'https://example.test/host.css'
      },
    }
    assert.deepEqual(factory(config).styles, ['https://example.test/host.css'])
    assert.deepEqual(reads, { injectStyles: 1, css: 1 })
    assert.ok(!Object.isFrozen(config))
  })
  test(name + ' ignores inherited style options without evaluating getters', () => {
    const prototype = {
      get injectStyles() { throw new Error('inherited injectStyles accessed') },
      get css() { throw new Error('inherited css accessed') },
    }
    const config = Object.create(prototype)
    assert.deepEqual(factory(config).styles, factory().styles)
  })
}

test('Paragraph validates its captured placeholder instead of rereading a getter', () => {
  let reads = 0
  plugins.createParagraphPlugin({
    get placeholder() {
      if (++reads > 1) throw new Error('placeholder getter reread')
      return 'Captured placeholder'
    },
  })
  assert.equal(reads, 1)
})

const arrayOptions = [
  ['createAttachesPlugin', 'actions'], ['createCarouselPlugin', 'actions'],
  ['createEmbedPlugin', 'actions'], ['createGalleryPlugin', 'actions'],
  ['createImagePlugin', 'actions'], ['createPersonPlugin', 'socialResolvers'],
]
for (const [name, key] of arrayOptions) {
  test(name + ' captures its ' + key + ' getter once', () => {
    let reads = 0
    const config = {
      get [key]() {
        if (++reads > 1) throw new Error(key + ' getter reread')
        return []
      },
    }
    assert.equal(plugins[name](config).type, plugins[name]().type)
    assert.equal(reads, 1)
  })
  test(name + ' ignores inherited ' + key + ' without running the getter', () => {
    const prototype = { get [key]() { throw new Error('inherited ' + key + ' accessed') } }
    assert.equal(plugins[name](Object.create(prototype)).type, plugins[name]().type)
  })
}
