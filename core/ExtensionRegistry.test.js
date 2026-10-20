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

for (const completion of ['promise', 'callable thenable', 'throwing then']) {
  test('registry rejects ' + completion + ' setup and releases captured cleanup', async () => {
    const ownerDocument = documentStub()
    let destroyed = 0
    const failure = new Error('Then getter failed')
    const source = completion === 'promise' ? Promise.reject(new Error('Late setup failure'))
      : completion === 'callable thenable' ? Object.assign(() => {}, { then(_resolve, reject) { reject(new Error('Late callable failure')) } })
        : { get then() { throw failure } }
    Object.assign(source, { destroy() { destroyed++ }, create() { throw new Error('Must not activate') } })
    const definition = { ...blockDefinition('probe'), styles: ['/probe.css'], setup() { return source } }
    assert.throws(() => new ExtensionRegistry({ ownerDocument, blocks: [definition] }),
      completion === 'throwing then' ? error => error === failure : /synchronous/)
    assert.equal(destroyed, 1)
    assert.equal(ownerDocument.links.length, 0)
    await new Promise(resolve => setImmediate(resolve))
  })
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

test('ExtensionRegistry accepts only unique definition types', () => {
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
    currentVersion: { enumerable: true, configurable: true, get() { reads.currentVersion++; return 1 } },
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
    TypeError,
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
    TypeError,
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


test('ExtensionRegistry snapshots mutable descriptor, schema and capability members once', () => {
  const doc = documentStub()
  const reads = Object.create(null)
  const seen = []
  const schema = {}
  for (const [key, value] of Object.entries({
    currentVersion: 1,
    createDefault() { return { value: '' } },
    encode(data) { return { dataVersion: 1, data: { value: String(data.value ?? '') } } },
    decode(input) { return { dataVersion: 1, data: { value: String(input.data?.value ?? '') } } },
  })) {
    Object.defineProperty(schema, key, {
      enumerable: true,
      configurable: true,
      get() {
        reads['schema.' + key] = (reads['schema.' + key] ?? 0) + 1
        return value
      },
    })
  }

  const empty = {}
  Object.defineProperty(empty, 'isEmpty', {
    enumerable: true,
    configurable: true,
    get() {
      reads['empty.isEmpty'] = (reads['empty.isEmpty'] ?? 0) + 1
      return function(data) {
        seen.push(this === empty)
        return data.value === ''
      }
    },
  })

  const definition = {}
  const members = {
    type: 'probe',
    label: { key: 'title', fallback: 'Probe' },
    icon: '',
    styles: [],
    schema,
    capabilities: { empty },
    setup() {
      seen.push(this === definition)
      return {
        create() { throw new Error('not used') },
        destroy() {},
      }
    },
  }
  for (const [key, value] of Object.entries(members)) {
    Object.defineProperty(definition, key, {
      enumerable: true,
      configurable: true,
      get() {
        reads['definition.' + key] = (reads['definition.' + key] ?? 0) + 1
        return value
      },
    })
  }

  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [definition] })
  const snap = registry.getBlockDefinition('probe')
  assert.equal(snap.type, 'probe')
  assert.equal(snap.schema.currentVersion, 1)
  assert.equal(snap.capabilities.empty.isEmpty({ value: '' }), true)
  assert.deepEqual(seen, [true, true])

  for (const [key, count] of Object.entries(reads)) {
    assert.equal(count, 1, key + ' was observed more than once')
  }

  Object.defineProperty(definition, 'type', { enumerable: true, value: 'mutated' })
  Object.defineProperty(schema, 'currentVersion', { enumerable: true, value: 99 })
  Object.defineProperty(empty, 'isEmpty', { enumerable: true, value: () => false })

  assert.equal(registry.getBlockDefinition('probe').type, 'probe')
  assert.equal(registry.getBlockDefinition('probe').schema.currentVersion, 1)
  assert.equal(registry.getBlockDefinition('probe').capabilities.empty.isEmpty({ value: '' }), true)
  registry.destroy()
})

test('ExtensionRegistry uses inlinePlugin locale namespace', () => {
  const doc = documentStub()
  let translated = null
  const inline = inlineDefinition('mention', '@')
  const source = { ...inline }
  source.setup = context => {
    translated = context.t('title', 'fallback')
    return {
      create() { throw new Error('not used') },
      destroy() {},
    }
  }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('paragraph')],
    inline: [source],
    translate(key, fallback) {
      return key === 'inlinePlugin.mention.title' ? 'Mention translated' : fallback
    },
  })

  assert.equal(translated, 'Mention translated')
  registry.destroy()
})

