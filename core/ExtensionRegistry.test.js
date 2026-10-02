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
      decode(input) { return { dataVersion: 1, data: { value: String(input.data?.value ?? '') } } },
      currentVersion: 1,
      legacyVersion: 1,
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
      decode(input) { return { dataVersion: 1, data: { value: String(input.data?.value ?? '') } } },
      currentVersion: 1,
      legacyVersion: 1,
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

  assert.equal(registry.getBlockDefinition('paragraph'), paragraph)
  assert.ok(registry.getBlockRuntime('paragraph'))
  assert.equal(registry.getInlineDefinition('mention'), mention)
  assert.equal(registry.getInlineByTrigger('@'), mention)
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
