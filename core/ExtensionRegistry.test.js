import test from 'node:test'
import assert from 'node:assert/strict'

import { ExtensionRegistry } from './ExtensionRegistry.js'

function documentStub() {
  const links = []
  return {
    links,
    head: {
      appendChild(node) { links.push(node) },
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        dataset: {},
        remove() {
          const index = links.indexOf(this)
          if (index >= 0) links.splice(index, 1)
        },
      }
    },
  }
}

function blockDefinition(type, options = {}) {
  const calls = options.calls ?? []
  return Object.freeze({
    type,
    label: Object.freeze({ key: 'title', fallback: type }),
    icon: '',
    styles: Object.freeze(options.styles ?? []),
    schema: {
      createDefault() { return { value: '' } },
      encode(data) { return { dataVersion: 1, data: { value: String(data.value ?? '') } } },
      decode(input) {
        if (input.dataVersion !== 1) throw new RangeError('unsupported data version')
        return { dataVersion: 1, data: { value: String(input.data?.value ?? '') } }
      },
      currentVersion: 1,
    },
    setup(context) {
      calls.push(['setup', type, context.isDefaultBlock, context.editorPlaceholder])
      return {
        create() { throw new Error('not used') },
        destroy() { calls.push(['destroy', type]) },
      }
    },
  })
}

function inlineDefinition(type, trigger, options = {}) {
  const calls = options.calls ?? []
  return Object.freeze({
    type,
    label: Object.freeze({ key: 'title', fallback: type }),
    icon: '',
    trigger,
    styles: Object.freeze(options.styles ?? []),
    schema: {
      createDefault() { return { value: '' } },
      encode(data) { return { dataVersion: 1, data: { value: String(data.value ?? '') } } },
      decode(input) {
        if (input.dataVersion !== 1) throw new RangeError('unsupported data version')
        return { dataVersion: 1, data: { value: String(input.data?.value ?? '') } }
      },
      currentVersion: 1,
    },
    setup() {
      calls.push(['setup-inline', type])
      return {
        create() { throw new Error('not used') },
        destroy() { calls.push(['destroy-inline', type]) },
      }
    },
  })
}

test('ExtensionRegistry accepts only unique immutable definition identities', () => {
  const doc = documentStub()
  assert.throws(
    () => new ExtensionRegistry({
      ownerDocument: doc,
      blocks: [blockDefinition('paragraph'), blockDefinition('paragraph')],
    }),
    /Duplicate block definition type: paragraph/,
  )
  assert.throws(
    () => new ExtensionRegistry({
      ownerDocument: doc,
      blocks: [blockDefinition('paragraph')],
      inline: [inlineDefinition('mention', '@'), inlineDefinition('mention', '#')],
    }),
    /Duplicate inline definition type: mention/,
  )
  assert.throws(
    () => new ExtensionRegistry({
      ownerDocument: doc,
      blocks: [blockDefinition('paragraph')],
      inline: [inlineDefinition('mention', '@'), inlineDefinition('tag', '@')],
    }),
    /Duplicate inline trigger: @/,
  )
})

test('ExtensionRegistry resolves default block deterministically and validates defaults', () => {
  const doc = documentStub()
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('heading'), blockDefinition('paragraph')],
  })
  assert.equal(registry.defaultBlockType, 'paragraph')
  registry.destroy()

  const first = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('heading')],
  })
  assert.equal(first.defaultBlockType, 'heading')
  first.destroy()

  assert.throws(
    () => new ExtensionRegistry({
      ownerDocument: doc,
      blocks: [blockDefinition('paragraph')],
      defaultBlock: 'missing',
    }),
    /Default block type is not registered: missing/,
  )
})

test('ExtensionRegistry creates editor-scoped runtimes and releases styles exactly once', () => {
  const doc = documentStub()
  const calls = []
  const paragraph = blockDefinition('paragraph', { calls, styles: ['a.css'] })
  const mention = inlineDefinition('mention', '@', { calls, styles: ['b.css'] })
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [paragraph],
    inline: [mention],
    defaultBlock: 'paragraph',
    placeholder: 'Write',
    translate(key, fallback) { return key === 'plugin.paragraph.title' ? 'Text' : fallback },
  })

  const paragraphSnapshot = registry.getBlockDefinition('paragraph')
  const mentionSnapshot = registry.getInlineDefinition('mention')
  assert.notEqual(paragraphSnapshot, paragraph)
  assert.notEqual(mentionSnapshot, mention)
  assert.ok(Object.isFrozen(paragraphSnapshot))
  assert.ok(Object.isFrozen(mentionSnapshot))
  assert.ok(registry.getBlockRuntime('paragraph'))
  assert.equal(registry.getInlineByTrigger('@'), mentionSnapshot)
  assert.equal(doc.links.length, 2)
  assert.deepEqual(calls[0], ['setup', 'paragraph', true, 'Write'])

  registry.destroy()
  registry.destroy()
  assert.equal(doc.links.length, 0)
  assert.equal(calls.filter(call => call[0] === 'destroy').length, 1)
  assert.equal(calls.filter(call => call[0] === 'destroy-inline').length, 1)
})