test('ExtensionRegistry exact schema wrapper rejects later wrong-version results', () => {
  const doc = documentStub()
  let bad = false
  const schema = {
    currentVersion: 1,
    createDefault() { return { value: '' } },
    encode(data) {
      return { dataVersion: bad ? 2 : 1, data: { value: String(data.value ?? '') } }
    },
    decode(input) {
      return { dataVersion: bad ? 2 : 1, data: { value: String(input.data?.value ?? '') } }
    },
  }
  const definition = {
    type: 'probe',
    label: { key: 'title', fallback: 'Probe' },
    icon: '',
    schema,
    setup() {
      return { create() { throw new Error('not used') }, destroy() {} }
    },
  }
  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [definition] })
  bad = true
  const snap = registry.getBlockDefinition('probe')
  assert.throws(() => snap.schema.encode({ value: 'x' }), /emit currentVersion/)
  assert.throws(
    () => snap.schema.decode({ dataVersion: 1, data: { value: 'x' } }),
    /preserve currentVersion/,
  )
  registry.destroy()
})


test('ExtensionRegistry snapshots structural htmlImport capability methods', () => {
  const doc = documentStub()
  let matches = 0
  let imports = 0
  const htmlImport = {
    matchesRoot(element) {
      matches++
      return element?.tagName === 'P'
    },
    importRoot(element, context) {
      imports++
      return { value: context.serializeRichText(element) }
    },
  }
  const source = {
    ...blockDefinition('probe'),
    capabilities: { htmlImport },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [source],
    acquireStyles: false,
  })
  const snap = registry.getBlockDefinition('probe').capabilities.htmlImport
  htmlImport.matchesRoot = () => false
  htmlImport.importRoot = () => ({ value: 'mutated' })

  const element = { tagName: 'P' }
  assert.equal(snap.matchesRoot(element), true)
  assert.equal(snap.importRoot(element, { serializeRichText: () => 'safe' }).value, 'safe')
  assert.equal(matches, 1)
  assert.equal(imports, 1)
  registry.destroy()
})


test('ExtensionRegistry snapshots clipboard slice capability methods', () => {
  const doc = documentStub()
  let calls = 0
  const clipboard = {
    slice(data, context) {
      calls++
      return {
        parts: [{ kind: 'local-block', data: { value: data.value } }],
        remaining: null,
        focus: context.field('value') ? { fieldKey: 'value', offset: 0 } : null,
      }
    },
  }
  const source = {
    ...blockDefinition('probe'),
    capabilities: { clipboard },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [source],
    acquireStyles: false,
  })
  const snap = registry.getBlockDefinition('probe').capabilities.clipboard
  clipboard.slice = () => { throw new Error('mutated') }
  const result = snap.slice(
    { value: 'owned' },
    { createId: prefix => prefix + '-id', field: () => ({ selected: 'x' }) },
  )
  assert.equal(result.parts[0].data.value, 'owned')
  assert.equal(calls, 1)
  registry.destroy()
})

