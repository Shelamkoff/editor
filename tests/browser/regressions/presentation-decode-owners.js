import { createEditor } from '../../../core/index.js'
import { documentValidationIssue } from '../../../shared/documentValidationIssue.js'

const pause = () => new Promise(resolve => setTimeout(resolve, 30))
const copy = value => structuredClone(value)
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b))
import { test, assert } from './harness.js'
function harness() {
  const state = { remaining: 0, active: false, armCreate: false, armUpdate: false, armMode: false,
    calls: [], thrown: [], blocks: [], widgets: [], destroyed: [], transactions: [], diagnostics: [], validation: [] }
  const holder = document.createElement('section'); document.body.append(holder)
  const arm = (kind, name) => {
    if (name !== 'a' || !state[kind]) return
    state[kind] = false; state.active = true; state.calls.push({ kind, boundary: 'after successful ingestion' })
  }
  const block = {
    type: 'decode-owner', icon: '', label: { key: 'title', fallback: 'Decoder owner' },
    schema: { currentVersion: 1, createDefault: () => ({ name: 'a', text: '' }),
      decode: input => ({ dataVersion: 1, data: copy(input.data) }), encode: data => ({ dataVersion: 1, data: copy(data) }),
      mapRichText: (data, visit) => ({ ...data, text: visit(data.text, 'text') }) },
    setup() { return { create(initial, context) {
      let data = copy(initial)
      const root = context.ownerDocument.createElement('div'), field = context.ownerDocument.createElement('div')
      field.contentEditable = String(!context.isReadOnly()); field.innerHTML = data.text; root.append(field)
      const instance = { name: data.name, context, root, field, restoring: context.restoring }; state.blocks.push(instance)
      arm('armCreate', data.name)
      return { element: root, editableFields: () => [{ key: 'text', mode: 'rich-text', element: field }],
        read: () => ({ ...data, text: field.innerHTML }), update(next) { data = copy(next); arm('armUpdate', data.name) },
        setReadOnly(value) { field.contentEditable = String(!value); arm('armMode', data.name) },
        focus() { field.focus() }, destroy() { state.destroyed.push(instance) } }
    }, destroy() {} } },
  }
  const inline = {
    type: 'decode-owner-widget', icon: '', label: { key: 'title', fallback: 'Widget' },
    schema: { currentVersion: 1, createDefault: () => ({ label: '' }),
      decode(input) {
        const label = input.data.label; state.calls.push({ kind: 'decode', label, phase: state.active ? 'projection' : 'ingestion', remaining: state.remaining })
        if (label === 'a-fault' && state.active && state.remaining > 0) {
          state.remaining--; const error = new Error('controlled projection-only decode fault'); error.name = 'ProjectionDecodeProbeError'; state.thrown.push(error); throw error
        }
        return { dataVersion: 1, data: copy(input.data) }
      }, encode: data => ({ dataVersion: 1, data: copy(data) }) },
    setup({ ownerDocument }) { return { create(id, data, context) {
      const element = ownerDocument.createElement('span'); element.contentEditable = 'false'; element.textContent = data.label
      const instance = { id, element, context }; state.widgets.push(instance)
      return { element, update(next) { element.textContent = next.label }, setReadOnly() {}, destroy() { state.destroyed.push(instance) } }
    }, destroy() {} } },
  }
  const data = { version: '2.0.0', blocks: ['a', 'b'].map(name => ({ id: name, type: block.type, dataVersion: 1,
    data: { name, text: '{{' + name + '-safe}} {{' + name + '-fault}}' },
    inline: Object.fromEntries(['safe', 'fault'].map(part => [name + '-' + part, { type: inline.type, dataVersion: 1, data: { label: name + '-' + part } }])) })) }
  let editor
  return { state, holder, data, get editor() { return editor },
    create() { editor = createEditor({ holder, plugins: [block], inlinePlugins: [inline], defaultBlock: block.type, injectStyles: true, data,
      onDiagnostic: item => state.diagnostics.push(item), onValidationError: item => state.validation.push(item) })
      editor.on('transaction:committed', item => state.transactions.push(item)); return editor },
    latest: id => state.widgets.findLast(item => item.id === id),
    latestBlock: name => state.blocks.findLast(item => item.name === name),
    errorInfo(error, depth = 0) { if (!error) return null; return { name: error.name, original: state.thrown.includes(error), issue: documentValidationIssue(error) ?? null,
      errors: depth < 3 && error instanceof AggregateError ? [...error.errors].map(item => this.errorInfo(item, depth + 1)) : undefined } },
    destroy() { editor?.destroy(); holder.remove() },
  }
}
const scenarios = [
  { name: 'initial projection-only decoder failure cleans staged block and partial inline scopes', operation: 'initial', failures: 1 },
  { name: 'render staging decoder failure preserves previous accepted document and scopes', operation: 'render', failures: 1 },
  { name: 'canonical apply decoder failure restores accepted record without history', operation: 'transaction', failures: 1 },
  { name: 'canonical apply and recovery decoder failures stop authoring with accepted data intact', operation: 'transaction', failures: 2 },
  { name: 'mode enable decoder failure restores coherent editable projection', operation: 'mode', failures: 1, next: true },
  { name: 'mode disable decoder failure restores coherent read-only projection', operation: 'mode', failures: 1, next: false },
  { name: 'mode projection and recovery decoder failures stop mutation authority', operation: 'mode', failures: 2, next: true },
]
for (const scenario of scenarios) test(scenario.name, async () => {
  const h = harness(), state = h.state
  let observation = {}
  try {
    if (scenario.operation === 'initial') {
      state.armCreate = true; state.remaining = scenario.failures
      let error; try { h.create() } catch (caught) { error = caught }
      observation = { error: h.errorInfo(error), calls: state.calls, partialWidgets: state.widgets.length,
        blockScopesRetired: state.blocks.every(item => item.context.signal.aborted), widgetScopesRetired: state.widgets.every(item => item.context.signal.aborted), mountedBlocks: h.holder.querySelectorAll('.oe-block').length }
      assert(error === state.thrown[0] && documentValidationIssue(error)?.reason === 'invalid-data', 'Initial acquisition did not expose original classified decode failure')
      assert(state.calls.some(item => item.kind === 'decode' && item.phase === 'ingestion' && item.label === 'a-fault') && state.widgets.length === 1,
        'Fault was not isolated after successful ingestion and partial inline acquisition')
      assert(observation.blockScopesRetired && observation.widgetScopesRetired && observation.mountedBlocks === 0, 'Initial failure left live candidate resources')
    } else {
      const editor = h.create(); await pause()
      if (scenario.operation === 'mode' && scenario.next === false) { editor.setReadOnly(true); await pause() }
      const before = editor.save().blocks, widgetCount = state.widgets.length,
        oldA = h.latest('a-safe'), oldB = h.latest('b-safe'), oldBlock = h.latestBlock('a')
      state.active = false; state.remaining = scenario.failures
      state[scenario.operation === 'render' ? 'armCreate' : scenario.operation === 'transaction' ? 'armUpdate' : 'armMode'] = true
      let error
      try {
        if (scenario.operation === 'render') { const next = copy(h.data); next.blocks[0].data.text += ' replacement'; editor.render(next) }
        else if (scenario.operation === 'transaction') editor.blocks.update('a', current => ({ data: { ...current.data, text: current.data.text + ' changed' } }))
        else editor.setReadOnly(scenario.next)
      } catch (caught) { error = caught }
      await pause()
      const originalFailures = state.thrown.length
      const stable = { data: same(editor.save().blocks, before), noHistory: !editor.canUndo && state.transactions.length === 0 }
      observation = { error: h.errorInfo(error), originalFailures, stable, calls: state.calls, readOnly: editor.readOnly,
        oldAAborted: oldA.context.signal.aborted, oldBlockAborted: oldBlock.context.signal.aborted, oldBAborted: oldB.context.signal.aborted,
        newAConnected: h.latest('a-safe').element.isConnected, restoring: h.latestBlock('a').restoring, diagnostics: state.diagnostics, validation: state.validation }
      assert(Object.values(stable).every(Boolean), 'Decode owner changed accepted data or history')
      if (scenario.failures === 1) {
        assert(error === state.thrown[0] && documentValidationIssue(error)?.reason === 'invalid-data' && originalFailures === 1, 'Single fault did not preserve original classified cause')
        if (scenario.operation === 'render') {
          observation.candidatesRetired = state.widgets.slice(widgetCount).every(item => item.context.signal.aborted)
          assert(!oldA.context.signal.aborted && !oldB.context.signal.aborted && oldA.element.isConnected && oldB.element.isConnected && observation.candidatesRetired,
            'Rejected render replaced or retired accepted predecessor')
        } else {
          assert(oldA.context.signal.aborted && h.latest('a-safe') !== oldA && h.latest('a-safe').element.isConnected
            && h.latest('a-fault').element.isConnected && h.latestBlock('a').restoring, 'Recovery did not replace retired state with coherent owned occurrences')
          if (scenario.operation === 'transaction') assert(!oldB.context.signal.aborted && oldB.element.isConnected, 'Canonical A rollback retired unrelated B scope')
          if (scenario.operation === 'mode') assert(editor.readOnly === !scenario.next, 'Mode recovery changed committed mode')
          if (editor.readOnly) editor.setReadOnly(false)
          let calls = 0; const task = h.latest('a-safe').context.beginTask(), admitted = task.commit(data => { calls++; return data })
          observation.freshTask = { admitted, calls }
          assert(admitted === true && calls === 1, 'Recovered occurrence has no fresh task authority')
        }
      } else {
        assert(error instanceof AggregateError && originalFailures === 2 && [...error.errors].every(item => state.thrown.includes(item)), 'Recovery failure lost primary or secondary decode cause')
        let denied = false, producerCalls = 0
        try { editor.blocks.update('b', current => { producerCalls++; return { data: current.data } }) } catch { denied = true }
        observation.mutationDenied = denied; observation.producerCalls = producerCalls
        assert(denied && producerCalls === 0, 'Failed recovery kept author mutation authority')
        assert(state.widgets.slice(widgetCount).every(item => item.context.signal.aborted), 'Failed recovery left staged inline scopes live')
      }
    }
  } finally { h.destroy(); await pause() }
})
