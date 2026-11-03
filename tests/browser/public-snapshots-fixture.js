export const publicSnapshotCases = []
for (const mode of ['editable', 'read-only']) for (const query of ['get', 'at', 'list', 'iterator']) for (const target of ['known', 'unknown']) {
  publicSnapshotCases.push({ id: ['read', mode, query, target].join('/'), kind: 'read', mode, query, target })
}
for (const query of ['get', 'at', 'list', 'iterator']) publicSnapshotCases.push({ id: 'update/' + query, kind: 'update', mode: 'editable', query, target: 'known' })
for (const mode of ['editable', 'read-only']) publicSnapshotCases.push({ id: 'catalog/' + mode, kind: 'catalog', mode })
for (const step of ['before-first', 'after-first']) publicSnapshotCases.push({ id: 'retired-iterator/' + step, kind: 'retired-iterator', mode: 'editable', step })
for (const mutation of ['render', 'remove']) publicSnapshotCases.push({ id: 'iterator/' + mutation + '-status', kind: 'iterator-status', mode: 'editable', mutation })
const pause = () => new Promise(resolve => setTimeout(resolve, 25))
const copy = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const owns = () => JSON.parse('{"nested":{"value":7},"tags":["kept"],"__proto__":{"literal":true},"constructor":"own"}')
function records(legacy = false, updated = false) {
  const result = ['a', 'b', 'c'].map((id, index) => ({ id, type: index === 1 ? 'future-block' : 'paragraph',
    ...(!legacy ? { dataVersion: index === 1 ? 7 : 2 } : {}), ...(index ? { revision: index === 1 ? 17 : 'wire-c' } : {}),
    data: index === 1 ? { text: 'Opaque', rows: [{ cells: [{ text: 'Nested', metadata: { alignment: 'left' } }] }], own: owns() }
      : { text: index === 0 ? updated ? '<b>Updated</b> {{opaque}}' : '<b>Alpha</b> &amp; {{opaque}}' : 'Tail' },
    tunes: { textAlign: 'right', layout: { gap: 2 } }, inline: { opaque: { type: 'future-inline', ...(!legacy ? { dataVersion: 3 } : {}), data: owns() } } }))
  return result
}
function expectedSnapshot(block) {
  return { ...copy(block), status: block.type === 'future-block' ? 'unregistered' : 'active' }
}
export async function runPublicSnapshotCase({ sourceBase = '../../', legacy = false, spec }) {
  if (spec.kind === 'iterator-status') return runSnapshotIteratorCase({ sourceBase, legacy, spec })
  const base = new URL(sourceBase, import.meta.url)
  const [core, paragraph] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js'].map(path => import(new URL(path, base))))
  const observations = [], diagnostics = [], unsupported = [], transactions = [], completedPhases = []
  const check = (phase, property, actual, expected) => {
    const a = copy(actual), e = copy(expected)
    observations.push({ phase, property, actual: a, expected: e, status: same(a, e) ? 'PASS' : 'FAIL' })
  }
  const holder = document.createElement('section'); document.body.append(holder)
  const make = () => {
    const editor = core.createEditor({ holder, inlineTools: [], injectStyles: false,
      plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()],
      data: { version: legacy ? '1.0.5' : '2.0.0', blocks: records(legacy) }, onDiagnostic: value => diagnostics.push(value) })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    return editor
  }
  const denied = operation => { try { operation(); return false } catch (error) { return error instanceof Error && error.message === 'Editor is destroyed' } }
  let editor, old, phase = 'load'
  const planned = legacy ? ['legacy-control', 'dispose'] : ['load', spec.kind, 'dispose']
  try {
    editor = make(); await pause()
    if (spec.mode === 'read-only') editor.setReadOnly(true)
    if (legacy) {
      phase = 'legacy-control'
      const api = editor.blocks
      api.setCurrentIndex(0)
      check(phase, 'actualLegacyCatalog', { count: api.getBlockCount(), byId: api.getBlockById('a')?.id,
        byIndex: api.getBlockByIndex(0)?.id, index: api.getBlockIndex('a'), current: api.getCurrentBlock()?.id, ids: [...api].map(block => block.id) },
      { count: 3, byId: 'a', byIndex: 'a', index: 0, current: 'a', ids: ['a', 'b', 'c'] })
      check(phase, 'actualLegacyAuthorText', editor.save().blocks[0].data.text, '<b>Alpha</b> &amp; {{opaque}}')
      unsupported.push({ property: 'currentDetachedSnapshotContract', reason: 'Legacy exposes live PublicBlockView controls; current nested snapshot payload/revision/status methods are not emulated. Actual old known/unknown catalog and saved author text execute.' })
      completedPhases.push(phase)
    } else {
      const api = editor.blocks
      check(phase, 'canonical', editor.save().blocks, records()); check(phase, 'history', [editor.canUndo, editor.canRedo], [false, false]); completedPhases.push(phase)
      phase = spec.kind
      const index = spec.target === 'unknown' ? 1 : 0
      const query = () => spec.query === 'get' ? [api.get(index ? 'b' : 'a')]
        : spec.query === 'at' ? [api.at(index)] : spec.query === 'list' ? api.list() : [...api]
      const expected = updated => (spec.query === 'get' || spec.query === 'at' ? [records(false, updated)[index]] : records(false, updated))
        .map(block => expectedSnapshot(block))
      if (spec.kind === 'read') {
        const first = query(), second = query(), before = copy(second)
        check(phase, 'snapshots', first, expected(false)); check(phase, 'secondSnapshots', second, expected(false))
        check(phase, 'frozenEnvelopes', first.map(value => Object.isFrozen(value)), first.map(() => true))
        check(phase, 'listFrozen', Object.isFrozen(first), spec.query === 'list')
        check(phase, 'mutableNestedPayload', first.map(value => [Object.isFrozen(value.data), Object.isFrozen(value.tunes.layout), Object.isFrozen(value.inline.opaque.data.nested)]), first.map(() => [false, false, false]))
        check(phase, 'noLiveDom', first.map(value => 'element' in value || 'contentElement' in value), first.map(() => false))
        let deniedId = false
        try { first[0].id = 'forged' } catch (error) { deniedId = error instanceof TypeError }
        check(phase, 'immutableId', deniedId, true)
        for (const value of first) {
          value.data.text = 'caller mutation'
          if (value.data.rows) value.data.rows[0].cells[0].metadata.alignment = 'right'
          value.tunes.layout.gap = 99
          value.inline.opaque.data.nested.value = 99
          value.inline.opaque.data.tags.push('caller')
          value.inline.opaque.data.__proto__.literal = false
        }
        check(phase, 'otherReadUnchanged', second, before); check(phase, 'freshReadUnchanged', query(), expected(false))
        check(phase, 'canonicalUnchanged', editor.save().blocks, records()); check(phase, 'history', [editor.canUndo, editor.canRedo, transactions.length], [false, false, 0])
      } else if (spec.kind === 'update') {
        const retained = query()
        let producerInput
        api.update('a', current => { producerInput = current; return { data: { text: '<b>Updated</b> {{opaque}}' } } })
        check(phase, 'producerInput', producerInput, expectedSnapshot(records()[0]))
        check(phase, 'retainedSnapshot', retained, expected(false)); check(phase, 'freshSnapshot', query(), expected(true))
        check(phase, 'canonical', editor.save().blocks, records(false, true)); check(phase, 'history', [editor.canUndo, editor.canRedo], [true, false])
        producerInput.data.text = 'retained producer mutation'; retained[0].tunes.layout.gap = 99
        check(phase, 'retainedInputDetached', editor.save().blocks, records(false, true))
        check(phase, 'undo', editor.undo(), true); check(phase, 'undoCanonical', editor.save().blocks, records())
        check(phase, 'redo', editor.redo(), true); check(phase, 'redoCanonical', editor.save().blocks, records(false, true))
        check(phase, 'retainedProducerOriginal', producerInput.tunes.layout.gap, 2)
      } else if (spec.kind === 'catalog') {
        api.setCurrent('a')
        check(phase, 'catalog', { count: api.count, current: api.currentId, indices: ['a', 'b', 'c', 'missing'].map(id => api.indexOf(id)), ids: api.list().map(block => block.id) },
          { count: 3, current: 'a', indices: [0, 1, 2, -1], ids: ['a', 'b', 'c'] })
        api.setCurrent('c'); check(phase, 'newCurrent', api.currentId, 'c')
        check(phase, 'missingReads', [api.get('missing') === undefined, api.at(-1) === undefined, api.at(3) === undefined], [true, true, true])
        check(phase, 'canonicalUnchanged', editor.save().blocks, records()); check(phase, 'history', [editor.canUndo, editor.canRedo, transactions.length], [false, false, 0])
      } else {
        const iterator = api[Symbol.iterator]()
        if (spec.step === 'after-first') check(phase, 'first', iterator.next().value, expectedSnapshot(records()[0]))
        old = editor; old.destroy(); editor = make(); await pause()
        check(phase, 'iteratorDenied', denied(() => iterator.next()), true)
        check(phase, 'oldApiDenied', [() => api.get('a'), () => api.at(0), () => api.list(), () => api.count, () => api.currentId, () => api.indexOf('a')].map(denied), [true, true, true, true, true, true])
        check(phase, 'successorCanonical', editor.save().blocks, records()); check(phase, 'successorHistory', [editor.canUndo, editor.canRedo, transactions.length], [false, false, 0])
      }
      completedPhases.push(phase)
    }
    phase = 'dispose'; editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, observations, diagnostics, transactions, unsupported, planned, completedPhases, error: null }
  } catch (error) { return { id: spec.id, spec, observations, diagnostics, transactions, unsupported, planned, completedPhases, phase, error: String(error?.stack ?? error) } }
  finally { editor?.destroy(); old?.destroy(); holder.remove() }
}