test('ExtensionRegistry snapshots explicit cross-block conversion grouping independently of payload import', () => {
  const conversion = { selectionMode: 'single', export: data => ({ kind: 'rich-text', data }), canImport: () => true, import: payload => payload.data }
  const definition = { ...blockDefinition('media'), capabilities: { conversion } }
  const registry = new ExtensionRegistry({ ownerDocument: documentStub(), blocks: [definition] })
  conversion.selectionMode = 'per-block'
  const stored = registry.getBlockDefinition('media').capabilities.conversion
  assert.equal(stored.selectionMode, 'single')
  assert.equal(stored.canImport({ kind: 'rich-text', data: { text: 'Caption' } }), true)
  assert.ok(Object.isFrozen(stored))
  for (const mode of ['per-block', undefined]) {
    const capability = { ...conversion, selectionMode: mode }
    const current = new ExtensionRegistry({ ownerDocument: documentStub(), blocks: [{ ...definition, capabilities: { conversion: capability } }] })
    assert.equal(current.getBlockDefinition('media').capabilities.conversion.selectionMode, mode ?? 'single')
  }
  for (const mode of ['guess', null, false]) {
    assert.throws(() => new ExtensionRegistry({ ownerDocument: documentStub(), blocks: [{ ...definition, capabilities: { conversion: { ...conversion, selectionMode: mode } } }] }), /selectionMode must be single or per-block/)
  }
})


test('ExtensionRegistry reads conversion grouping accessor once when snapshotting a definition', () => {
  let reads = 0
  const conversion = {
    get selectionMode() { return ++reads === 1 ? 'single' : 'per-block' },
    export: data => ({ kind: 'rich-text', data }),
    canImport: () => true,
    import: payload => payload.data,
  }
  const registry = new ExtensionRegistry({ ownerDocument: documentStub(), blocks: [{ ...blockDefinition('probe'), capabilities: { conversion } }] })
  assert.equal(registry.getBlockDefinition('probe').capabilities.conversion.selectionMode, 'single')
  assert.equal(reads, 1)
  registry.destroy()
})

test('ExtensionRegistry snapshots the optional single-target selection join method', () => {
  let calls = 0
  const conversion = {
    selectionMode: 'single',
    export: data => ({ kind: 'plain-text', data }),
    canImport: () => true,
    import: payload => payload.data,
    joinSelection(payloads, context) { calls++; assert.equal(this, conversion); assert.equal(context.ownerDocument, doc); return { kind: 'plain-text', data: { text: payloads.map(payload => payload.data.text).join('\n') } } },
  }
  const doc = documentStub()
  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [{ ...blockDefinition('probe'), capabilities: { conversion } }] })
  const stored = registry.getBlockDefinition('probe').capabilities.conversion
  conversion.joinSelection = () => { throw new Error('mutated joiner') }
  assert.deepEqual(stored.joinSelection([{ kind: 'plain-text', data: { text: 'Alpha' } }, { kind: 'plain-text', data: { text: 'Bravo' } }], { ownerDocument: doc }), { kind: 'plain-text', data: { text: 'Alpha\nBravo' } })
  assert.equal(calls, 1)
  registry.destroy()
})

test('ExtensionRegistry captures native inline reconciliation with its source receiver',()=>{
  let calls=0
  const editing={
    handle(){return null},
    reconcileNative(input,data){
      assert.equal(this,editing)
      calls++
      return {kind:'update',data:{...data,value:input.text}}
    },
  }
  const doc=documentStub()
  const registry=new ExtensionRegistry({
    ownerDocument:doc,
    blocks:[blockDefinition('paragraph')],
    inline:[{...inlineDefinition('mention','@'),editing}],
    acquireStyles:false,
  })
  const snapshot=registry.getInlineDefinition('mention').editing
  editing.reconcileNative=()=>{throw new Error('reassigned native method')}
  assert.deepEqual(snapshot.reconcileNative(
    {inputType:'deleteWordBackward',beforeText:'@A',text:'@'}, {value:'A'}),
  {kind:'update',data:{value:'@'}})
  assert.equal(calls,1)
  registry.destroy()
})