test('ExtensionRegistry rejects sparse definitions and invalid inline triggers', () => {
  const doc = documentStub()
  const blocks = [blockDefinition('paragraph')]
  blocks.length = 2
  assert.throws(
    () => new ExtensionRegistry({ ownerDocument: doc, blocks }),
    /blocks must be a dense non-empty array/,
  )
  assert.throws(
    () => new ExtensionRegistry({
      ownerDocument: doc,
      blocks: [blockDefinition('paragraph')],
      inline: [inlineDefinition('mention', '@@')],
    }),
    /trigger must be exactly one Unicode code point/,
  )
})


test('ExtensionRegistry global style acquisition may be disabled without changing definitions', () => {
  const doc = documentStub()
  const paragraph = blockDefinition('paragraph', { styles: ['a.css'] })
  const mention = inlineDefinition('mention', '@', { styles: ['b.css'] })
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [paragraph],
    inline: [mention],
    acquireStyles: false,
  })

  assert.deepEqual(paragraph.styles, ['a.css'])
  assert.deepEqual(mention.styles, ['b.css'])
  assert.equal(doc.links.length, 0)
  registry.destroy()
  assert.equal(doc.links.length, 0)
})


test('ExtensionRegistry snapshots mutable descriptor members and schema identity once', () => {
  const doc = documentStub()
  const reads = {
    type: 0, label: 0, icon: 0, styles: 0, schema: 0, capabilities: 0, setup: 0,
    currentVersion: 0, createDefault: 0, decode: 0, encode: 0,
  }
  const schema = {}
  Object.defineProperties(schema, {
    currentVersion: { enumerable: true, get() { reads.currentVersion++; return 1 } },
    createDefault: { enumerable: true, get() { reads.createDefault++; return () => ({ value: '' }) } },
    decode: { enumerable: true, get() { reads.decode++; return input => ({ dataVersion: 1, data: { value: String(input.data?.value ?? '') } }) } },
    encode: { enumerable: true, get() { reads.encode++; return data => ({ dataVersion: 1, data: { value: String(data.value ?? '') } }) } },
  })
  const capabilities = {
    empty: { isEmpty(data) { return data.value === '' } },
  }
  const source = {}
  Object.defineProperties(source, {
    type: { enumerable: true, get() { reads.type++; return 'probe' } },
    label: { enumerable: true, get() { reads.label++; return { key: 'title', fallback: 'Probe' } } },
    icon: { enumerable: true, get() { reads.icon++; return '' } },
    styles: { enumerable: true, get() { reads.styles++; return [] } },
    schema: { enumerable: true, get() { reads.schema++; return schema } },
    capabilities: { enumerable: true, get() { reads.capabilities++; return capabilities } },
    setup: {
      enumerable: true,
      get() {
        reads.setup++
        return () => ({ create() { throw new Error('not used') }, destroy() {} })
      },
    },
  })

  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [source], acquireStyles: false })
  assert.deepEqual(reads, {
    type: 1, label: 1, icon: 1, styles: 1, schema: 1, capabilities: 1, setup: 1,
    currentVersion: 1, createDefault: 1, decode: 1, encode: 1,
  })

  capabilities.empty.isEmpty = () => false
  Object.defineProperty(schema, 'currentVersion', { value: 99 })
  const snapshot = registry.getBlockDefinition('probe')
  assert.equal(snapshot.schema.currentVersion, 1)
  assert.equal(snapshot.capabilities.empty.isEmpty({ value: '' }), true)
  assert.deepEqual(snapshot.schema.encode({ value: 'x' }), { dataVersion: 1, data: { value: 'x' } })
  registry.destroy()
})

test('ExtensionRegistry destroys an invalid returned runtime before rejecting it', () => {
  const doc = documentStub()
  let destroyed = 0
  const source = blockDefinition('probe')
  const definition = {
    ...source,
    setup() {
      return {
        create: null,
        destroy() { destroyed++ },
      }
    },
  }
  assert.throws(
    () => new ExtensionRegistry({ ownerDocument: doc, blocks: [definition], acquireStyles: false }),
    /invalid runtime/,
  )
  assert.equal(destroyed, 1)
})

test('ExtensionRegistry rejects removed schema compatibility members before setup', () => {
  const doc = documentStub()
  let setupCalls = 0
  const source = blockDefinition('probe')
  const definition = {
    ...source,
    schema: { ...source.schema, legacyVersion: 1 },
    setup() {
      setupCalls++
      return { create() { throw new Error('not used') }, destroy() {} }
    },
  }
  assert.throws(
    () => new ExtensionRegistry({ ownerDocument: doc, blocks: [definition], acquireStyles: false }),
    /removed compatibility options/,
  )
  assert.equal(setupCalls, 0)
})

test('ExtensionRegistry uses inlinePlugin locale namespace without inline alias fallback', () => {
  const doc = documentStub()
  const keys = []
  const mention = inlineDefinition('mention', '@')
  const definition = {
    ...mention,
    setup(context) {
      context.t('title', 'Mention')
      return { create() { throw new Error('not used') }, destroy() {} }
    },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('paragraph')],
    inline: [definition],
    acquireStyles: false,
    translate(key, fallback) {
      keys.push(key)
      return fallback
    },
  })
  assert.deepEqual(keys, ['inlinePlugin.mention.title'])
  registry.destroy()
})