async function runSnapshotIteratorCase({ sourceBase, legacy, spec }) {
  const [core, paragraph] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js'].map(path => import(new URL(path, new URL(sourceBase, import.meta.url)))))
  const observations = [], diagnostics = [], unsupported = [], transactions = [], completedPhases = []
  const check = (phase, property, actual, expected) => {
    const a = copy(actual), e = copy(expected)
    observations.push({ phase, property, actual: a, expected: e, status: same(a, e) ? 'PASS' : 'FAIL' })
  }
  const para = (id, text) => ({ id, type: 'paragraph', ...(!legacy ? { dataVersion: 2 } : {}), data: { text } })
  const initial = [para('a', 'Alpha'), spec.mutation === 'render'
    ? { id: 'b', type: 'future-block', ...(!legacy ? { dataVersion: 7 } : {}), data: { text: 'Old Bravo' } } : para('b', 'Old Bravo')]
  const updated = spec.mutation === 'render' ? [para('b', 'New Bravo')] : [para('a', 'Alpha')]
  const planned = legacy ? ['legacy-control', 'dispose'] : ['load', 'change', 'iterate', 'dispose']
  const holder = document.createElement('section'); document.body.append(holder)
  let editor, phase = 'load'
  try {
    editor = core.createEditor({ holder, inlineTools: [], injectStyles: false, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin()],
      onDiagnostic: value => diagnostics.push(value), data: { version: legacy ? '1.0.5' : '2.0.0', blocks: initial } })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
    if (legacy) {
      phase = 'legacy-control'; check(phase, 'actualLegacyIteratorIds', [...editor.blocks].map(block => block.id), ['a', 'b'])
      unsupported.push({ property: 'canonicalSnapshotStatus', reason: 'Legacy live PublicBlockView has no canonical snapshot/status contract; actual legacy iterator executes.' }); completedPhases.push(phase)
    } else {
      const iterator = editor.blocks[Symbol.iterator]()
      check(phase, 'firstSnapshot', iterator.next().value, { ...initial[0], status: 'active' }); check(phase, 'initialHistory', [editor.canUndo, editor.canRedo], [false, false]); completedPhases.push(phase)
      phase = 'change'
      if (spec.mutation === 'render') editor.render({ version: '2.0.0', blocks: updated })
      else editor.blocks.remove('b')
      check(phase, 'canonical', editor.save().blocks, updated); check(phase, 'history', [editor.canUndo, editor.canRedo], [true, false]); completedPhases.push(phase)
      phase = 'iterate'
      const retained = iterator.next().value
      check(phase, 'retainedSnapshot', retained, { ...initial[1], status: spec.mutation === 'render' ? 'unregistered' : 'active' })
      check(phase, 'frozenEnvelope', Object.isFrozen(retained), true); check(phase, 'exhausted', iterator.next().done, true)
      check(phase, 'canonicalUnchanged', editor.save().blocks, updated); check(phase, 'historyUnchanged', [editor.canUndo, editor.canRedo], [true, false])
      check(phase, 'oneExplicitAction', transactions, [{ action: 'commit', origin: 'external', name: spec.mutation === 'render' ? 'document.render' : 'block.remove' }]); completedPhases.push(phase)
    }
    phase = 'dispose'; editor.destroy(); check(phase, 'rootRemoved', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
    return { id: spec.id, spec, observations, diagnostics, transactions, unsupported, planned, completedPhases, error: null }
  } catch (error) { return { id: spec.id, spec, observations, diagnostics, transactions, unsupported, planned, completedPhases, phase, error: String(error?.stack ?? error) } }
  finally { editor?.destroy(); holder.remove() }
}