test('ExtensionRegistry rejects asynchronous native inline decision and invalid method shape',()=>{
  const source={...inlineDefinition('mention','@')}
  for(const native of [null,17,'not-a-method']){
    assert.throws(()=>new ExtensionRegistry({
      ownerDocument:documentStub(),blocks:[blockDefinition('paragraph')],
      inline:[{...source,editing:{handle(){return null},reconcileNative:native}}],
      acquireStyles:false,
    }),/reconcileNative must be a function/)
  }
  const registry=new ExtensionRegistry({
    ownerDocument:documentStub(),blocks:[blockDefinition('paragraph')],
    inline:[{...source,editing:{
      handle(){return null},
      reconcileNative(){return Promise.resolve({kind:'remove'})},
    }}],acquireStyles:false,
  })
  assert.throws(()=>registry.getInlineDefinition('mention').editing.reconcileNative(
    {inputType:'deleteWordBackward',beforeText:'@A',text:''},{value:'A'}),
  /synchronously/)
  registry.destroy()
})

test('HTML import single-root intent snapshots exactly once and rejects invalid flags',()=>{
  const base=blockDefinition('probe')
  let reads=0,mutable=true
  const cap={
    matchesRoot(){return true},
    importRoot(){return {value:'prepared'}},
  }
  Object.defineProperty(cap,'inlineWhenSingleRoot',{get(){reads++;return mutable}})
  const registry=new ExtensionRegistry({ownerDocument:documentStub(),blocks:[
    {...base,capabilities:{htmlImport:cap}},
  ]})
  const captured=registry.getBlockDefinition('probe').capabilities.htmlImport
  assert.equal(reads,1,'HTML import intent getter was read more than once')
  assert.equal(captured.inlineWhenSingleRoot,true)
  assert.equal(Object.isFrozen(captured),true)
  mutable=false
  assert.equal(captured.inlineWhenSingleRoot,true,'registered import intent was mutable')
  registry.destroy()
  assert.throws(()=>new ExtensionRegistry({ownerDocument:documentStub(),blocks:[
    {...base,capabilities:{htmlImport:{
      matchesRoot(){return true},
      importRoot(){return {value:'prepared'}},
      inlineWhenSingleRoot:'truthy',
    }}},
  ]}),/inlineWhenSingleRoot must be a boolean/)
})

for (const [kind, customize] of [
  ['block definition', source => {
    Object.defineProperty(source, 'futureUnusedBlockOption', {
      enumerable: true, get() { throw new Error('unrecognized block getter was evaluated') },
    })
  }],
  ['block label', source => {
    source.label = {
      key: 'label', fallback: 'Paragraph',
      get futureUnusedLabelOption() { throw new Error('unrecognized label getter was evaluated') },
    }
  }],
  ['block capabilities', source => {
    source.capabilities = {
      formatting: { inlineTools: true },
      get futureUnusedCapability() { throw new Error('unrecognized capability getter was evaluated') },
    }
  }],
  ['toolbox item', source => {
    source.toolbox = [{
      id: 'variant', label: { key: 'variant', fallback: 'Variant' }, icon: '',
      get futureUnusedToolboxProperty() { throw new Error('unrecognized toolbox getter was evaluated') },
    }]
  }],
  ['inline definition', source => {
    source.inline = true
  }],
]) {
  test('ExtensionRegistry ignores unrecognized enumerable descriptor getters: ' + kind, () => {
    const doc = documentStub()
    const source = { ...blockDefinition('paragraph') }
    customize(source)
    const inputs = kind === 'inline definition'
      ? (() => {
          const inline = { ...inlineDefinition('mention', '@') }
          Object.defineProperty(inline, 'futureUnusedInlineOption', {
            enumerable: true,
            get() { throw new Error('unrecognized inline getter was evaluated') },
          })
          return { blocks: [blockDefinition('paragraph')], inline: [inline] }
        })()
      : { blocks: [source] }
    const registry = new ExtensionRegistry({
      ownerDocument: doc, acquireStyles: false, ...inputs,
    })
    try {
      assert.equal(registry.hasBlock('paragraph'), true)
      assert.equal(registry.hasInline('mention'), kind === 'inline definition')
    } finally {
      registry.destroy()
    }
  })
}

