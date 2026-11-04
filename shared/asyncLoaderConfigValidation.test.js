import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { loadBlockPluginDefinition, preloadBlockPluginDefinitions, createBlockPluginsAsync } from '../plugins/async.js'
import { createRendererAsync, loadRendererFactory, preloadRendererFactories, createDefaultRenderersAsync } from '../renderer/renderers/async.js'

for (const helper of ['preloadBlockPluginDefinitions', 'createBlockPluginsAsync']) {
  for (const later of ['invalid-shape', 'throwing-getter']) {
    test(`${helper} contains an earlier nested config rejection when a later config has ${later}`, () => {
      const source = `
        import { ${helper} as operation } from ${JSON.stringify(new URL('../plugins/async.js', import.meta.url).href)}
        const unhandled = [], earlier = new Error('Earlier nested config failure'), later = new Error('Later config failure')
        process.on('unhandledRejection', reason => unhandled.push(reason === earlier ? 'earlier' : String(reason)))
        let reads = 0
        const configs = { paragraph: { actions: [Object.defineProperty({}, 'label', {
          enumerable: true, get() { reads++; throw earlier },
        })] } }
        if (${JSON.stringify(later)} === 'invalid-shape') configs.heading = null
        else Object.defineProperty(configs, 'heading', { get() { throw later } })
        let failure
        try { await operation(['paragraph', 'heading'], configs) } catch (error) {
          failure = { name: error.name, message: error.message, sameLater: error === later }
        }
        await new Promise(resolve => setImmediate(resolve))
        await new Promise(resolve => setImmediate(resolve))
        const recovered = await operation(['paragraph'])
        const types = recovered instanceof Map ? [...recovered.keys()] : recovered.map(value => value.type)
        console.log(JSON.stringify({ reads, failure, unhandled, types }))
      `
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
        encoding: 'utf8', windowsHide: true,
        env: { ...process.env, NODE_TEST_CONTEXT: '' },
      })
      assert.equal(child.error, undefined)
      assert.equal(child.status, 0, child.stderr)
      assert.equal(child.stderr, '')
      assert.deepEqual(JSON.parse(child.stdout), {
        reads: 1,
        failure: later === 'invalid-shape'
          ? { name: 'TypeError', message: 'configs.heading must be an object', sameLater: false }
          : { name: 'Error', message: 'Later config failure', sameLater: true },
        unhandled: [], types: ['paragraph'],
      })
    })
  }
}

test('async plugin helpers reject malformed source and configuration shapes', async () => {
  await assert.rejects(() => preloadBlockPluginDefinitions('paragraph'), TypeError)
  await assert.rejects(() => preloadBlockPluginDefinitions({ version: '2.0.0', blocks: 'paragraph' }), /blocks must be an array/)
  await assert.rejects(() => createBlockPluginsAsync(['paragraph'], 'invalid'), /configs must be an object/)
  await assert.rejects(() => createBlockPluginsAsync(['paragraph'], { paragraph: 'invalid' }), /configs.paragraph must be an object/)
})

test('async renderer helpers reject malformed public argument shapes', async () => {
  await assert.rejects(() => preloadRendererFactories('paragraph'), TypeError)
  await assert.rejects(() => preloadRendererFactories({ version: '2.0.0', blocks: 'paragraph' }), /blocks must be an array/)
  await assert.rejects(() => createRendererAsync('paragraph', 42), /classPrefix must be a string/)
  await assert.rejects(() => createRendererAsync('paragraph', 'x', []), /locale must be an object/)
  await assert.rejects(() => createDefaultRenderersAsync('x', {}, ['paragraph'], []), /configs must be an object/)
})


test('async preset config maps ignore inherited block type keys', async () => {
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'paragraph', {
    enumerable: true,
    get() { reads++; throw new Error('inherited paragraph config accessed') },
  })
  const configs = Object.create(prototype)

  const plugins = await createBlockPluginsAsync(['paragraph'], configs)
  assert.equal(plugins.length, 1)
  const renderers = await createDefaultRenderersAsync('x', {}, ['paragraph'], configs)
  assert.equal(renderers.size, 1)
  assert.equal(reads, 0)
})


test('async preset document sources ignore inherited block collections and types', async () => {
  let blocksReads = 0
  const sourcePrototype = {}
  Object.defineProperty(sourcePrototype, 'blocks', {
    enumerable: true,
    get() { blocksReads++; throw new Error('inherited blocks accessed') },
  })
  const source = Object.create(sourcePrototype)

  await assert.rejects(() => preloadBlockPluginDefinitions(source), TypeError)
  await assert.rejects(() => preloadRendererFactories(source), TypeError)
  assert.equal(blocksReads, 0)

  let typeReads = 0
  const blockPrototype = {}
  Object.defineProperty(blockPrototype, 'type', {
    enumerable: true,
    get() { typeReads++; return 'paragraph' },
  })
  const inheritedTypeSource = { version: '2.0.0', blocks: [Object.create(blockPrototype)] }

  await assert.rejects(() => preloadBlockPluginDefinitions(inheritedTypeSource), TypeError)
  await assert.rejects(() => preloadRendererFactories(inheritedTypeSource), TypeError)
  assert.equal(typeReads, 0)
})


test('async loader registries reject inherited getters before reading them', async () => {
  const key = '__rectorAuditInheritedLoader__'
  let reads = 0
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    get() { reads++; throw new Error('inherited loader accessed') },
  })
  try {
    await assert.rejects(() => loadBlockPluginDefinition(key), /Unknown editor block plugin type/)
    await assert.rejects(() => loadRendererFactory(key), /Unknown editor renderer type/)
    assert.equal(reads, 0)
  } finally {
    delete Object.prototype[key]
  }
})


test('async explicit type lists reject inherited sparse entries without reading them', async () => {
  let reads = 0
  const prototype = Object.create(Array.prototype)
  Object.defineProperty(prototype, '0', {
    configurable: true,
    get() { reads++; return 'paragraph' },
  })
  const types = []
  Object.setPrototypeOf(types, prototype)
  types.length = 1

  await assert.rejects(() => preloadBlockPluginDefinitions(types), RangeError)
  await assert.rejects(() => preloadRendererFactories(types), RangeError)
  assert.equal(reads, 0)
})


test('async document presets require current metadata, exact-decode known blocks, and ignore unknown current types', async () => {
  const current = {
    version: '2.0.0',
    blocks: [
      { id: 'p', type: 'paragraph', dataVersion: 2, data: { text: 'A' } },
      { id: 'opaque', type: 'not-installed', dataVersion: 9, data: { x: 1 } },
    ],
  }

  const plugins = await preloadBlockPluginDefinitions(current)
  const renderers = await preloadRendererFactories(current)
  assert.deepEqual([...plugins.keys()], ['paragraph'])
  assert.deepEqual([...renderers.keys()], ['paragraph'])

  await assert.rejects(
    () => preloadBlockPluginDefinitions({
      version: '2.0.0',
      blocks: [{ id: 'p', type: 'paragraph', dataVersion: 1, data: { text: 'old' } }],
    }),
    /Unsupported block "paragraph" data version 1/,
  )
  await assert.rejects(
    () => preloadRendererFactories({
      version: '2.0.0',
      blocks: [{ id: 'p', type: 'paragraph', dataVersion: 1, data: { text: 'old' } }],
    }),
    /Unsupported block "paragraph" data version 1/,
  )
})