test('ExtensionRegistry snapshots registration arrays without caller map or iterator', () => {
  const blocks = [blockDefinition('paragraph'), blockDefinition('quote')]
  const inline = [inlineDefinition('mention', '@')]
  for (const array of [blocks, inline]) {
    array.map = () => { throw new Error('caller map must not execute') }
    array[Symbol.iterator] = () => { throw new Error('caller iterator must not execute') }
  }
  const registry = new ExtensionRegistry({
    ownerDocument: documentStub(), blocks, inline, acquireStyles: false,
  })
  try {
    assert.deepEqual(registry.blockTypes, ['paragraph', 'quote'])
    assert.deepEqual(registry.inlineTypes, ['mention'])
  } finally { registry.destroy() }
})

test('ExtensionRegistry snapshots toolbox arrays without executing overridden map', () => {
  const toolbox = [{
    id: 'custom', icon: '', label: { key: 'custom', fallback: 'Custom block' },
  }]
  toolbox.map = () => { throw new Error('toolbox map must not execute') }
  toolbox[Symbol.iterator] = () => { throw new Error('toolbox iterator must not execute') }
  const source = { ...blockDefinition('paragraph'), toolbox }
  const registry = new ExtensionRegistry({
    ownerDocument: documentStub(), blocks: [source], acquireStyles: false,
  })
  try {
    assert.deepEqual(registry.getBlockDefinition('paragraph').toolbox.map(item => item.id), ['custom'])
  } finally { registry.destroy() }
})

test('ExtensionRegistry snapshots inline paste pattern arrays by index, not caller map', () => {
  const patterns = [/^#[a-f0-9]{6}$/gi]
  patterns.map = () => { throw new Error('inline paste map must not execute') }
  patterns[Symbol.iterator] = () => { throw new Error('inline paste iterator must not execute') }
  const inline = {
    ...inlineDefinition('mention', '@'),
    paste: { patterns, fromMatch: value => ({ value }) },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: documentStub(), blocks: [blockDefinition('paragraph')],
    inline: [inline], acquireStyles: false,
  })
  try {
    const captured = registry.getInlineDefinition('mention').paste.patterns
    assert.equal(captured.length, 1)
    assert.equal(captured[0].source, '^#[a-f0-9]{6}$')
    assert.equal(captured[0].flags, 'gi')
    assert.notEqual(captured[0], patterns[0], 'registry retained mutable source RegExp')
  } finally { registry.destroy() }
})

test('ExtensionRegistry snapshots formatting and stylesheet arrays without caller iteration', () => {
  const inlineTools = ['bold']
  const styles = ['/component.css']
  for (const array of [inlineTools, styles]) {
    array[Symbol.iterator] = () => { throw new Error('extension iterator must not execute') }
  }
  const source = {
    ...blockDefinition('paragraph'),
    styles, capabilities: { formatting: { inlineTools } },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: documentStub(), blocks: [source], acquireStyles: false,
  })
  try {
    assert.deepEqual([...registry.getBlockDefinition('paragraph').styles], ['/component.css'])
    assert.deepEqual([...registry.getBlockDefinition('paragraph').capabilities.formatting.inlineTools], ['bold'])
  } finally { registry.destroy() }
})

for (const capabilityName of ['settings', 'inlineControls']) {
  test('ExtensionRegistry captures ' + capabilityName + ' label accessor only once', () => {
    let reads = 0
    const capability = {
      kind: 'actions',
      actions() { return [] },
      apply(data) { return data },
      get label() {
        reads++
        if (reads > 1) throw new Error('settings label accessor evaluated more than once')
        return { key: 'actions', fallback: 'Block actions' }
      },
    }
    const source = {
      ...blockDefinition('paragraph'),
      capabilities: { [capabilityName]: capability },
    }
    const registry = new ExtensionRegistry({
      ownerDocument: documentStub(), blocks: [source], acquireStyles: false,
    })
    try {
      const prepared = registry.getBlockDefinition('paragraph').capabilities[capabilityName]
      assert.equal(prepared.label.fallback, 'Block actions')
      assert.equal(reads, 1)
    } finally { registry.destroy() }
  })
}


test('extension registries share a newly acquired stylesheet when the previous editor is destroyed from DOM append', () => {
  const doc = documentStub()
  const previous = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('previous', { styles: ['/previous.css'] })],
  })
  const append = doc.head.appendChild
  let retired = false
  doc.head.appendChild = link => {
    append(link)
    if (!retired && link.href === '/new.css') {
      retired = true
      previous.destroy()
    }
  }

  const current = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('current', { styles: ['/new.css'] })],
  })
  const next = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('current', { styles: ['/new.css'] })],
  })

  assert.deepEqual(doc.links.map(link => link.href), ['/new.css'],
    'the previous editor teardown orphaned the new editor CSS ledger')
  current.destroy()
  assert.deepEqual(doc.links.map(link => link.href), ['/new.css'],
    'first editor teardown removed CSS still owned by the second editor')
  next.destroy()
  assert.deepEqual(doc.links, [], 'final CSS owner must remove the shared link')
})


test('ExtensionRegistry teardown releases all runtimes and CSS even if owner AbortController throws', () => {
  const doc = documentStub()
  const callbacks = []
  let aborts = 0
  class ThrowingOwnerAbortController {
    signal = { aborted: false }
    abort() {
      aborts++
      this.signal.aborted = true
      throw new Error('owner abort adapter failed')
    }
  }
  doc.defaultView = { AbortController: ThrowingOwnerAbortController }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [blockDefinition('first', { styles: ['/first.css'], calls: callbacks }),
      blockDefinition('second', { styles: ['/second.css'], calls: callbacks })],
    inline: [inlineDefinition('mention', '@', { styles: ['/mention.css'], calls: callbacks })],
  })
  assert.equal(doc.links.length, 3)

  assert.doesNotThrow(() => registry.destroy())
  assert.equal(aborts, 1)
  assert.equal(doc.links.length, 0, 'a failed owner abort leaked extension styles')
  assert.equal(callbacks.filter(([action]) => action === 'destroy').length, 2,
    'the failed abort skipped block runtime cleanup')
  assert.equal(callbacks.filter(([action]) => action === 'destroy-inline').length, 1,
    'the failed abort skipped inline runtime cleanup')
  registry.destroy()
  assert.equal(aborts, 1, 'the retired owner should not abort twice')
})


test('failed extension setup retains its original error when owner abort also fails', () => {
  const doc = documentStub()
  const disposed = []
  let aborts = 0
  class ThrowingOwnerAbortController {
    signal = { aborted: false }
    abort() {
      aborts++
      this.signal.aborted = true
      throw new Error('owner abort adapter failed')
    }
  }
  doc.defaultView = { AbortController: ThrowingOwnerAbortController }
  const valid = {
    ...blockDefinition('valid'),
    styles: ['/valid.css'],
    setup() {
      return {
        create() { throw new Error('must not run') },
        destroy() { disposed.push('valid') },
      }
    },
  }
  const invalid = {
    ...blockDefinition('invalid'),
    setup() { throw new Error('extension setup failed') },
  }

  assert.throws(
    () => new ExtensionRegistry({ ownerDocument: doc, blocks: [valid, invalid] }),
    /extension setup failed/,
  )
  assert.deepEqual(disposed, ['valid'], 'failed setup did not release a prior runtime')
  assert.deepEqual(doc.links, [], 'failed setup did not release a prior stylesheet')
  assert.equal(aborts, 1)
})


test('ExtensionRegistry owns definition snapshots before invoking an owner AbortController constructor', () => {
  const doc = documentStub()
  const definitions = [blockDefinition('intended')]
  let allocations = 0
  class MutatingAbortController {
    signal = { aborted: false }
    constructor() {
      allocations++
      definitions[0] = blockDefinition('substituted')
    }
    abort() { this.signal.aborted = true }
  }
  doc.defaultView = { AbortController: MutatingAbortController }
  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: definitions })
  assert.equal(allocations, 1)
  assert.deepEqual(registry.blockTypes, ['intended'],
    'owner-realm constructor modified the caller array before registration owned it')
  assert.equal(registry.defaultBlockType, 'intended')
  assert.equal(registry.hasBlock('substituted'), false)
  registry.destroy()
})

test('invalid extension definitions fail before allocating owner AbortController resources', () => {
  const doc = documentStub()
  let allocations = 0
  class OwnerAbortController {
    signal = { aborted: false }
    constructor() { allocations++ }
    abort() { this.signal.aborted = true }
  }
  doc.defaultView = { AbortController: OwnerAbortController }
  const invalid = { ...blockDefinition('probe'), icon: 4 }
  assert.throws(
    () => new ExtensionRegistry({ ownerDocument: doc, blocks: [invalid] }),
    /icon must be a string/,
  )
  assert.equal(allocations, 0,
    'a rejected definition needlessly created an owner-realm cancellation resource')
})


test('retained block and inline runtime methods are revoked after ExtensionRegistry destroy', () => {
  const doc = documentStub()
  const calls = { blockCreate: 0, inlineCreate: 0, trigger: 0, inlineKeydown: 0, destroy: 0 }
  const block = {
    ...blockDefinition('paragraph'),
    setup() {
      return {
        create() { calls.blockCreate++; return { id: 'block-instance' } },
        destroy() { calls.destroy++ },
      }
    },
  }
  const inline = {
    ...inlineDefinition('mention', '@'),
    setup() {
      return {
        create() { calls.inlineCreate++; return { id: 'inline-instance' } },
        onTriggerQuery() { calls.trigger++; return null },
        onTriggerKeydown() { calls.inlineKeydown++; return null },
        destroy() { calls.destroy++ },
      }
    },
  }
  const registry = new ExtensionRegistry({
    ownerDocument: doc,
    blocks: [block],
    inline: [inline],
  })
  const blockRuntime = registry.getBlockRuntime('paragraph')
  const inlineRuntime = registry.getInlineRuntime('mention')
  assert.ok(blockRuntime.create())
  assert.ok(inlineRuntime.create())
  inlineRuntime.onTriggerQuery('a')
  inlineRuntime.onTriggerKeydown({ key: 'ArrowDown' })
  assert.deepEqual(calls, {
    blockCreate: 1, inlineCreate: 1, trigger: 1, inlineKeydown: 1, destroy: 0,
  })

  registry.destroy()
  assert.equal(calls.destroy, 2)
  assert.throws(() => blockRuntime.create(), /destroyed|revoked/i)
  assert.throws(() => inlineRuntime.create(), /destroyed|revoked/i)
  assert.throws(() => inlineRuntime.onTriggerQuery('late'), /destroyed|revoked/i)
  assert.throws(() => inlineRuntime.onTriggerKeydown({ key: 'Enter' }), /destroyed|revoked/i)
  assert.deepEqual(calls, {
    blockCreate: 1, inlineCreate: 1, trigger: 1, inlineKeydown: 1, destroy: 2,
  }, 'retired runtime method invoked the extension producer')
  blockRuntime.destroy()
  inlineRuntime.destroy()
  assert.equal(calls.destroy, 2, 'retained destroy handles must remain idempotent')
})


test('direct runtime teardown revokes retained create and inline trigger methods', () => {
  const doc = documentStub()
  let invoked = 0
  let disposed = 0
  const block = {
    ...blockDefinition('paragraph'),
    setup() {
      return {
        create() { invoked++; return { valid: true } },
        destroy() { disposed++ },
      }
    },
  }
  const inline = {
    ...inlineDefinition('mention', '@'),
    setup() {
      return {
        create() { invoked++; return { valid: true } },
        onTriggerCancel() { invoked++; return null },
        destroy() { disposed++ },
      }
    },
  }
  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [block], inline: [inline] })
  const blockRuntime = registry.getBlockRuntime('paragraph')
  const inlineRuntime = registry.getInlineRuntime('mention')
  blockRuntime.destroy()
  inlineRuntime.destroy()

  assert.throws(() => blockRuntime.create(), /destroyed|revoked/i)
  assert.throws(() => inlineRuntime.create(), /destroyed|revoked/i)
  assert.throws(() => inlineRuntime.onTriggerCancel(), /destroyed|revoked/i)
  assert.equal(invoked, 0)
  assert.equal(disposed, 2)
  registry.destroy()
  assert.equal(disposed, 2, 'registry teardown must not double-dispose retired plugin runtimes')
})


test('inline popup callback remains bound to its owner and rejects a retired editor', () => {
  const doc = documentStub()
  let showPopup
  let mounted = 0
  let cleaned = 0
  let lastOwner
  const inline = {
    ...inlineDefinition('mention', '@'),
    setup(context) {
      showPopup = context.showPopup
      return {
        create() { throw new Error('not used') },
        destroy() {},
      }
    },
  }
  const options = {
    ownerDocument: doc,
    blocks: [blockDefinition('paragraph')],
    inline: [inline],
    showPopup(owner, anchor, content) {
      lastOwner = owner
      mounted++
      return { close() {} }
    },
  }
  const registry = new ExtensionRegistry(options)
  assert.equal(typeof showPopup, 'function')
  const first = showPopup({}, {}, () => { cleaned++ })
  assert.equal(typeof first.close, 'function')
  assert.equal(mounted, 1)
  options.showPopup = () => { throw new Error('mutable host popup callback was consulted') }
  const second = showPopup({}, {}, () => { cleaned++ })
  assert.equal(typeof second.close, 'function')
  assert.equal(mounted, 2, 'the established host popup handler was not retained')
  assert.equal(typeof lastOwner, 'object')

  registry.destroy()
  const retired = showPopup({}, {}, () => { cleaned++ })
  assert.equal(typeof retired.close, 'function')
  retired.close()
  assert.equal(mounted, 2, 'a retired inline extension published a popup')
  assert.equal(cleaned, 1, 'a declined popup did not release its incoming resource')
})


test('runtime block and inline create operations reject asynchronous instance factories', async () => {
  const doc = documentStub()
  let blocks = 0
  let inlines = 0
  const block = {
    ...blockDefinition('paragraph'),
    setup() {
      return {
        create() {
          blocks++
          return Promise.resolve({ element: null })
        },
        destroy() {},
      }
    },
  }
  const inline = {
    ...inlineDefinition('mention', '@'),
    setup() {
      return {
        create() {
          inlines++
          return Promise.reject(new Error('late inline instance error'))
        },
        destroy() {},
      }
    },
  }
  const registry = new ExtensionRegistry({ ownerDocument: doc, blocks: [block], inline: [inline] })
  try {
    assert.throws(
      () => registry.getBlockRuntime('paragraph').create({ value: '' }, {}),
      /must complete synchronously/,
      'async block creation was allowed despite the synchronous BlockPluginRuntime contract',
    )
    assert.throws(
      () => registry.getInlineRuntime('mention').create('widget', { value: '' }, {}),
      /must complete synchronously/,
      'async widget creation was allowed despite the synchronous InlinePluginRuntime contract',
    )
    assert.equal(blocks, 1)
    assert.equal(inlines, 1)
    await Promise.resolve()
    await Promise.resolve()
  } finally {
    registry.destroy()
  }
})
